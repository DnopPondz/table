"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';

export default function ClientQueue() {
  const [data, setData] = useState({ currentQueue: null, waitingQueues: [], totalToday: 0 });
  const API_URL = "http://localhost:5000/api"; // ชี้ไปที่ Backend Express

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/queue`);
        setData(res.data);
      } catch (err) { console.error("API Error:", err); }
    };
    fetchData();
    const interval = setInterval(fetchData, 2000); // Update every 2s
    return () => clearInterval(interval);
  }, []);

  const { currentQueue, waitingQueues, totalToday } = data;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden relative">
      
      {/* Background Decor */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-red-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

      <main className="glass-card w-full max-w-lg rounded-3xl p-8 text-center relative z-10">
        <h1 className="text-3xl font-bold text-gray-700 tracking-wider mb-2">BUFFET QUEUE</h1>
        <p className="text-gray-400 mb-8 text-sm">Please wait specifically for your number</p>

        {/* Current Number */}
        <div className="flex justify-center mb-8">
            <div className="w-64 h-64 rounded-full glass-red flex flex-col items-center justify-center animate-pulse-ring border-4 border-red-500/20 relative">
                <span className="text-gray-500 font-medium uppercase text-xs tracking-widest absolute top-10">Now Serving</span>
                {currentQueue ? (
                    <>
                        <span className="text-8xl font-black text-red-600 drop-shadow-sm">
                            {String(currentQueue.queueNumber).padStart(3, '0')}
                        </span>
                        <span className="mt-2 bg-white/60 px-4 py-1 rounded-full text-sm text-gray-600 font-semibold">
                            {currentQueue.customerCount} Person(s)
                        </span>
                    </>
                ) : (
                    <span className="text-4xl text-gray-300 font-bold">--</span>
                )}
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/50 p-4 rounded-xl border border-white/60">
                <p className="text-xs text-gray-500 uppercase font-bold">Waiting</p>
                <p className="text-2xl font-bold text-gray-800">{waitingQueues.length} <span className="text-sm font-normal text-gray-500">Queues</span></p>
            </div>
            <div className="bg-white/50 p-4 rounded-xl border border-white/60">
                <p className="text-xs text-gray-500 uppercase font-bold">Total Today</p>
                <p className="text-2xl font-bold text-gray-800">{totalToday}</p>
            </div>
        </div>

        {/* Waiting List Preview */}
        <div className="text-left">
            <h3 className="text-xs font-bold text-gray-400 mb-3 ml-2 uppercase">Next in Line</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {waitingQueues.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-4">No queues waiting</p>
                ) : (
                    waitingQueues.slice(0, 5).map((q) => (
                        <div key={q._id} className="flex justify-between items-center bg-white/40 p-3 rounded-lg border border-white/50">
                            <span className="font-bold text-gray-700 text-lg">#{String(q.queueNumber).padStart(3, '0')}</span>
                            <span className="text-xs font-medium text-gray-500 bg-white/50 px-2 py-1 rounded">{q.customerCount} ppl</span>
                        </div>
                    ))
                )}
            </div>
        </div>
      </main>
    </div>
  );
}