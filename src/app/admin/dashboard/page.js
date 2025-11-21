'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import useSWR from 'swr';

const fetcher = url => api.get(url).then(res => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [customers, setCustomers] = useState(1);

  const { data, mutate } = useSWR('/queue', fetcher, { refreshInterval: 2000 });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!token || !storedUser) {
      router.push('/admin');
    } else {
      setUser(JSON.parse(storedUser));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [router]);

  const handleAddQueue = async (e) => {
    e.preventDefault();
    try {
      await api.post('/queue', { numberOfCustomers: customers });
      mutate(); // Refresh data
      setCustomers(1);
    } catch (error) {
      alert('Error adding queue');
    }
  };

  const handleNextQueue = async () => {
    try {
      await api.put('/queue/next');
      mutate();
    } catch (error) {
      alert('Error updating queue');
    }
  };

  const handleAccept = async (id) => {
    try {
      await api.put(`/queue/accept/${id}`);
      mutate();
    } catch (error) {
      alert('Error accepting queue');
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.put(`/queue/cancel/${id}`);
      mutate();
    } catch (error) {
      alert('Error cancelling queue');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/admin');
  };

  if (!user) return <div className="p-4">Loading...</div>;

  const { queues, currentServing } = data || { queues: [], currentServing: null };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-red-600">Queue Management</h1>
          <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded uppercase font-bold tracking-wider">{user.role}</span>
        </div>
        <button onClick={handleLogout} className="text-gray-600 hover:text-red-600">Logout</button>
      </header>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left Column: Controls */}
        <div className="space-y-6 md:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Add Queue */}
            <div className="bg-white p-6 rounded-lg shadow h-fit">
              <h2 className="text-lg font-semibold mb-4">Add New Queue</h2>
              <form onSubmit={handleAddQueue} className="flex gap-4">
                <input
                  type="number"
                  min="1"
                  value={customers}
                  onChange={(e) => setCustomers(parseInt(e.target.value))}
                  className="flex-1 p-2 border rounded"
                  placeholder="Number of customers"
                />
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                  Add
                </button>
              </form>
            </div>

            {/* Current Serving Actions */}
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
              <h2 className="text-lg font-semibold mb-2">Current Serving</h2>
              {currentServing ? (
                <div>
                  <div className="text-4xl font-bold text-red-600 mb-2">#{currentServing.queueNumber}</div>
                  <div className="text-gray-600 mb-4">{currentServing.numberOfCustomers} Customers</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(currentServing._id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex-1"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleCancel(currentServing._id)}
                      className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 flex-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 py-4">No one is currently being served.</div>
              )}
               <button
                onClick={handleNextQueue}
                className="w-full mt-4 bg-red-600 text-white px-4 py-3 rounded font-bold text-lg hover:bg-red-700 shadow-lg"
              >
                CALL NEXT QUEUE
              </button>
            </div>
          </div>

          {/* Admin Only Section: History/Stats */}
          {user.role === 'admin' && (
             <div className="bg-white p-6 rounded-lg shadow mt-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Admin Management: Today's Summary</h2>
                <p className="text-gray-600 mb-4">Total Queues Today: {queues.length + (currentServing ? 1 : 0)}</p>
                {/* In a real app, we'd fetch completed/cancelled queues here too */}
                <div className="bg-blue-50 p-4 rounded border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Admin Note:</strong> You have full access to manage settings and view detailed reports here.
                    (Placeholder for advanced admin features).
                  </p>
                </div>
             </div>
          )}
        </div>

        {/* Right Column: List */}
        <div className="bg-white p-6 rounded-lg shadow h-fit">
          <h2 className="text-lg font-semibold mb-4">Waiting List</h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {queues.filter(q => q.status === 'waiting').map((q) => (
              <div key={q._id} className="flex justify-between items-center p-3 bg-gray-50 rounded hover:bg-gray-100 border border-gray-200">
                <div>
                  <span className="font-bold text-lg mr-2">#{q.queueNumber}</span>
                  <span className="text-sm text-gray-600">({q.numberOfCustomers} ppl)</span>
                </div>
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Waiting</span>
              </div>
            ))}
            {queues.filter(q => q.status === 'waiting').length === 0 && (
               <div className="text-center text-gray-400 py-10">No queues waiting</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
