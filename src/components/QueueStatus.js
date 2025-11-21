'use client';

import useSWR from 'swr';
import api from '@/lib/api';

const fetcher = url => api.get(url).then(res => res.data);

export default function QueueStatus() {
  const { data, error, isLoading } = useSWR('/queue', fetcher, { refreshInterval: 3000 });

  if (error) return <div className="text-red-500">Failed to load queue data</div>;
  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  const { currentServing, waitingCount } = data;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-white p-4">
      <div className="w-full max-w-md glass p-8 rounded-2xl shadow-2xl border-t-4 border-red-500">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">Current Queue</h1>

        <div className="flex flex-col items-center justify-center mb-10">
            <div className="text-xl text-gray-600 mb-2">Now Serving</div>
            <div className="text-9xl font-black text-red-600 animate-pulse-soft">
                {currentServing ? currentServing.queueNumber : '-'}
            </div>
            <div className="mt-2 text-gray-500">
                {currentServing ? `${currentServing.numberOfCustomers} Customers` : 'Waiting for update'}
            </div>
        </div>

        <div className="bg-red-50 rounded-xl p-4 flex justify-between items-center">
            <span className="text-gray-700 font-medium">Waiting Queue:</span>
            <span className="text-2xl font-bold text-red-600">{waitingCount}</span>
        </div>
      </div>
    </div>
  );
}
