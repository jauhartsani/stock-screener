import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, BarChart3, Upload, LogOut, Home, Database, Activity, Search, Trash2 } from 'lucide-react';

// Initialize Supabase client (user will need to replace these)
const SUPABASE_URL = 'https://avzhlgddnalfhpeqsvgz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2emhsZ2RkbmFsZmhwZXFzdmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MDM0MzcsImV4cCI6MjA3OTI3OTQzN30.C9TZU5uUlnHhDXSfLhgVN77NZI3Cnmc-QOvegVS8qYk';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const StockScreener = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = () => {
    const loggedUser = localStorage.getItem('stock_user');
    if (loggedUser) {
      setUser(JSON.parse(loggedUser));
      setCurrentPage('dashboard');
      loadData();
    }
  };

  const loadData = async () => {
    try {
      const { data: stockData } = await supabase
        .from('stocks')
        .select('*')
        .order('tanggal', { ascending: false });
      
      if (stockData) {
        setStocks(stockData);
        const uniqueDates = [...new Set(stockData.map(s => s.tanggal))];
        setDates(uniqueDates.sort());
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    
    if (username && password) {
      const userData = { username };
      setUser(userData);
      localStorage.setItem('stock_user', JSON.stringify(userData));
      setCurrentPage('dashboard');
      loadData();
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('stock_user');
    setCurrentPage('login');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setMessage({ text: 'Memproses file...', type: 'info' });

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].toLowerCase().split(',');
      
      const kodeIdx = headers.findIndex(h => h.includes('kode'));
      const namaIdx = headers.findIndex(h => h.includes('nama'));
      const closeIdx = headers.findIndex(h => h.includes('close') || h.includes('penutupan'));
      const openIdx = headers.findIndex(h => h.includes('open'));
      const highIdx = headers.findIndex(h => h.includes('high') || h.includes('tertinggi'));
      const lowIdx = headers.findIndex(h => h.includes('low') || h.includes('terendah'));
      const volumeIdx = headers.findIndex(h => h.includes('volume'));
      const tanggalIdx = headers.findIndex(h => h.includes('tanggal') || h.includes('date'));

      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 3) continue;

        const kode = cols[kodeIdx]?.trim();
        const tanggal = parseDate(cols[tanggalIdx]?.trim());
        
        if (!kode || !tanggal) continue;

        records.push({
          kode,
          nama: cols[namaIdx]?.trim() || '',
          close_price: parseFloat(cols[closeIdx]) || 0,
          open_price: parseFloat(cols[openIdx]) || 0,
          high_price: parseFloat(cols[highIdx]) || 0,
          low_price: parseFloat(cols[lowIdx]) || 0,
          volume: parseInt(cols[volumeIdx]) || 0,
          tanggal
        });
      }

      if (records.length > 0) {
        const { error } = await supabase
          .from('stocks')
          .upsert(records, { onConflict: 'kode,tanggal' });

        if (error) throw error;

        setMessage({ text: `✅ Berhasil upload ${records.length} data`, type: 'success' });
        loadData();
      } else {
        setMessage({ text: '❌ Tidak ada data valid', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: `❌ Error: ${error.message}`, type: 'error' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const parseDate = (str) => {
    if (!str) return null;
    
    // DD MMM YYYY format
    const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',mei:'05',jun:'06',jul:'07',aug:'08',agu:'08',sep:'09',oct:'10',okt:'10',nov:'11',dec:'12',des:'12'};
    const match = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
    if (match) {
      const mon = months[match[2].toLowerCase().substring(0,3)] || '01';
      return `${match[3]}-${mon}-${match[1].padStart(2, '0')}`;
    }
    
    // YYYY-MM-DD
    if (/\d{4}-\d{2}-\d{2}/.test(str)) return str;
    
    return new Date().toISOString().split('T')[0];
  };

  const calculateRSI = (prices, period = 14) => {
    if (prices.length < period + 1) return 50;
    
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return Math.round(100 - (100 / (1 + rs)));
  };

  const calculateEMA = (prices, period = 20) => {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * k) + (ema * (1 - k));
    }
    return Math.round(ema * 100) / 100;
  };

  const calculateMACD = (prices) => {
    if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
    
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    const signal = macd * 0.8;
    
    return {
      macd: Math.round(macd * 100) / 100,
      signal: Math.round(signal * 100) / 100,
      histogram: Math.round((macd - signal) * 100) / 100
    };
  };

  const analyzeStock = (kode) => {
    const history = stocks
      .filter(s => s.kode === kode)
      .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
    
    if (history.length === 0) return null;

    const prices = history.map(h => h.close_price);
    const latest = history[history.length - 1];
    
    const rsi = calculateRSI(prices);
    const macd = calculateMACD(prices);
    const ema20 = calculateEMA(prices, 20);
    
    let signal = 'WATCH';
    let reasons = [];
    let score = 0;
    
    if (rsi > 25 && rsi < 45) { reasons.push(`RSI ${rsi} oversold`); score++; }
    if (macd.histogram > 0 && macd.macd > macd.signal) { reasons.push('MACD bullish'); score++; }
    if (latest.close_price > ema20 && latest.volume > 1000000) { reasons.push('Break EMA20'); score++; }
    
    if (score >= 2) signal = 'BUY';
    else if (rsi > 70 || macd.histogram < 0) {
      signal = 'SELL';
      reasons = rsi > 70 ? [`RSI ${rsi} overbought`] : ['MACD bearish'];
    }
    
    return {
      kode: latest.kode,
      nama: latest.nama,
      close: latest.close_price,
      volume: latest.volume,
      dataPoints: history.length,
      rsi,
      macd: macd.macd,
      macdHistogram: macd.histogram,
      ema20,
      signal,
      score,
      reasons: reasons.join(', ') || 'Netral'
    };
  };

  const getChartData = (kode) => {
    const history = stocks
      .filter(s => s.kode === kode)
      .sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));
    
    return history.map((stock, i) => {
      const pricesSoFar = history.slice(0, i + 1).map(h => h.close_price);
      return {
        date: new Date(stock.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        price: stock.close_price,
        high: stock.high_price,
        low: stock.low_price,
        volume: stock.volume,
        rsi: calculateRSI(pricesSoFar),
        macd: calculateMACD(pricesSoFar).histogram
      };
    });
  };

  const clearAllData = async () => {
    if (!confirm('Hapus SEMUA data?')) return;
    
    try {
      await supabase.from('stocks').delete().neq('id', 0);
      setMessage({ text: '✅ Semua data berhasil dihapus', type: 'success' });
      loadData();
    } catch (error) {
      setMessage({ text: `❌ Error: ${error.message}`, type: 'error' });
    }
  };

  // Navigation Component
  const Navbar = () => (
    <div>
      <div className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Stock Screener IDX</h1>
              <p className="text-xs text-blue-200">Supabase + React</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">👤 {user?.username}</span>
            <button onClick={handleLogout} className="bg-blue-700 px-4 py-2 rounded-lg hover:bg-blue-800 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white shadow">
        <div className="container mx-auto flex gap-2 p-4 flex-wrap">
          <button onClick={() => setCurrentPage('dashboard')} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${currentPage === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
            <Home className="w-4 h-4" />
            Dashboard
          </button>
          <button onClick={() => setCurrentPage('master')} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${currentPage === 'master' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
            <Database className="w-4 h-4" />
            Master Data
          </button>
          <button onClick={() => setCurrentPage('chart')} className={`px-4 py-2 rounded-lg flex items-center gap-2 ${currentPage === 'chart' ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
            <Activity className="w-4 h-4" />
            Chart
          </button>
          <button onClick={() => setCurrentPage('screener')} className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-2">
            <Search className="w-4 h-4" />
            Screener
          </button>
          <button onClick={clearAllData} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 ml-auto flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );

  // Login Page
  if (currentPage === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Stock Screener IDX</h1>
            <p className="text-gray-600 mt-2">Login untuk melanjutkan</p>
          </div>
          
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-700 mb-2 font-medium">Username</label>
              <input type="text" name="username" className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Masukkan username" required />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2 font-medium">Password</label>
              <input type="password" name="password" className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Masukkan password" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold">
              Login
            </button>
          </form>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700"><strong>Demo:</strong> Gunakan username/password apa saja</p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Page
  if (currentPage === 'dashboard') {
    const totalRecords = stocks.length;
    const uniqueStocks = [...new Set(stocks.map(s => s.kode))].length;
    const uniqueDates = dates.length;

    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto p-6">
          <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>
          
          <div className="bg-blue-50 border border-blue-300 rounded-lg p-6 mb-6">
            <h3 className="font-bold text-blue-800 mb-3">📅 Cara Pakai</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-900">
              <li><strong>Upload CSV per hari</strong> - Satu file = satu hari trading</li>
              <li><strong>Minimal 14-26 hari</strong> untuk RSI/MACD akurat</li>
              <li>Chart tampilkan <strong>data real</strong> dari CSV</li>
            </ol>
          </div>
          
          {message.text && (
            <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-700' : message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {message.text}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600 text-sm">Total Records</p>
              <p className="text-3xl font-bold">{totalRecords.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600 text-sm">Unique Stocks</p>
              <p className="text-3xl font-bold">{uniqueStocks.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600 text-sm">Days of Data</p>
              <p className="text-3xl font-bold">{uniqueDates.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-600 text-sm">Status</p>
              <p className={`text-xl font-bold ${uniqueDates >= 14 ? 'text-green-600' : 'text-red-600'}`}>
                {uniqueDates >= 26 ? '✅ MACD Ready' : uniqueDates >= 14 ? '✅ RSI Ready' : '⚠️ Need Data'}
              </p>
            </div>
          </div>
          
          {dates.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="font-bold mb-4">📅 Tanggal Tersimpan:</h3>
              <div className="flex flex-wrap gap-2">
                {dates.map(date => (
                  <span key={date} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    {new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Master Data Page
  if (currentPage === 'master') {
    const latestStocks = {};
    stocks.forEach(stock => {
      if (!latestStocks[stock.kode] || new Date(stock.tanggal) > new Date(latestStocks[stock.kode].tanggal)) {
        latestStocks[stock.kode] = stock;
      }
    });

    const stockList = Object.values(latestStocks).map(stock => ({
      ...stock,
      dataPoints: stocks.filter(s => s.kode === stock.kode).length
    }));

    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto p-6">
          <h2 className="text-2xl font-bold mb-6">Master Data Saham</h2>
          
          {message.text && (
            <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message.text}
            </div>
          )}
          
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold">📤 Upload CSV Per Hari</p>
                <p className="text-sm text-gray-600">Sudah ada {dates.length} hari data</p>
                <input type="file" accept=".csv" onChange={handleFileUpload} disabled={loading} className="mt-2" />
              </div>
              {loading && <div className="text-blue-600">Memproses...</div>}
            </div>
          </div>
          
          {stockList.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left">Kode</th>
                      <th className="px-4 py-3 text-left">Nama</th>
                      <th className="px-4 py-3 text-center">Tanggal</th>
                      <th className="px-4 py-3 text-right">Close</th>
                      <th className="px-4 py-3 text-center">Data</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockList.map(stock => {
                      const dp = stock.dataPoints;
                      const colorClass = dp >= 26 ? 'bg-green-100 text-green-800' : dp >= 14 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
                      
                      return (
                        <tr key={stock.kode} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold text-blue-600">{stock.kode}</td>
                          <td className="px-4 py-3 text-sm">{stock.nama}</td>
                          <td className="px-4 py-3 text-center text-sm">
                            {new Date(stock.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{stock.close_price.toLocaleString()}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${colorClass}`}>
                              {dp} hari
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => { setSelectedStock(stock.kode); setCurrentPage('chart'); }}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                            >
                              Chart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 rounded-lg shadow text-center">
              <p className="text-gray-600">Belum ada data. Upload file CSV untuk memulai.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Chart Page
  if (currentPage === 'chart') {
    const uniqueStocks = [...new Set(stocks.map(s => ({ kode: s.kode, nama: s.nama })))];
    const chartData = selectedStock ? getChartData(selectedStock) : [];
    const stockHistory = selectedStock ? stocks.filter(s => s.kode === selectedStock).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal)) : [];
    const latestStock = stockHistory[0];

    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto p-6">
          <h2 className="text-2xl font-bold mb-6">Chart Teknikal</h2>
          
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <label className="font-semibold mr-4">Pilih Saham:</label>
            <select 
              value={selectedStock || ''} 
              onChange={(e) => setSelectedStock(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="">-- Pilih --</option>
              {uniqueStocks.map(stock => (
                <option key={stock.kode} value={stock.kode}>
                  {stock.kode} - {stock.nama}
                </option>
              ))}
            </select>
          </div>
          
          {latestStock ? (
            <>
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <div className="flex justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-blue-600">{latestStock.kode}</h3>
                    <p className="text-gray-600">{latestStock.nama}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold">Rp {latestStock.close_price.toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t text-sm">
                  <div><p className="text-gray-500">Data</p><p className="font-semibold">{stockHistory.length} hari</p></div>
                  <div><p className="text-gray-500">High</p><p className="font-semibold text-green-600">{latestStock.high_price.toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Low</p><p className="font-semibold text-red-600">{latestStock.low_price.toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Volume</p><p className="font-semibold">{latestStock.volume.toLocaleString()}</p></div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <h4 className="font-bold mb-4">📈 Price Chart</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} name="Close" />
                    <Line type="monotone" dataKey="high" stroke="#10b981" strokeWidth={1} name="High" />
                    <Line type="monotone" dataKey="low" stroke="#ef4444" strokeWidth={1} name="Low" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-bold mb-4">📊 RSI</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="rsi" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-500 mt-2">RSI {'>'} 70: Overbought | RSI {'<'} 30: Oversold</p>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="font-bold mb-4">📉 MACD</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="macd" fill={(entry) => entry.macd >= 0 ? '#10b981' : '#ef4444'} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-500 mt-2">Positif: Bullish | Negatif: Bearish</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow">
                <h4 className="font-bold mb-4">📊 Volume</h4>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="volume" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="bg-white p-12 rounded-lg shadow text-center">
              <p className="text-gray-600">Pilih saham dari dropdown di atas</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Screener Page
  if (currentPage === 'screener') {
    const uniqueCodes = [...new Set(stocks.map(s => s.kode))];
    const results = uniqueCodes.map(kode => analyzeStock(kode)).filter(r => r !== null);
    results.sort((a, b) => b.score - a.score);

    const buyCount = results.filter(r => r.signal === 'BUY').length;
    const sellCount = results.filter(r => r.signal === 'SELL').length;
    const watchCount = results.filter(r => r.signal === 'WATCH').length;

    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="container mx-auto p-6">
          <h2 className="text-2xl font-bold mb-6">🔍 Screener Results</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-100 p-4 rounded-lg border-2 border-green-300">
              <h3 className="font-bold text-green-800">✅ BUY</h3>
              <p className="text-3xl font-bold text-green-600">{buyCount}</p>
            </div>
            <div className="bg-red-100 p-4 rounded-lg border-2 border-red-300">
              <h3 className="font-bold text-red-800">❌ SELL</h3>
              <p className="text-3xl font-bold text-red-600">{sellCount}</p>
            </div>
            <div className="bg-yellow-100 p-4 rounded-lg border-2 border-yellow-300">
              <h3 className="font-bold text-yellow-800">👁️ WATCH</h3>
              <p className="text-3xl font-bold text-yellow-600">{watchCount}</p>
            </div>
          </div>
          
          {results.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left">Kode</th>
                      <th className="px-4 py-3 text-left">Nama</th>
                      <th className="px-4 py-3 text-center">Data</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">RSI</th>
                      <th className="px-4 py-3 text-right">MACD</th>
                      <th className="px-4 py-3 text-center">Signal</th>
                      <th className="px-4 py-3 text-left">Alasan</th>
                      <th className="px-4 py-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(stock => {
                      const dp = stock.dataPoints;
                      const dpColor = dp >= 26 ? 'bg-green-100 text-green-800' : dp >= 14 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
                      const signalColor = stock.signal === 'BUY' ? 'bg-green-100 text-green-800' : stock.signal === 'SELL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
                      
                      return (
                        <tr key={stock.kode} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-bold text-blue-600">{stock.kode}</td>
                          <td className="px-4 py-3 text-sm">{stock.nama}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${dpColor}`}>
                              {dp}d
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{stock.close.toLocaleString()}</td>
                          <td className={`px-4 py-3 text-right ${stock.rsi > 70 ? 'text-red-600' : stock.rsi < 30 ? 'text-green-600' : ''}`}>
                            {stock.rsi}
                          </td>
                          <td className={`px-4 py-3 text-right ${stock.macdHistogram > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {stock.macd}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${signalColor}`}>
                              {stock.signal}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{stock.reasons}</td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => { setSelectedStock(stock.kode); setCurrentPage('chart'); }}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                            >
                              Chart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 rounded-lg shadow text-center">
              <p className="text-gray-600">Belum ada data. Upload CSV dulu di Master Data.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default StockScreener;