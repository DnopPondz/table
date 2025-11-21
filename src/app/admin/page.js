"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';
import { User, Shield, Users, Bell, CheckCircle, XCircle, LogOut } from 'lucide-react';

export default function AdminPage() {
  const [role, setRole] = useState(null); 
  const [customerCount, setCustomerCount] = useState(1);
  const [data, setData] = useState({ currentQueue: null, waitingQueues: [] });
  const [loading, setLoading] = useState(false);
  const API_URL = "http://localhost:5000/api";

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_URL}/queue`);
      setData(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (role) {
      fetchData();
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
  }, [role]);

  const apiCall = async (method, endpoint, payload = {}) => {
    if(loading) return;
    setLoading(true);
    try {
      await axios[method](`${API_URL}/queue/${endpoint}`, payload);
      await fetchData();
    } catch(err) { alert('Action failed'); }
    setLoading(false);
  };

  // Login Screen
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-96 text-center">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Select Staff Role</h2>
          <div className="space-y-3">
            <button onClick={() => setRole('admin')} className="w-full p-4 bg-gray-900 text-white rounded-xl flex justify-center gap-2 hover:bg-gray-800"><Shield size={20}/> Manager / Admin</button>
            <button onClick={() => setRole('worker')} className="w-full p-4 bg-red-600 text-white rounded-xl flex justify-center gap-2 hover:bg-red-700"><User size={20}/> Employee</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="flex justify-between items-center mb-8 max-w-6xl mx-auto">
        <div>
            <h1 className="text-2xl font-bold text-gray-800">Queue Management</h1>
            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded uppercase">{role}</span>
        </div>
        <button onClick={() => setRole(null)} className="text-gray-400 hover:text-red-600"><LogOut/></button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        
        {/* CONTROL PANEL */}
        <div className="lg:col-span-1 space-y-4">
            {/* Add Queue */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase"><Users size={16}/> New Customer</h2>
                <div className="flex items-center justify-between bg-gray-100 rounded-lg p-2 mb-4">
                    <button onClick={() => setCustomerCount(Math.max(1, customerCount - 1))} className="w-10 h-10 bg-white rounded shadow-sm font-bold text-xl hover:text-red-600">-</button>
                    <span className="text-xl font-bold text-gray-700">{customerCount}</span>
                    <button onClick={() => setCustomerCount(customerCount + 1)} className="w-10 h-10 bg-white rounded shadow-sm font-bold text-xl hover:text-green-600">+</button>
                </div>
                <button onClick={() => { apiCall('post', 'add', { customerCount }); setCustomerCount(1); }} disabled={loading} className="w-full py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition">
                    + Print Ticket
                </button>
            </div>

            {/* Call Next */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2 uppercase"><Bell size={16}/> Action</h2>
                <button onClick={() => apiCall('put', 'next')} disabled={loading || data.waitingQueues.length === 0} className="w-full py-4 bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-200 hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    CALL NEXT QUEUE
                </button>
            </div>
        </div>

        {/* STATUS PANEL */}
        <div className="lg:col-span-2 space-y-4">
            {/* Active Queue Card */}
            {data.currentQueue && (
                 <div className="bg-white p-6 rounded-2xl shadow-md border-l-8 border-red-500 flex flex-col sm:flex-row justify-between items-center">
                    <div className="text-center sm:text-left mb-4 sm:mb-0">
                        <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Calling Now</span>
                        <h2 className="text-6xl font-black text-gray-800 my-1">
                            {String(data.currentQueue.queueNumber).padStart(3, '0')}
                        </h2>
                        <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{data.currentQueue.customerCount} Customers</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => apiCall('put', `update/${data.currentQueue._id}`, { status: 'seated' })} className="flex flex-col items-center justify-center w-20 h-20 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 border border-green-200 transition">
                            <CheckCircle size={24} /> <span className="text-[10px] font-bold mt-1">SEAT</span>
                        </button>
                        <button onClick={() => apiCall('put', `update/${data.currentQueue._id}`, { status: 'cancelled' })} className="flex flex-col items-center justify-center w-20 h-20 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 border border-red-200 transition">
                            <XCircle size={24} /> <span className="text-[10px] font-bold mt-1">CANCEL</span>
                        </button>
                    </div>
                 </div>
            )}

            {/* Waiting List Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between">
                    <h3 className="font-bold text-gray-700">Waiting List</h3>
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded font-bold text-gray-600">{data.waitingQueues.length} Waiting</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {data.waitingQueues.map((q) => (
                        <div key={q._id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                            <div>
                                <span className="font-bold text-lg text-gray-800">#{String(q.queueNumber).padStart(3, '0')}</span>
                                <span className="ml-3 text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{q.customerCount} ppl</span>
                            </div>
                            {role === 'admin' && (
                                <button onClick={() => { if(confirm('Cancel this queue?')) apiCall('put', `update/${q._id}`, { status: 'cancelled' }) }} className="text-gray-300 hover:text-red-500">
                                    <XCircle size={18}/>
                                </button>
                            )}
                        </div>
                    ))}
                    {data.waitingQueues.length === 0 && <p className="p-8 text-center text-gray-400 text-sm">No customers in line.</p>}
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}