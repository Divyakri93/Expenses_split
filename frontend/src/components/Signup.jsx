import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import axios from 'axios';

const Signup = () => {
  const { signup, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const [guests, setGuests] = useState([]);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    axios.get('/api/auth/guests')
      .then(res => {
        setGuests(res.data.guests || []);
      })
      .catch(err => console.error(err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await signup(name, email, password, isClaiming ? selectedGuestId : null);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Signup failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <Wallet className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">Create an account</h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && <div className="text-rose-500 text-sm text-center font-medium bg-rose-50 py-2 rounded-lg">{error}</div>}
          <div className="rounded-md shadow-sm space-y-4">
             {guests.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                   <label className="flex items-center space-x-2 cursor-pointer">
                      <input 
                         type="checkbox" 
                         checked={isClaiming} 
                         onChange={e => {
                            setIsClaiming(e.target.checked);
                            if (e.target.checked && guests.length > 0) {
                               setSelectedGuestId(guests[0].id);
                               setName(guests[0].name);
                            }
                         }} 
                         className="rounded text-indigo-600 focus:ring-indigo-500" 
                      />
                      <span className="text-sm font-semibold text-slate-700">Claim existing guest profile</span>
                   </label>
                   
                   {isClaiming && (
                      <div>
                         <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 text-slate-400">Select Guest Name</label>
                         <select 
                            value={selectedGuestId} 
                            onChange={e => {
                               setSelectedGuestId(e.target.value);
                               const g = guests.find(x => x.id === e.target.value);
                               if (g) setName(g.name);
                            }}
                            className="w-full text-sm font-semibold text-slate-800 border border-slate-300 bg-white p-2.5 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                         >
                            {guests.map(g => (
                               <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                         </select>
                      </div>
                   )}
                </div>
             )}
             
             <div>
              <label className="sr-only">Full Name</label>
              <input type="text" required className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} disabled={isClaiming} />
            </div>
            <div>
              <label className="sr-only">Email address</label>
              <input type="email" required className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="sr-only">Password</label>
              <input type="password" required className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-slate-300 placeholder-slate-500 text-slate-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
              Sign up
            </button>
          </div>
          <div className="text-center text-sm">
            <span className="text-slate-500">Already have an account? </span>
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Signup;
