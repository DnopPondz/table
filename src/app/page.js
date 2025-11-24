"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Monitor, Maximize2, Minimize2 } from 'lucide-react'; // Icons for TV Mode

export default function ClientQueue() {
  const [data, setData] = useState({ currentQueue: null, waitingQueues: [], totalToday: 0 });
  const [isTVMode, setIsTVMode] = useState(false); // Toggle TV Mode
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
  const SOCKET_URL = "http://localhost:5000"; // Socket URL (usually root of API)

  // --- Voice Notification ---
  const speak = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH'; // ภาษาไทย
      utterance.rate = 0.9; // ความเร็ว
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    // 1. Initial Fetch
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_URL}/queue`);
        setData(res.data);
      } catch (err) { console.error("API Error:", err); }
    };
    fetchData();

    // 2. Setup Socket
    const socket = io(SOCKET_URL);

    socket.on('update-data', (newData) => {
      // เช็คว่ามีการเปลี่ยนเลขคิวปัจจุบันหรือไม่ เพื่อแจ้งเตือนเสียง
      setData((prevData) => {
        if (newData.currentQueue?.queueNumber !== prevData.currentQueue?.queueNumber) {
          if (newData.currentQueue) {
            speak(`ขอเชิญหมายเลข ${newData.currentQueue.queueNumber} ค่ะ`);
          }
        }
        return newData;
      });
    });

    return () => socket.disconnect();
  }, []);

  const { currentQueue, waitingQueues, totalToday } = data;

  // --- TV MODE UI ---
  if (isTVMode) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col p-10 overflow-hidden relative">
        <button onClick={() => setIsTVMode(false)} className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full opacity-20 hover:opacity-100 transition"><Minimize2 size={24}/></button>
        
        {/* Header */}
        <header className="flex justify-between items-end border-b-2 border-gray-700 pb-6 mb-10">
            <h1 className="text-5xl font-black tracking-wider text-red-500">NOW SERVING</h1>
            <div className="text-right">
                <p className="text-2xl text-gray-400">Total Today</p>
                <p className="text-4xl font-bold">{totalToday}</p>
            </div>
        </header>

        <div className="flex flex-1 gap-12">
            {/* Left: Current Queue (Huge) */}
            <div className="w-2/3 flex flex-col items-center justify-center bg-gray-900 rounded-3xl border-4 border-red-600 relative shadow-2xl shadow-red-900/50">
                <p className="text-4xl font-bold text-gray-400 uppercase mb-8">Queue Number</p>
                {currentQueue ? (
                    <>
                        <span className="text-[250px] font-black leading-none text-white drop-shadow-lg">
                            {String(currentQueue.queueNumber).padStart(3, '0')}
                        </span>
                        <span className="text-5xl mt-8 bg-red-600 px-8 py-2 rounded-xl font-bold">
                            {currentQueue.customerCount} Person(s)
                        </span>
                    </>
                ) : (
                    <span className="text-9xl font-bold text-gray-600">--</span>
                )}
            </div>

            {/* Right: Waiting List */}
            <div className="w-1/3 bg-gray-900 rounded-3xl p-8 border border-gray-800 flex flex-col">
                <h2 className="text-4xl font-bold text-yellow-500 mb-8 border-b border-gray-700 pb-4">NEXT QUEUE</h2>
                <div className="space-y-4 flex-1 overflow-hidden">
                    {waitingQueues.slice(0, 4).map((q, i) => (
                        <div key={q._id} className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl border border-gray-700">
                            <span className="text-6xl font-bold text-white">#{String(q.queueNumber).padStart(3, '0')}</span>
                            <span className="text-2xl text-gray-400 font-medium">{q.customerCount} ppl</span>
                        </div>
                    ))}
                    {waitingQueues.length === 0 && <p className="text-3xl text-gray-600 text-center mt-20">No queues waiting</p>}
                </div>
                <div className="mt-auto pt-4 border-t border-gray-700">
                    <p className="text-center text-2xl text-gray-500">Please wait specifically for your number</p>
                </div>
            </div>
        </div>
      </div>
    );
  }

  // --- NORMAL MOBILE UI ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden relative">
      <button onClick={() => setIsTVMode(true)} className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-md text-gray-500 hover:text-red-600 transition z-50"><Monitor size={20}/></button>
      
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