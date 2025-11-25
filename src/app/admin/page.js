"use client";
import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client'; // เพิ่ม Socket.io
import QRCode from 'qrcode';
import { 
  User, Shield, Users, Bell, CheckCircle, XCircle, LogOut, Lock, Unlock, 
  LayoutDashboard, List, UserPlus, Trash2, DollarSign, TrendingUp, 
  PieChart, History, Calendar as CalendarIcon, Clock, Timer, StopCircle, PlayCircle,
  Edit, Save, X, Search, Filter, Grid, Plus, Receipt, Settings
} from 'lucide-react';

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function AdminPage() {
  // --- States ---
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [username, setUsername] = useState('');
  const [activeTab, setActiveTab] = useState('queue'); 
  const [loading, setLoading] = useState(false);

  // Login
  const [inputUser, setInputUser] = useState('');
  const [inputPass, setInputPass] = useState('');

  // Data
  const [customerCount, setCustomerCount] = useState(1);
  const [queueData, setQueueData] = useState({ currentQueue: null, waitingQueues: [] });
  const [reports, setReports] = useState({ daily: {}, monthly: {}, yearly: {} });
  const [logs, setLogs] = useState([]);
  const [logDate, setLogDate] = useState(new Date());
  
  // **NEW: Table Management Data**
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]); // NEW
  const [newTable, setNewTable] = useState({ tableNumber: '', capacity: 4 });
  const [newRes, setNewRes] = useState({ customerName: '', customerPhone: '', reservationTime: '', pax: 2, tableId: '' }); // NEW
  const [showResForm, setShowResForm] = useState(false); // NEW
  
  // **NEW: Shift Data**
  const [shifts, setShifts] = useState([]);
  const [cashInDrawer, setCashInDrawer] = useState('');
  const [shiftNote, setShiftNote] = useState('');

  // Users & Attendance Data
  const [users, setUsers] = useState([]); 
  const [userList, setUserList] = useState([]); 
  const [staffStatus, setStaffStatus] = useState([]); 
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'worker' });
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');

  // Edit Time State
  const [editingId, setEditingId] = useState(null);
  const [editTimes, setEditTimes] = useState({ checkIn: '', checkOut: '' });

  // My Attendance (For Worker)
  const [myAttendance, setMyAttendance] = useState(null);
  const [workDuration, setWorkDuration] = useState("0h 0m 0s");

  // Settings State
  const [settings, setSettings] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Configuration
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
  const SOCKET_URL = "http://localhost:5000";

  // --- Helpers ---
  const formatDateForAPI = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTime = (isoString) => {
    if(!isoString) return '-';
    return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  };

  const getHHMM = (isoString) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  const msToTimeHTML = (duration) => {
    let seconds = Math.floor((duration / 1000) % 60);
    let minutes = Math.floor((duration / (1000 * 60)) % 60);
    let hours = Math.floor((duration / (1000 * 60 * 60)));
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  // **NEW: Print Ticket Function**
  const printQueueTicket = async (queue) => {
    // Generate QR Code
    const qrText = `${window.location.origin}/queue/status/${queue._id}`;
    let qrDataUrl = '';
    try {
        qrDataUrl = await QRCode.toDataURL(qrText, { width: 100, margin: 0 });
    } catch (err) {
        console.error(err);
    }

    const printWindow = window.open('', '', 'width=300,height=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Queue Ticket</title>
          <style>
            @page { margin: 0; size: 58mm auto; }
            body {
                margin: 0;
                padding: 5mm;
                width: 48mm; /* 58mm - margins */
                font-family: 'Courier New', monospace;
                text-align: center;
                color: black;
                background: white;
            }
            h1 { font-size: 32px; margin: 10px 0; font-weight: 900; }
            h2 { font-size: 16px; margin: 5px 0; font-weight: bold; text-transform: uppercase; }
            p { margin: 2px 0; font-size: 12px; }
            .divider { border-top: 1px dashed black; margin: 10px 0; width: 100%; }
            .qr-container { margin: 15px 0; display: flex; justify-content: center; }
            .footer { font-size: 10px; margin-top: 15px; }
            img { display: block; margin: 0 auto; }
          </style>
        </head>
        <body>
          <h2>Buffet POS</h2>
          <div class="divider"></div>
          <p>QUEUE NUMBER</p>
          <h1>#${String(queue.queueNumber).padStart(3, '0')}</h1>
          <p>${queue.customerCount} Person(s)</p>
          <div class="divider"></div>

          <div class="qr-container">
            <img src="${qrDataUrl}" width="100" height="100" />
          </div>
          <p>Scan to check status</p>

          <div class="divider"></div>
          <p class="footer">${new Date().toLocaleString('th-TH')}</p>
          <script>
            window.onload = function() {
                window.print();
                setTimeout(function(){ window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // --- Initialization ---
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      setRole(localStorage.getItem('role'));
      setUsername(localStorage.getItem('username'));
    }
  }, []);

  // --- Real-time Fetching & Socket ---
  useEffect(() => {
    if (!token) return;
    
    // Initial Fetch
    fetchQueue(); 
    if (activeTab === 'tables') { fetchTables(); fetchReservations(); }
    if (activeTab === 'shift') { fetchReports(); fetchShifts(); }
    if (activeTab === 'logs') fetchLogs(); 
    if (activeTab === 'users' && !editingId) fetchStaffStatus(); 
    if (role === 'worker') fetchMyAttendance();

    // **Socket Listener**
    const socket = io(SOCKET_URL);
    socket.on('update-data', (data) => {
      if (data.currentQueue || data.waitingQueues) {
        setQueueData({ currentQueue: data.currentQueue, waitingQueues: data.waitingQueues || [] });
      }
      if (data.tables) setTables(data.tables);
      if (data.reservations) setReservations(data.reservations); // NEW
    });

    return () => socket.disconnect();
  }, [token, activeTab, logDate, editingId]); 

  // --- WORK TIMER LOGIC ---
  useEffect(() => {
    let timerInterval;
    if (myAttendance?.checkIn && !myAttendance?.checkOut) {
        timerInterval = setInterval(() => {
            const now = new Date().getTime();
            const checkInTime = new Date(myAttendance.checkIn).getTime();
            const diff = now - checkInTime;
            setWorkDuration(msToTimeHTML(diff));
        }, 1000);
    } else {
        setWorkDuration("0h 0m 0s");
    }
    return () => clearInterval(timerInterval);
  }, [myAttendance]);

  const authHeaders = { headers: { Authorization: token } };

  const checkAuthError = (e) => {
    console.error(e);
    if (e.response && (e.response.status === 400 || e.response.status === 401 || e.response.status === 403)) {
        handleLogout();
    }
  };

  // --- API Fetchers ---
  const fetchQueue = async () => { try { const res = await axios.get(`${API_URL}/queue`); setQueueData(res.data); } catch (e) { console.error(e); } };
  const fetchTables = async () => { try { const res = await axios.get(`${API_URL}/tables`); setTables(res.data); } catch (e) { console.error(e); } };
  const fetchReservations = async () => { try { const res = await axios.get(`${API_URL}/reservations`, authHeaders); setReservations(res.data); } catch (e) { console.error(e); } }; // NEW
  const fetchReports = async () => { try { const res = await axios.get(`${API_URL}/reports`, authHeaders); setReports(res.data); } catch (e) { checkAuthError(e); } };
  const fetchShifts = async () => { try { const res = await axios.get(`${API_URL}/shift/history`, authHeaders); setShifts(res.data); } catch (e) { checkAuthError(e); } };
  const fetchLogs = async () => { try { const res = await axios.get(`${API_URL}/logs?date=${formatDateForAPI(logDate)}`, authHeaders); setLogs(res.data); } catch (e) { checkAuthError(e); } };
  const fetchStaffStatus = async () => { try { const res = await axios.get(`${API_URL}/attendance/today`, authHeaders); setStaffStatus(res.data); const u = await axios.get(`${API_URL}/users`, authHeaders); setUserList(u.data); } catch (e) { checkAuthError(e); } };
  const fetchMyAttendance = async () => { try { const res = await axios.get(`${API_URL}/attendance/me`, authHeaders); setMyAttendance(res.data); } catch (e) { checkAuthError(e); } };

  // Settings Fetcher
  useEffect(() => {
    if (activeTab === 'settings' && token) {
      fetchSettings();
    }
  }, [activeTab, token]);

  const fetchSettings = async () => {
    try {
      setSettingsLoading(true);
      const res = await axios.get(`${API_URL}/settings`);
      setSettings(res.data);
      setSettingsLoading(false);
    } catch (e) {
      console.error(e);
      setSettingsLoading(false);
    }
  };

  const updateSettings = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API_URL}/settings`, settings, authHeaders);
      alert('Settings Updated!');
    } catch (e) {
      alert('Error updating settings');
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value: value } : s));
  };

  // --- Actions ---
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/auth/login`, { username: inputUser, password: inputPass });
      const { token, role, username } = res.data;
      localStorage.setItem('token', token); localStorage.setItem('role', role); localStorage.setItem('username', username);
      setToken(token); setRole(role); setUsername(username);
    } catch (err) { alert('Login failed'); }
  };
  const handleLogout = () => {
    localStorage.clear(); setToken(null); setRole(null); setUsername('');
  };

  // Queue Actions
  const addQueue = async () => {
    if(loading) return; setLoading(true);
    try { 
        const res = await axios.post(`${API_URL}/queue/add`, { customerCount }, authHeaders); 
        printQueueTicket(res.data); 
        setCustomerCount(1); 
    } 
    catch(e) { alert('Error'); } 
    setLoading(false);
  };
  const nextQueue = async () => {
    if(loading) return; setLoading(true);
    try { await axios.put(`${API_URL}/queue/next`, {}, authHeaders); } 
    catch(e) { alert(e.response?.data?.message); } setLoading(false);
  };
  const updateQueue = async (id, status) => {
    if(!confirm(`Confirm ${status}?`)) return;
    try { await axios.put(`${API_URL}/queue/update/${id}`, { status }, authHeaders); } catch(e) { alert('Error'); }
  };
  const clearQueues = async () => {
    if(!confirm('Clear ALL waiting queues?')) return;
    try { await axios.delete(`${API_URL}/queue/reset`, authHeaders); } catch(e) { alert('Error'); }
  };

  // Table Actions
  const createTable = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_URL}/tables`, newTable, authHeaders); setNewTable({tableNumber:'', capacity:4}); alert('Table Created'); fetchTables(); } 
    catch(e){alert('Error');}
  };
  const assignTable = async (tableId, queueId = null) => {
    try { await axios.put(`${API_URL}/tables/${tableId}/assign`, { queueId }, authHeaders); fetchTables(); } 
    catch(e){alert('Error');}
  };
  const deleteTable = async (id) => {
    if(confirm('Delete Table?')) try { await axios.delete(`${API_URL}/tables/${id}`, authHeaders); fetchTables(); } catch(e){}
  };

  // Reservation Actions
  const createReservation = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_URL}/reservations`, newRes, authHeaders); setShowResForm(false); setNewRes({customerName:'', customerPhone:'', reservationTime:'', pax:2, tableId:''}); fetchReservations(); alert('Reservation Added'); }
    catch(e) { alert('Error'); }
  };
  const cancelReservation = async (id) => {
    if(!confirm('Cancel this reservation?')) return;
    try { await axios.put(`${API_URL}/reservations/${id}/cancel`, {}, authHeaders); fetchReservations(); } catch(e){ alert('Error'); }
  };
  const checkInReservation = async (id) => {
    if(!confirm('Check In Customer? This will occupy the table.')) return;
    try { await axios.put(`${API_URL}/reservations/${id}/checkin`, {}, authHeaders); fetchReservations(); fetchTables(); } catch(e){ alert(e.response?.data?.message || 'Error'); }
  };

  // Shift Actions
  const closeShift = async () => {
    if(!confirm('Close Shift now?')) return;
    try { await axios.post(`${API_URL}/shift/close`, { cashInDrawer, note: shiftNote }, authHeaders); alert('Shift Closed!'); fetchShifts(); setCashInDrawer(''); setShiftNote(''); } 
    catch(e){alert('Error');}
  };

  // User Actions
  const createUser = async (e) => {
    e.preventDefault();
    try { await axios.post(`${API_URL}/users`, newUser, authHeaders); fetchStaffStatus(); setNewUser({username:'', password:'', role:'worker'}); alert('User added'); }
    catch(e) { alert('Error adding user'); }
  };
  const deleteUser = async (id) => {
    if(!confirm('Delete this user?')) return;
    try { await axios.delete(`${API_URL}/users/${id}`, authHeaders); fetchStaffStatus(); } catch(e) { alert('Error'); }
  };

  // Attendance Actions
  const checkIn = async () => {
    if(!confirm('Start working now?')) return;
    try { await axios.post(`${API_URL}/attendance/checkin`, {}, authHeaders); fetchMyAttendance(); } catch(e) { alert(e.response?.data?.message); }
  };
  const checkOut = async () => {
    if(!confirm('Finish work and Clock Out?')) return;
    try { await axios.put(`${API_URL}/attendance/checkout`, {}, authHeaders); fetchMyAttendance(); } catch(e) { alert(e.response?.data?.message); }
  };
  const handleAutoCheckout = async () => {
    try { await axios.put(`${API_URL}/attendance/checkout`, {}, authHeaders); fetchMyAttendance(); alert("Auto Check-out (8 Hours Limit)"); } 
    catch(e) { console.error(e); }
  };
  
  const resetAttendance = async (userId) => {
    if(!confirm('Unlock this user to Resume Shift? (Clear Check-out time)')) return;
    try { 
        await axios.put(`${API_URL}/attendance/reset/${userId}`, {}, authHeaders); 
        fetchStaffStatus(); 
    } catch(e) { alert('Error resetting attendance'); }
  };

  // Save Edited Time
  const startEditing = (userId, currentAttendance) => {
    setEditingId(userId);
    setEditTimes({
        checkIn: currentAttendance ? getHHMM(currentAttendance.checkIn) : '',
        checkOut: currentAttendance ? getHHMM(currentAttendance.checkOut) : ''
    });
  };

  const saveTime = async (userId) => {
    try {
        await axios.put(`${API_URL}/attendance/edit/${userId}`, {
            checkInTime: editTimes.checkIn,
            checkOutTime: editTimes.checkOut
        }, authHeaders);
        setEditingId(null);
        fetchStaffStatus(); 
    } catch(e) {
        alert('Error updating time');
    }
  };

  // Merge User List and Attendance Status for Unified Table
  const getMergedUserList = () => {
    return userList.filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase())).map(user => {
        // Find status from staffStatus list
        const statusInfo = staffStatus.find(s => s._id === user._id);
        return {
            ...user,
            attendance: statusInfo?.attendance || null
        };
    });
  };

  const StatusBadge = ({ status }) => {
    const colors = { waiting: 'bg-gray-100 text-gray-600', called: 'bg-blue-100 text-blue-600', seated: 'bg-green-100 text-green-600', cancelled: 'bg-red-100 text-red-600' };
    return <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${colors[status] || colors.waiting}`}>{status}</span>;
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-96 text-center border border-gray-200">
          <div className="mb-6 flex justify-center"><div className="p-4 bg-red-50 rounded-full"><Lock size={32} className="text-red-600"/></div></div>
          <h2 className="text-xl font-bold mb-6 text-gray-800">Staff Portal Login</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input className="w-full p-3 border border-gray-200 rounded-xl" placeholder="Username" value={inputUser} onChange={e=>setInputUser(e.target.value)} required/>
            <input className="w-full p-3 border border-gray-200 rounded-xl" type="password" placeholder="Password" value={inputPass} onChange={e=>setInputPass(e.target.value)} required/>
            <button className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">LOGIN</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Navbar */}
      <div className="bg-white px-6 py-4 sticky top-0 z-50 shadow-sm border-b flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6 w-full md:w-auto justify-between">
            <div className="flex items-center gap-2">
                <div className="bg-red-600 text-white p-2 rounded-lg"><LayoutDashboard size={20}/></div>
                <h1 className="text-xl font-bold text-gray-800">BUFFET<span className="text-red-600">POS</span></h1>
            </div>
            <nav className="flex gap-2 bg-gray-100 p-1 rounded-lg overflow-x-auto">
                <button onClick={() => setActiveTab('queue')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'queue' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <List size={16}/> Queue
                </button>
                {role === 'worker' && (
                    <button onClick={() => setActiveTab('timeclock')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'timeclock' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Clock size={16}/> Time Clock
                    </button>
                )}
                {role === 'admin' && (
                    <>
                    <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'tables' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Grid size={16}/> Tables
                    </button>
                    <button onClick={() => setActiveTab('shift')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'shift' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Receipt size={16}/> Shift
                    </button>
                    <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <TrendingUp size={16}/> Reports
                    </button>
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'logs' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <History size={16}/> Logs
                    </button>
                    <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'users' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Users size={16}/> Staff
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition whitespace-nowrap ${activeTab === 'settings' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Settings size={16}/> Settings
                    </button>
                    </>
                )}
            </nav>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
                <p className="text-xs text-gray-400 uppercase font-bold">Logged in as</p>
                <p className="text-sm font-bold text-gray-700">{username}</p>
            </div>
            <button onClick={handleLogout} className="bg-gray-100 p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition"><LogOut size={20}/></button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6">
        
        {/* --- TAB: QUEUE CONTROL --- */}
        {activeTab === 'queue' && (
            <>
            {role === 'worker' && (!myAttendance?.checkIn || myAttendance?.checkOut) ? (
                <div className="flex flex-col items-center justify-center h-[60vh] bg-white rounded-2xl shadow-sm border border-gray-100 text-center p-8">
                    <div className="p-6 bg-red-50 rounded-full mb-6 animate-bounce">
                        <Lock size={64} className="text-red-600" />
                    </div>
                    <h2 className="text-3xl font-black text-gray-800 mb-2">Access Locked</h2>
                    <p className="text-gray-500 mb-8 max-w-md">
                        You must <b>Clock In</b> before accessing the Queue Management system. <br/>
                        Please start your shift to proceed.
                    </p>
                    <button onClick={() => setActiveTab('timeclock')} className="px-8 py-4 bg-red-600 text-white rounded-xl font-bold text-lg shadow-xl shadow-red-200 hover:bg-red-700 transition transform hover:scale-105 flex items-center gap-2">
                        <Clock size={24} /> Go to Time Clock
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in duration-300">
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-sm font-bold text-gray-400 uppercase mb-4">Walk-In Customer</h2>
                            <div className="flex items-center justify-between bg-gray-50 p-2 rounded-xl mb-4">
                                <button onClick={() => setCustomerCount(Math.max(1, customerCount-1))} className="w-10 h-10 bg-white shadow rounded-lg text-lg font-bold hover:text-red-600">-</button>
                                <span className="text-3xl font-bold text-gray-800">{customerCount}</span>
                                <button onClick={() => setCustomerCount(customerCount+1)} className="w-10 h-10 bg-white shadow rounded-lg text-lg font-bold hover:text-green-600">+</button>
                            </div>
                            <button onClick={addQueue} disabled={loading} className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition">+ Issue Queue</button>
                        </div>
                        <div className="bg-red-600 p-6 rounded-2xl shadow-lg text-white">
                            <h2 className="text-sm font-bold text-red-100 uppercase mb-2">Queue Caller</h2>
                            <button onClick={nextQueue} disabled={loading || queueData.waitingQueues.length === 0} className="w-full py-4 bg-white text-red-600 rounded-xl font-black text-lg shadow-sm">CALL NEXT</button>
                        </div>
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                        {queueData.currentQueue ? (
                            <div className="bg-white p-8 rounded-2xl shadow-md border-l-8 border-red-500 flex flex-col md:flex-row justify-between items-center">
                                <div className="mb-6 md:mb-0">
                                    <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">Now Serving</span>
                                    <h2 className="text-7xl font-black text-gray-800 mt-2">{String(queueData.currentQueue.queueNumber).padStart(3, '0')}</h2>
                                    <p className="text-gray-500">{queueData.currentQueue.customerCount} Customers</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => updateQueue(queueData.currentQueue._id, 'seated')} className="w-24 h-24 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 border border-green-200 flex flex-col items-center justify-center"><CheckCircle size={32}/><span className="text-xs font-bold mt-1">SEAT</span></button>
                                    <button onClick={() => updateQueue(queueData.currentQueue._id, 'cancelled')} className="w-24 h-24 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 border border-red-200 flex flex-col items-center justify-center"><XCircle size={32}/><span className="text-xs font-bold mt-1">CANCEL</span></button>
                                </div>
                            </div>
                        ) : ( <div className="bg-white p-8 rounded-2xl shadow-sm border border-dashed text-center text-gray-400">No Active Queue</div> )}
                        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                            <div className="p-4 bg-gray-50 border-b flex justify-between font-bold text-gray-700">
                                <span>Waiting List</span>
                                <div className="flex gap-4">
                                    <span>{queueData.waitingQueues.length} Waiting</span>
                                    {/* Reset Button */}
                                    {role === 'admin' && (
                                        <button onClick={clearQueues} className="text-xs text-red-400 hover:text-red-600 underline">
                                            Reset List
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                                {queueData.waitingQueues.map(q => (
                                    <div key={q._id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                                        <span className="font-bold text-xl text-gray-800">#{String(q.queueNumber).padStart(3,'0')} <span className="text-sm font-normal text-gray-500 ml-2">({q.customerCount} ppl)</span></span>
                                        {role === 'admin' && <button onClick={() => updateQueue(q._id, 'cancelled')} className="text-gray-300 hover:text-red-500"><XCircle size={20}/></button>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </>
        )}

        {/* --- TAB: TABLES & RESERVATIONS (UPDATED UI) --- */}
        {activeTab === 'tables' && role === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in zoom-in duration-300">
                {/* Left Column: Create Table & Reservations List */}
                <div className="space-y-6">
                    {/* Create Table */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
                        <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Plus size={20}/> New Table</h3>
                        <form onSubmit={createTable} className="space-y-4">
                            <input className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Table No. (e.g. T1)" value={newTable.tableNumber} onChange={e=>setNewTable({...newTable, tableNumber:e.target.value})} required/>
                            <input type="number" className="w-full p-2 border rounded-lg bg-gray-50" placeholder="Capacity" value={newTable.capacity} onChange={e=>setNewTable({...newTable, capacity:e.target.value})} required/>
                            <button className="w-full py-2 bg-black text-white rounded-lg font-bold hover:bg-gray-800">Create</button>
                        </form>
                    </div>

                    {/* Reservations Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2"><CalendarIcon size={16}/> Reservations</h3>
                            <button onClick={()=>setShowResForm(!showResForm)} className="text-xs bg-black text-white px-2 py-1 rounded font-bold hover:bg-gray-800">{showResForm?'Cancel':'+ New'}</button>
                        </div>

                        {/* New Reservation Form */}
                        {showResForm && (
                            <form onSubmit={createReservation} className="p-4 border-b bg-gray-50 space-y-2">
                                <input className="w-full p-2 border rounded text-xs" placeholder="Name" value={newRes.customerName} onChange={e=>setNewRes({...newRes, customerName:e.target.value})} required/>
                                <input className="w-full p-2 border rounded text-xs" placeholder="Phone" value={newRes.customerPhone} onChange={e=>setNewRes({...newRes, customerPhone:e.target.value})}/>
                                <input className="w-full p-2 border rounded text-xs" type="datetime-local" value={newRes.reservationTime} onChange={e=>setNewRes({...newRes, reservationTime:e.target.value})} required/>
                                <div className="flex gap-2">
                                    <input className="w-1/2 p-2 border rounded text-xs" type="number" placeholder="Pax" value={newRes.pax} onChange={e=>setNewRes({...newRes, pax:e.target.value})} required/>
                                    <select className="w-1/2 p-2 border rounded text-xs" value={newRes.tableId} onChange={e=>setNewRes({...newRes, tableId:e.target.value})}>
                                        <option value="">Any Table</option>
                                        {tables.map(t => <option key={t._id} value={t._id}>{t.tableNumber} ({t.capacity})</option>)}
                                    </select>
                                </div>
                                <button className="w-full py-2 bg-red-600 text-white rounded text-xs font-bold">Save Reservation</button>
                            </form>
                        )}

                        {/* Reservation List */}
                        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
                            {reservations.length === 0 && <p className="p-4 text-xs text-gray-400 text-center">No upcoming reservations</p>}
                            {reservations.map(r => (
                                <div key={r._id} className="p-4 hover:bg-gray-50">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-gray-800 text-sm">{r.customerName}</span>
                                        <span className="text-xs font-bold text-red-500 bg-red-50 px-2 rounded-full">{new Date(r.reservationTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2">
                                        {new Date(r.reservationTime).toDateString()} • {r.pax} Pax • {r.tableId ? `Table ${r.tableId.tableNumber}` : 'No Table'}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={()=>checkInReservation(r._id)} className="flex-1 py-1 bg-green-100 text-green-700 rounded text-xs font-bold hover:bg-green-200">Check In</button>
                                        <button onClick={()=>cancelReservation(r._id)} className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs hover:bg-gray-200"><X size={14}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column: Table Grid */}
                <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 content-start">
                    {tables.map(t => {
                        // Check if this table has an UPCOMING reservation today (pending)
                        const upcomingRes = reservations.find(r => r.tableId && r.tableId._id === t._id && r.status === 'pending');

                        return (
                            <div key={t._id} className={`relative p-4 rounded-xl border-2 ${t.status==='occupied'?'border-red-500 bg-red-50':'border-green-500 bg-white'} flex flex-col justify-between h-48 transition hover:shadow-md`}>
                                {/* Header: Table No & Capacity */}
                                <div className="flex justify-between items-start">
                                    <span className={`font-black text-3xl ${t.status==='occupied'?'text-red-600':'text-green-600'}`}>{t.tableNumber}</span>
                                    <span className="text-xs text-gray-400 flex items-center gap-1"><Users size={12}/> {t.capacity}</span>
                                </div>

                                {/* Reservation Badge */}
                                {upcomingRes && t.status !== 'occupied' && (
                                    <div className="absolute top-2 right-8 bg-orange-100 text-orange-600 px-2 py-0.5 rounded text-[10px] font-bold border border-orange-200 flex items-center gap-1">
                                        <Clock size={10}/> {new Date(upcomingRes.reservationTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                    </div>
                                )}

                                {t.status === 'occupied' ? (
                                    <div>
                                        <p className="text-[10px] text-red-400 uppercase font-bold tracking-widest mb-2">OCCUPIED</p>

                                        {/* --- Queue & Price Info (NEW) --- */}
                                        {t.currentQueueId ? (
                                            <div className="mb-3 bg-white/60 p-2 rounded-lg border border-red-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs text-gray-500 font-bold uppercase">Queue</span>
                                                    <span className="text-lg font-black text-gray-800">
                                                        #{String(t.currentQueueId.queueNumber).padStart(3, '0')}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center border-t border-red-100 pt-1">
                                                    <span className="text-xs text-gray-500 font-bold uppercase">Total</span>
                                                    <span className="text-sm font-bold text-green-600">
                                                        {t.currentQueueId.totalPrice.toLocaleString()} ฿
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 mb-3">No Queue Data</p>
                                        )}
                                        {/* -------------------------------------- */}

                                        <button onClick={()=>assignTable(t._id, null)} className="w-full py-2 bg-red-600 text-white text-xs rounded-lg font-bold hover:bg-red-700 shadow-sm transition transform active:scale-95">Check Bill</button>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-[10px] text-green-400 uppercase font-bold tracking-widest mb-2">AVAILABLE</p>
                                        {queueData.currentQueue ? (
                                            <button onClick={()=>assignTable(t._id, queueData.currentQueue._id)} className="w-full py-2 bg-green-600 text-white text-xs rounded-lg font-bold hover:bg-green-700 shadow-sm transition transform active:scale-95">Assign Queue</button>
                                        ) : <div className="w-full py-2 bg-gray-100 text-gray-400 text-xs rounded-lg font-bold text-center cursor-not-allowed">No Queue</div>}
                                    </div>
                                )}

                                {t.status !== 'occupied' && <button onClick={()=>deleteTable(t._id)} className="absolute top-2 right-2 text-gray-200 hover:text-red-400 transition"><Trash2 size={14}/></button>}
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* --- TAB: SHIFT --- */}
        {activeTab === 'shift' && role === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in zoom-in duration-300">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Receipt size={24}/> Close Shift</h3>
                    <div className="bg-gray-50 p-6 rounded-xl mb-6 text-center">
                        <p className="text-gray-500 text-sm uppercase font-bold">System Total Today</p>
                        <h2 className="text-5xl font-black text-gray-800 mt-2">{reports.daily?.totalRevenue?.toLocaleString()} ฿</h2>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-bold text-gray-500">Cash in Drawer</label>
                            <input type="number" className="w-full p-3 border rounded-xl text-xl font-bold" placeholder="0.00" value={cashInDrawer} onChange={e=>setCashInDrawer(e.target.value)}/>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-gray-500">Note</label>
                            <textarea className="w-full p-3 border rounded-xl" placeholder="Remarks..." value={shiftNote} onChange={e=>setShiftNote(e.target.value)}></textarea>
                        </div>
                        <button onClick={closeShift} disabled={!cashInDrawer} className="w-full py-4 bg-red-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-red-700 disabled:opacity-50">CLOSE SHIFT</button>
                    </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b font-bold text-gray-700">Shift History</div>
                    <div className="overflow-y-auto max-h-[500px]">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-gray-400 border-b uppercase"><tr><th className="p-4">Date</th><th className="p-4">By</th><th className="p-4 text-right">System</th><th className="p-4 text-right">Actual</th><th className="p-4 text-right">Diff</th></tr></thead>
                            <tbody>
                                {shifts.map(s => (
                                    <tr key={s._id} className="hover:bg-gray-50">
                                        <td className="p-4">{new Date(s.date).toLocaleDateString('th-TH')}</td>
                                        <td className="p-4">{s.closedBy?.username}</td>
                                        <td className="p-4 text-right">{s.systemTotal.toLocaleString()}</td>
                                        <td className="p-4 text-right">{s.cashInDrawer.toLocaleString()}</td>
                                        <td className={`p-4 text-right font-bold ${s.variance < 0 ? 'text-red-600' : s.variance > 0 ? 'text-green-600' : 'text-gray-400'}`}>{s.variance > 0 ? '+' : ''}{s.variance.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* --- TAB: WORKER TIME CLOCK --- */}
        {activeTab === 'timeclock' && role === 'worker' && (
            <div className="max-w-md mx-auto animate-in fade-in zoom-in duration-300">
                <div className="bg-white shadow-lg rounded-2xl p-10 w-full text-center border border-gray-100">
                    {(!myAttendance?.checkIn) && (
                        <>
                            <div className="mb-6 flex justify-center"><div className="p-6 rounded-full bg-red-50 text-red-600"><Clock size={64} /></div></div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-1">Ready to work?</h3>
                            <p className="text-gray-400 text-sm mb-8">Today: {new Date().toDateString()}</p>
                            <button onClick={checkIn} className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg shadow-lg hover:bg-green-700 transition flex items-center justify-center gap-2"><PlayCircle size={24} /> CHECK IN NOW</button>
                        </>
                    )}
                    {(myAttendance?.checkIn && !myAttendance?.checkOut) && (
                        <>
                            <h3 className="text-xl font-bold text-gray-700 mb-4">Clocked In</h3>
                            <div className="text-5xl font-black text-green-600 mb-2 flex justify-center items-baseline gap-3 tracking-tight">{workDuration} <Timer size={32} className="animate-pulse text-green-500 mb-1" /></div>
                            <p className="text-gray-400 text-sm mb-8 font-medium">{username} • {new Date().toDateString()}</p>
                            <button onClick={checkOut} className="w-full py-4 rounded-full bg-blue-600 text-white font-bold text-xl shadow-xl hover:bg-blue-700 transition transform active:scale-95 flex items-center justify-center gap-2"><StopCircle size={28} /> Clock Out</button>
                        </>
                    )}
                    {(myAttendance?.checkIn && myAttendance?.checkOut) && (
                        <>
                            <div className="mb-6 flex justify-center"><div className="p-6 rounded-full bg-gray-100 text-gray-400"><CheckCircle size={64} /></div></div>
                            <h3 className="text-2xl font-bold text-gray-800 mb-2">Work Completed</h3>
                            <p className="text-gray-500 mb-6">See you tomorrow!</p>
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm">
                                <div className="flex justify-between mb-2"><span className="text-gray-500">In:</span><span className="font-bold">{formatTime(myAttendance.checkIn)}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Out:</span><span className="font-bold">{formatTime(myAttendance.checkOut)}</span></div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

        {/* --- TAB: DASHBOARD (Admin) --- */}
        {activeTab === 'dashboard' && role === 'admin' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase">Today Revenue</p><h3 className="text-3xl font-black text-gray-800">{reports.daily?.totalRevenue?.toLocaleString()} ฿</h3></div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase">Month Revenue</p><h3 className="text-3xl font-black text-gray-800">{reports.monthly?.totalRevenue?.toLocaleString()} ฿</h3></div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><p className="text-xs font-bold text-gray-400 uppercase">Year Revenue</p><h3 className="text-3xl font-black text-gray-800">{reports.yearly?.totalRevenue?.toLocaleString()} ฿</h3></div>
            </div>
        )}

        {/* --- TAB: LOGS (Admin) --- */}
        {activeTab === 'logs' && role === 'admin' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2"><History size={20}/> Activity Log</h3>
                    <div className="bg-white px-2 py-1 rounded border"><DatePicker selected={logDate} onChange={(date) => setLogDate(date)} className="text-sm font-bold outline-none"/></div>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-white text-gray-400 border-b uppercase"><tr><th className="p-4">Time</th><th className="p-4">Queue</th><th className="p-4">Total</th><th className="p-4 text-right">Status</th></tr></thead>
                    <tbody>{logs.map(log=>(<tr key={log._id} className="hover:bg-gray-50"><td className="p-4">{formatTime(log.createdAt)}</td><td className="p-4 font-bold">#{log.queueNumber}</td><td className="p-4">{log.totalPrice}฿</td><td className="p-4 text-right"><StatusBadge status={log.status}/></td></tr>))}</tbody>
                </table>
            </div>
        )}

        {/* --- TAB: SETTINGS (Admin) --- */}
        {activeTab === 'settings' && role === 'admin' && (
            <div className="max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><Settings size={24}/> System Configuration</h3>
                    {settingsLoading ? (
                        <p className="text-gray-500">Loading settings...</p>
                    ) : (
                        <form onSubmit={updateSettings} className="space-y-6">
                            {settings.map((setting) => (
                                <div key={setting.key}>
                                    <label className="block text-sm font-bold text-gray-500 uppercase mb-2">
                                        {setting.label || setting.key}
                                    </label>
                                    <input
                                        type={setting.type === 'number' ? 'number' : 'text'}
                                        value={setting.value}
                                        onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                                        className="w-full p-4 border border-gray-200 rounded-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-black bg-gray-50"
                                        required
                                    />
                                </div>
                            ))}
                            <button className="w-full py-4 bg-black text-white rounded-xl font-bold text-lg hover:bg-gray-800 transition shadow-lg flex items-center justify-center gap-2">
                                <Save size={20} /> Save Changes
                            </button>
                        </form>
                    )}
                </div>
            </div>
        )}

        {/* --- TAB: STAFF MANAGEMENT (Admin) --- */}
        {activeTab === 'users' && role === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                    {/* Header with Search */}
                    <div className="p-6 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2 text-lg"><Users size={20}/> Employee Directory</h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search staff..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 w-full sm:w-64"
                            />
                        </div>
                    </div>

                    {/* Unified Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-gray-400 border-b uppercase font-bold text-xs">
                                <tr>
                                    <th className="p-4">Employee</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-center">Clock In</th>
                                    <th className="p-4 text-center">Clock Out</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {getMergedUserList().map(u => (
                                    <tr key={u._id} className="hover:bg-gray-50 transition group">
                                        {/* Employee Info */}
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${u.role === 'admin' ? 'bg-black' : 'bg-red-500'}`}>
                                                    {u.username.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-800">{u.username}</p>
                                                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-bold ${u.role === 'admin' ? 'bg-gray-200 text-gray-700' : 'bg-red-100 text-red-600'}`}>
                                                        {u.role}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Status (Only for Worker) */}
                                        <td className="p-4 text-center">
                                            {u.role === 'worker' ? (
                                                u.attendance ? (
                                                    u.attendance.checkOut ? 
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-bold"><div className="w-2 h-2 rounded-full bg-gray-400"></div> Offline</span> : 
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-600 text-xs font-bold animate-pulse"><div className="w-2 h-2 rounded-full bg-green-500"></div> Working</span>
                                                ) : <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-400 text-xs font-bold"><div className="w-2 h-2 rounded-full bg-red-400"></div> Absent</span>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>

                                        {/* Check In (Editable) */}
                                        <td className="p-4 text-center font-medium text-green-600">
                                            {u.role === 'worker' ? (
                                                editingId === u._id ? (
                                                    <input type="time" value={editTimes.checkIn} onChange={(e) => setEditTimes({...editTimes, checkIn: e.target.value})} className="border rounded p-1 text-xs w-20 text-center" />
                                                ) : (u.attendance ? formatTime(u.attendance.checkIn) : '-')
                                            ) : '-'}
                                        </td>

                                        {/* Check Out (Editable) */}
                                        <td className="p-4 text-center font-medium text-red-600">
                                            {u.role === 'worker' ? (
                                                editingId === u._id ? (
                                                    <input type="time" value={editTimes.checkOut} onChange={(e) => setEditTimes({...editTimes, checkOut: e.target.value})} className="border rounded p-1 text-xs w-20 text-center" />
                                                ) : (u.attendance?.checkOut ? formatTime(u.attendance.checkOut) : '-')
                                            ) : '-'}
                                        </td>

                                        {/* Actions */}
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                {editingId === u._id ? (
                                                    <>
                                                        <button onClick={() => saveTime(u._id)} className="p-1.5 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"><Save size={16}/></button>
                                                        <button onClick={() => setEditingId(null)} className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200"><X size={16}/></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Unlock Button (Only if Checked Out) */}
                                                        {u.role === 'worker' && u.attendance?.checkOut && (
                                                            <button onClick={() => resetAttendance(u._id)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="Unlock / Resume Shift">
                                                                <Unlock size={16}/>
                                                            </button>
                                                        )}
                                                        
                                                        {/* Edit Button (Only for workers with attendance record) */}
                                                        {u.role === 'worker' && (
                                                            <button onClick={() => startEditing(u._id, u.attendance)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Edit Time">
                                                                <Edit size={16}/>
                                                            </button>
                                                        )}

                                                        {/* Delete User */}
                                                        {u.username !== username && (
                                                            <button onClick={() => deleteUser(u._id)} className="p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {getMergedUserList().length === 0 && (
                                    <tr><td colSpan="5" className="p-8 text-center text-gray-400">No employees found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add Staff Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit sticky top-24">
                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-lg"><UserPlus size={20}/> Add New Staff</h3>
                    <p className="text-xs text-gray-400 mb-4">Create a new account for staff members. They can log in using these credentials.</p>
                    <form onSubmit={createUser} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                            <input className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black bg-gray-50" placeholder="e.g. staff01" value={newUser.username} onChange={e=>setNewUser({...newUser, username:e.target.value})} required/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                            <input className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black bg-gray-50" type="password" placeholder="••••••••" value={newUser.password} onChange={e=>setNewUser({...newUser, password:e.target.value})} required/>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setNewUser({...newUser, role: 'worker'})} className={`p-2 rounded-lg text-sm font-bold border ${newUser.role === 'worker' ? 'bg-red-50 border-red-500 text-red-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Worker</button>
                                <button type="button" onClick={() => setNewUser({...newUser, role: 'admin'})} className={`p-2 rounded-lg text-sm font-bold border ${newUser.role === 'admin' ? 'bg-black border-black text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Admin</button>
                            </div>
                        </div>
                        <button className="w-full py-3 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition shadow-lg">Create User</button>
                    </form>
                </div>
            </div>
        )}

      </main>
    </div>
  );
}