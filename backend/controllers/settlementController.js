const { User, Expense, ExpenseSplit, Guest } = require('../models');
const Big = require('big.js');
Big.RM = 2; // Banker's Rounding (Half-Even)

exports.calculateSettlements = async (req, res) => {
    try {
        const { groupId } = req.params;

        // 1. Fetch all guests for this group to resolve Guest -> User link promotions
        const guests = await Guest.findAll({ where: { group_id: groupId } });
        const guestToUserMap = {};
        guests.forEach(g => {
            if (g.user_id) {
                guestToUserMap[g.id] = g.user_id;
            }
        });

        const getTargetId = (userId, guestId) => {
            if (userId) return `user_${userId}`;
            if (guestId) {
                if (guestToUserMap[guestId]) {
                    return `user_${guestToUserMap[guestId]}`;
                }
                return `guest_${guestId}`;
            }
            return 'unknown';
        };

        // 2. Fetch all expenses for this group
        const expenses = await Expense.findAll({
            where: { group_id: groupId, status: 'active' },
            include: [{ model: ExpenseSplit }]
        });

        const balances = {}; // { prefixedId: netBalance (Big.js) }

        expenses.forEach(exp => {
            const payerId = getTargetId(exp.paid_by_user_id, exp.paid_by_guest_id);
            
            if (!balances[payerId]) balances[payerId] = Big(0);

            balances[payerId] = balances[payerId].plus(exp.amount);

            let totalSplitAmount = Big(0);

            // Deduct from participants
            exp.ExpenseSplits.forEach(split => {
                const pId = getTargetId(split.user_id, split.guest_id);
                if (!balances[pId]) balances[pId] = Big(0);
                
                const share = Big(split.calculated_share_amount);
                totalSplitAmount = totalSplitAmount.plus(share);

                balances[pId] = balances[pId].minus(share);
            });

            // Handle mathematically unallocated debt (due to missing splits or rounding errors)
            const unallocated = Big(exp.amount).minus(totalSplitAmount);
            if (!unallocated.eq(0)) {
                balances[payerId] = balances[payerId].minus(unallocated);
            }
        });

        // Split into debtors and creditors
        const debtors = [];
        const creditors = [];

        Object.keys(balances).forEach(id => {
            const val = balances[id];
            if (val.lt(0)) {
                debtors.push({ id, amount: val.abs() });
            } else if (val.gt(0)) {
                creditors.push({ id, amount: val });
            }
        });

        // Sort descending
        debtors.sort((a, b) => b.amount.minus(a.amount).toNumber());
        creditors.sort((a, b) => b.amount.minus(a.amount).toNumber());

        const settlements = [];

        let d = 0;
        let c = 0;

        while (d < debtors.length && c < creditors.length) {
            const debtor = debtors[d];
            const creditor = creditors[c];

            const minAmount = debtor.amount.lt(creditor.amount) ? debtor.amount : creditor.amount;

            settlements.push({
                from: debtor.id,
                to: creditor.id,
                amount: minAmount.round(4).toNumber()
            });

            debtor.amount = debtor.amount.minus(minAmount);
            creditor.amount = creditor.amount.minus(minAmount);

            if (debtor.amount.eq(0)) d++;
            if (creditor.amount.eq(0)) c++;
        }

        // Map User and Guest IDs to Names for UI
        const users = await User.findAll();
        const nameMap = {};
        users.forEach(u => nameMap[`user_${u.id}`] = u.name);
        guests.forEach(g => {
            nameMap[`guest_${g.id}`] = g.name;
        });

        const namedSettlements = settlements.map(s => ({
            fromName: nameMap[s.from] || 'Unknown',
            toName: nameMap[s.to] || 'Unknown',
            amount: s.amount
        }));

        res.json({ settlements: namedSettlements, rawBalances: balances });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to calculate settlements' });
    }
};

exports.getAuditTrail = async (req, res) => {
    try {
        const { userId } = req.params;
        const { Op } = require('sequelize');

        // Fetch any Guest profiles linked to this User ID
        const linkedGuests = await Guest.findAll({ where: { user_id: userId } });
        const linkedGuestIds = linkedGuests.map(g => g.id);

        // Fetch all expenses where user is payer OR any of their linked guests is payer
        const paidExpenses = await Expense.findAll({
            where: {
                [Op.or]: [
                    { paid_by_user_id: userId },
                    { paid_by_guest_id: { [Op.in]: linkedGuestIds } }
                ],
                status: 'active'
            },
            include: [{ model: ExpenseSplit }]
        });

        const splitExpenses = await ExpenseSplit.findAll({
            where: {
                [Op.or]: [
                    { user_id: userId },
                    { guest_id: { [Op.in]: linkedGuestIds } }
                ]
            },
            include: [{ model: Expense }]
        });

        const auditTrail = [];
        
        // Format Paid
        paidExpenses.forEach(e => {
            auditTrail.push({
                date: e.date,
                description: e.description,
                type: 'PAID',
                original_amount: e.amount,
                currency: e.currency,
                exchange_rate: e.exchange_rate_to_base,
                impact: Number(e.amount) // Increases net balance
            });

            // Calculate if there's any unallocated debt for this expense that falls back to the payer
            let totalSplit = Big(0);
            e.ExpenseSplits.forEach(s => totalSplit = totalSplit.plus(s.calculated_share_amount));
            const unallocated = Big(e.amount).minus(totalSplit);

            if (unallocated.abs().gt(0.0001)) {
                auditTrail.push({
                    date: e.date,
                    description: `${e.description} (Unallocated Error/Rounding)`,
                    type: 'OWE',
                    original_amount: e.amount,
                    currency: e.currency,
                    exchange_rate: e.exchange_rate_to_base,
                    split_share: unallocated.toNumber(),
                    impact: unallocated.times(-1).toNumber()
                });
            }
        });

        // Format Splits
        splitExpenses.forEach(s => {
            const e = s.Expense;
            if (e.status !== 'active') return;
            auditTrail.push({
                date: e.date,
                description: e.description,
                type: 'OWE',
                original_amount: e.amount,
                currency: e.currency,
                exchange_rate: e.exchange_rate_to_base,
                split_share: s.calculated_share_amount,
                impact: -s.calculated_share_amount // Decreases net balance
            });
        });

        // Sort by date
        auditTrail.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({ auditTrail });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch audit trail' });
    }
};
