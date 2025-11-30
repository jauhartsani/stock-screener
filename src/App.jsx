import React, { useState, useEffect } from 'react';
import { Upload, TrendingUp, TrendingDown, AlertCircle, Database, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';

// Neon database akan diambil dari environment variables Netlify
// NETLIFY_DATABASE_URL sudah otomatis tersedia setelah install Neon extension

const StockAccumulationTracker = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [accumulationStocks, setAccumulationStocks] = useState([]);
  const [distributionStocks, setDistributionStocks] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // API endpoint untuk Netlify Functions
  const API_BASE = '/.netlify/functions';

  // Auto-load data saat pertama kali component dimount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Check if data exists in database
        const response = await fetch(`${API_BASE}/get-stocks?limit=10`);
        const result = await response.json();
        
        if (response.ok && result.data && result.data.length > 0) {
          // Data ada, auto analyze
          await analyzeStocks();
        }
      } catch (error) {
        console.log('No initial data or error loading:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    loadInitialData();
  }, []); // Run once on mount

  // Parse CSV data
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
        const row = {};
        headers.forEach((header, index) => {
          let value = values[index]?.trim() || '';
          value = value.replace(/^"|"$/g, '');
          row[header] = value;
        });
        data.push(row);
      }
    }
    return data;
  };

  // Parse Excel file
  const parseExcel = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // Upload data ke Neon via Netlify Function
  const uploadToDatabase = async (stocks, date) => {
    try {
      const records = stocks.map(stock => {
        let tanggal = date;
        if (stock['Tanggal Perdagangan Terakhir']) {
          try {
            const dateStr = stock['Tanggal Perdagangan Terakhir'];
            const dateObj = new Date(dateStr);
            if (!isNaN(dateObj.getTime())) {
              tanggal = dateObj.toISOString().split('T')[0];
            }
          } catch (e) {
            console.log('Error parsing date:', e);
          }
        }

        return {
          kode_saham: stock['Kode Saham'] || '',
          nama_perusahaan: stock['Nama Perusahaan'] || '',
          tanggal: tanggal,
          open_price: parseFloat((stock['Open Price'] || '0').toString().replace(/,/g, '')) || 0,
          penutupan: parseFloat((stock['Penutupan'] || '0').toString().replace(/,/g, '')) || 0,
          tertinggi: parseFloat((stock['Tertinggi'] || '0').toString().replace(/,/g, '')) || 0,
          terendah: parseFloat((stock['Terendah'] || '0').toString().replace(/,/g, '')) || 0,
          volume: parseFloat((stock['Volume'] || '0').toString().replace(/,/g, '')) || 0,
          foreign_buy: parseFloat((stock['Foreign Buy'] || '0').toString().replace(/,/g, '')) || 0,
          foreign_sell: parseFloat((stock['Foreign Sell'] || '0').toString().replace(/,/g, '')) || 0,
          foreign_net: (parseFloat((stock['Foreign Buy'] || '0').toString().replace(/,/g, '')) || 0) - 
                       (parseFloat((stock['Foreign Sell'] || '0').toString().replace(/,/g, '')) || 0)
        };
      }).filter(record => record.kode_saham);

      if (records.length === 0) {
        throw new Error('Tidak ada data valid untuk diupload');
      }

      const response = await fetch(`${API_BASE}/upload-stocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      return records.length;
    } catch (error) {
      console.error('Error uploading to database:', error);
      throw error;
    }
  };

  // Fetch master data
  const fetchMasterData = async (date = null) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/get-stocks?limit=5000`;
      
      if (date) {
        url += `&date=${date}`;
      }
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setMasterData(result.data || []);
    } catch (error) {
      console.error('Error fetching master data:', error);
      alert('Error saat mengambil data: ' + error.message);
    }
    setLoading(false);
  };

  // Fetch available dates
  const fetchAvailableDates = async () => {
    try {
      const response = await fetch(`${API_BASE}/get-dates`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch dates');
      }

      const dates = result.dates || [];
      setAvailableDates(dates);
      
      // Set tanggal terbaru sebagai default
      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch (error) {
      console.error('Error fetching dates:', error);
    }
  };

  // Analisis akumulasi dan distribusi
  const analyzeStocks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/get-stocks?limit=1000`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      const stockData = result.data || [];

      // Group by kode saham
      const groupedStocks = {};
      stockData.forEach(record => {
        if (!groupedStocks[record.kode_saham]) {
          groupedStocks[record.kode_saham] = [];
        }
        groupedStocks[record.kode_saham].push(record);
      });

      const accumulation = [];
      const distribution = [];

      // Analisis setiap saham
      Object.keys(groupedStocks).forEach(kode => {
        const records = groupedStocks[kode].sort((a, b) => 
          new Date(b.tanggal) - new Date(a.tanggal)
        );

        // Cek akumulasi (3 hari berturut-turut foreign_net positif)
        let accDays = 0;
        let accStartDate = null;
        let totalAccNet = 0;

        for (let i = 0; i < Math.min(records.length, 10); i++) {
          if (records[i].foreign_net > 0) {
            if (accDays === 0) accStartDate = records[i].tanggal;
            accDays++;
            totalAccNet += parseFloat(records[i].foreign_net);
          } else {
            if (accDays >= 3) break;
            accDays = 0;
            totalAccNet = 0;
          }
        }

        if (accDays >= 5) {
          accumulation.push({
            kode: kode,
            nama: records[0].nama_perusahaan,
            hari: accDays,
            mulai: accStartDate,
            total_net: totalAccNet,
            harga: records[0].penutupan,
            latest_date: records[0].tanggal
          });
        }

        // Cek distribusi (2 hari berturut-turut foreign_net negatif)
        let distDays = 0;
        let distStartDate = null;
        let totalDistNet = 0;

        for (let i = 0; i < Math.min(records.length, 5); i++) {
          if (records[i].foreign_net < 0) {
            if (distDays === 0) distStartDate = records[i].tanggal;
            distDays++;
            totalDistNet += parseFloat(records[i].foreign_net);
          } else {
            if (distDays >= 2) break;
            distDays = 0;
            totalDistNet = 0;
          }
        }

        if (distDays >= 2) {
          distribution.push({
            kode: kode,
            nama: records[0].nama_perusahaan,
            hari: distDays,
            mulai: distStartDate,
            total_net: totalDistNet,
            harga: records[0].penutupan,
            latest_date: records[0].tanggal
          });
        }
      });

      accumulation.sort((a, b) => b.total_net - a.total_net);
      distribution.sort((a, b) => a.total_net - b.total_net);

      setAccumulationStocks(accumulation);
      setDistributionStocks(distribution);
      setActiveTab('accumulation');
    } catch (error) {
      console.error('Error analyzing stocks:', error);
      alert('Error saat menganalisis data: ' + error.message);
    }
    setLoading(false);
  };

  // Handle file upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setLoading(true);

    try {
      let successCount = 0;
      let totalRecords = 0;

      for (const file of files) {
        try {
          let stocks = [];
          const fileName = file.name.toLowerCase();
          
          if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            stocks = await parseExcel(file);
          } else {
            const text = await file.text();
            stocks = parseCSV(text);
          }

          if (stocks.length === 0) {
            console.warn(`File ${file.name} tidak memiliki data`);
            continue;
          }
          
          const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
          const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

          const recordCount = await uploadToDatabase(stocks, date);
          successCount++;
          totalRecords += recordCount;
          
          console.log(`✓ ${file.name}: ${recordCount} records uploaded`);
        } catch (fileError) {
          console.error(`Error processing ${file.name}:`, fileError);
          alert(`Error pada file ${file.name}: ${fileError.message}`);
        }
      }

      setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
      
      if (successCount > 0) {
        alert(`Berhasil upload ${successCount} file dengan total ${totalRecords} records!`);
        await fetchAvailableDates(); // Update list tanggal
        await fetchMasterData();
      }
    } catch (error) {
      console.error('Error in file upload:', error);
      alert('Error saat upload: ' + error.message);
    }
    
    setLoading(false);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('id-ID').format(num);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Loading Overlay saat initial load */}
        {isInitialLoad && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-slate-800 rounded-xl p-8 shadow-2xl">
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                <p className="text-white font-semibold">Loading data...</p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BarChart3 className="w-12 h-12 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">
              Detector Akumulasi & Distribusi Saham
            </h1>
          </div>
          <p className="text-blue-200 text-lg">
            Analisis pola pembelian dan penjualan investor asing
          </p>
          <p className="text-blue-300 text-sm mt-2">
            Powered by Neon Database + Netlify
          </p>
        </div>

        {/* Setup Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-100 text-sm">
              <strong>Setup Required:</strong> Install Neon extension di Netlify dan deploy Netlify Functions. Lihat dokumentasi lengkap di bawah.
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'upload'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Upload className="w-5 h-5 inline mr-2" />
            Upload Data
          </button>
          <button
            onClick={async () => {
              setActiveTab('master');
              if (availableDates.length === 0) await fetchAvailableDates();
              if (masterData.length === 0) await fetchMasterData(selectedDate);
            }}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'master'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Database className="w-5 h-5 inline mr-2" />
            Master Data ({masterData.length})
          </button>
          <button
            onClick={() => setActiveTab('accumulation')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'accumulation'
                ? 'bg-green-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <TrendingUp className="w-5 h-5 inline mr-2" />
            Akumulasi ({accumulationStocks.length})
          </button>
          <button
            onClick={() => setActiveTab('distribution')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'distribution'
                ? 'bg-red-500 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <TrendingDown className="w-5 h-5 inline mr-2" />
            Distribusi ({distributionStocks.length})
          </button>
        </div>

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="bg-slate-800 rounded-xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <Database className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Upload Data Excel</h2>
              <p className="text-slate-300">
                Format nama file: <code className="bg-slate-700 px-2 py-1 rounded">2025-11-28.csv</code> atau upload langsung
              </p>
            </div>

            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-blue-500 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-blue-400 mb-4" />
                <p className="mb-2 text-lg text-slate-300">
                  <span className="font-semibold">Klik untuk upload</span> atau drag & drop
                </p>
                <p className="text-sm text-slate-400">CSV atau Excel files (.csv, .xlsx, .xls)</p>
                <p className="text-xs text-slate-500 mt-2">Format: No,Kode Saham,Nama Perusahaan,...,Foreign Buy,Foreign Sell</p>
              </div>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".csv,.xlsx,.xls,.txt"
                onChange={handleFileUpload}
                disabled={loading}
              />
            </label>

            {uploadedFiles.length > 0 && (
              <div className="mt-6">
                <h3 className="text-white font-semibold mb-3">File yang sudah diupload:</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="bg-slate-700 px-4 py-2 rounded text-slate-300 text-sm">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={analyzeStocks}
              disabled={loading}
              className="w-full mt-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Menganalisis...' : 'Analisis Data Saham'}
            </button>
          </div>
        )}

        {/* Master Data Tab */}
        {activeTab === 'master' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Master Data</h2>
              </div>
              <button
                onClick={() => {
                  fetchAvailableDates();
                  fetchMasterData(selectedDate);
                }}
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {/* Date Filter */}
            {availableDates.length > 0 && (
              <div className="mb-6">
                <h3 className="text-slate-300 font-semibold mb-3">Filter by Tanggal Upload:</h3>
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-2 min-w-max">
                    {availableDates.map((date, idx) => (
                      <button
                        key={idx}
                        onClick={async () => {
                          setSelectedDate(date);
                          await fetchMasterData(date);
                        }}
                        className={`px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                          selectedDate === date
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {masterData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Belum ada data. Upload data terlebih dahulu.
              </div>
            ) : (
              <div>
                <div className="mb-4 text-slate-300">
                  Menampilkan data untuk: <span className="text-white font-semibold">{selectedDate ? formatDate(selectedDate) : 'Semua tanggal'}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-slate-700 text-slate-300">
                      <tr>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Kode</th>
                        <th className="px-4 py-3">Nama Perusahaan</th>
                        <th className="px-4 py-3">Open</th>
                        <th className="px-4 py-3">High</th>
                        <th className="px-4 py-3">Low</th>
                        <th className="px-4 py-3">Close</th>
                        <th className="px-4 py-3">Volume</th>
                        <th className="px-4 py-3">Foreign Buy</th>
                        <th className="px-4 py-3">Foreign Sell</th>
                        <th className="px-4 py-3">Foreign Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {masterData.slice(0, 100).map((record, idx) => (
                        <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                          <td className="px-4 py-3 text-slate-300">{formatDate(record.tanggal)}</td>
                          <td className="px-4 py-3 text-white font-semibold">{record.kode_saham}</td>
                          <td className="px-4 py-3 text-slate-300 max-w-xs truncate">{record.nama_perusahaan}</td>
                          <td className="px-4 py-3 text-slate-300">{formatNumber(record.open_price)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatNumber(record.tertinggi)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatNumber(record.terendah)}</td>
                          <td className="px-4 py-3 text-white font-semibold">{formatNumber(record.penutupan)}</td>
                          <td className="px-4 py-3 text-slate-300">{formatNumber(record.volume)}</td>
                          <td className="px-4 py-3 text-green-400">{formatNumber(record.foreign_buy)}</td>
                          <td className="px-4 py-3 text-red-400">{formatNumber(record.foreign_sell)}</td>
                          <td className={`px-4 py-3 font-semibold ${record.foreign_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {record.foreign_net >= 0 ? '+' : ''}{formatNumber(record.foreign_net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {masterData.length > 100 && (
                    <div className="text-center mt-4 text-slate-400 text-sm">
                      Menampilkan 100 dari {masterData.length} records
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Accumulation Tab */}
        {activeTab === 'accumulation' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">
                Saham dalam Akumulasi Asing (≥3 Hari)
              </h2>
            </div>

            {accumulationStocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Belum ada data. Upload data dan klik "Analisis Data Saham"
              </div>
            ) : (
              <div className="space-y-4">
                {accumulationStocks.map((stock, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-green-900/30 to-slate-700 p-5 rounded-lg border border-green-500/30">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-bold text-white">{stock.kode}</h3>
                        <p className="text-slate-300 text-sm">{stock.nama}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-400">
                          Rp {formatNumber(stock.harga)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Durasi Akumulasi</div>
                        <div className="text-green-400 font-bold text-lg">{stock.hari} Hari</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Mulai Tanggal</div>
                        <div className="text-white font-semibold">{formatDate(stock.mulai)}</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Total Net Foreign</div>
                        <div className="text-green-400 font-bold">+{formatNumber(stock.total_net)}</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Data Terakhir</div>
                        <div className="text-white font-semibold">{formatDate(stock.latest_date)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Distribution Tab */}
        {activeTab === 'distribution' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <TrendingDown className="w-8 h-8 text-red-400" />
              <h2 className="text-2xl font-bold text-white">
                Saham dalam Distribusi Asing (≥2 Hari)
              </h2>
            </div>

            {distributionStocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Belum ada data. Upload data dan klik "Analisis Data Saham"
              </div>
            ) : (
              <div className="space-y-4">
                {distributionStocks.map((stock, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-red-900/30 to-slate-700 p-5 rounded-lg border border-red-500/30">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-bold text-white">{stock.kode}</h3>
                        <p className="text-slate-300 text-sm">{stock.nama}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-red-400">
                          Rp {formatNumber(stock.harga)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Durasi Distribusi</div>
                        <div className="text-red-400 font-bold text-lg">{stock.hari} Hari</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Mulai Tanggal</div>
                        <div className="text-white font-semibold">{formatDate(stock.mulai)}</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Total Net Foreign</div>
                        <div className="text-red-400 font-bold">{formatNumber(stock.total_net)}</div>
                      </div>
                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Data Terakhir</div>
                        <div className="text-white font-semibold">{formatDate(stock.latest_date)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StockAccumulationTracker;
