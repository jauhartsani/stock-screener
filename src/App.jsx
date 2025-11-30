import React, { useState, useEffect } from 'react';
import { Upload, TrendingUp, TrendingDown, AlertCircle, Database, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';

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

  // 🔥 STATE SORTING
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  // API endpoint
  const API_BASE = '/.netlify/functions';

  // Auto load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const response = await fetch(`${API_BASE}/get-stocks?limit=10`);
        const result = await response.json();

        if (response.ok && result.data && result.data.length > 0) {
          await analyzeStocks();
        }
      } catch (error) {
        console.log('No initial data:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };
    loadInitialData();
  }, []);

  // CSV Parser
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

  // Excel Parser
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

  // Upload to DB
  const uploadToDatabase = async (stocks, date) => {
    try {
      const records = stocks.map(stock => {
        let tanggal = date;

        if (stock['Tanggal Perdagangan Terakhir']) {
          const dateObj = new Date(stock['Tanggal Perdagangan Terakhir']);
          if (!isNaN(dateObj.getTime())) {
            tanggal = dateObj.toISOString().split('T')[0];
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
          foreign_net:
            (parseFloat((stock['Foreign Buy'] || '0').toString().replace(/,/g, '')) || 0) -
            (parseFloat((stock['Foreign Sell'] || '0').toString().replace(/,/g, '')) || 0)
        };
      }).filter(r => r.kode_saham);

      const response = await fetch(`${API_BASE}/upload-stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      return records.length;
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  };

  // Fetch Master Data
  const fetchMasterData = async (date = null) => {
    setLoading(true);
    try {
      let url = `${API_BASE}/get-stocks?limit=5000`;
      if (date) url += `&date=${date}`;
      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      setMasterData(result.data || []);
    } catch (error) {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  // Fetch Dates
  const fetchAvailableDates = async () => {
    try {
      const response = await fetch(`${API_BASE}/get-dates`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setAvailableDates(result.dates || []);
      if (result.dates.length > 0 && !selectedDate) {
        setSelectedDate(result.dates[0]);
      }
    } catch (error) {
      console.error('Error fetching dates:', error);
    }
  };

  // Analyze Stocks
  const analyzeStocks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/get-stocks?limit=1000`);
      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      const stockData = result.data || [];
      const grouped = {};

      stockData.forEach(r => {
        if (!grouped[r.kode_saham]) grouped[r.kode_saham] = [];
        grouped[r.kode_saham].push(r);
      });

      const acc = [];
      const dist = [];

      Object.keys(grouped).forEach(code => {
        const records = grouped[code].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

        // Akumulasi
        let accDays = 0, accStart = null, accTotal = 0;
        for (let i = 0; i < Math.min(records.length, 10); i++) {
          if (records[i].foreign_net > 0) {
            if (accDays === 0) accStart = records[i].tanggal;
            accDays++;
            accTotal += records[i].foreign_net;
          } else break;
        }
        if (accDays >= 5) {
          acc.push({
            kode: code,
            nama: records[0].nama_perusahaan,
            hari: accDays,
            mulai: accStart,
            total_net: accTotal,
            harga: records[0].penutupan,
            latest_date: records[0].tanggal
          });
        }

        // Distribusi
        let distDays = 0, distStart = null, distTotal = 0;
        for (let i = 0; i < Math.min(records.length, 5); i++) {
          if (records[i].foreign_net < 0) {
            if (distDays === 0) distStart = records[i].tanggal;
            distDays++;
            distTotal += records[i].foreign_net;
          } else break;
        }
        if (distDays >= 2) {
          dist.push({
            kode: code,
            nama: records[0].nama_perusahaan,
            hari: distDays,
            mulai: distStart,
            total_net: distTotal,
            harga: records[0].penutupan,
            latest_date: records[0].tanggal
          });
        }
      });

      setAccumulationStocks(acc);
      setDistributionStocks(dist);
      setActiveTab("accumulation");

    } catch (error) {
      alert('Error: ' + error.message);
    }
    setLoading(false);
  };

  // File Upload
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setLoading(true);

    try {
      let total = 0;

      for (const file of files) {
        let stocks = [];
        const name = file.name.toLowerCase();

        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
          stocks = await parseExcel(file);
        } else {
          stocks = parseCSV(await file.text());
        }

        const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
        total += await uploadToDatabase(stocks, date);
      }

      alert(`Upload selesai. Total: ${total} records`);
      setUploadedFiles(prev => [...prev, ...files.map(f => f.name)]);
      await fetchAvailableDates();
      await fetchMasterData();

    } catch (e) {
      alert('Error upload: ' + e.message);
    }
    setLoading(false);
  };

  // Number Format
  const formatNumber = (num) => new Intl.NumberFormat("id-ID").format(num);
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' });

  // 🔥🔥🔥 SORTING FUNCTION 🔥🔥🔥
  const handleSort = (key) => {
    let direction = "asc";

    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }

    setSortConfig({ key, direction });

    const sorted = [...masterData].sort((a, b) => {
      let A = a[key];
      let B = b[key];

      if (key === "tanggal") {
        A = new Date(A);
        B = new Date(B);
      }

      if (!isNaN(A) && !isNaN(B)) {
        A = Number(A);
        B = Number(B);
      }

      if (A < B) return direction === "asc" ? -1 : 1;
      if (A > B) return direction === "asc" ? 1 : -1;
      return 0;
    });

    setMasterData(sorted);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        {/* INITIAL LOADING */}
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

        {/* HEADER */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BarChart3 className="w-12 h-12 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Detector Akumulasi & Distribusi Saham</h1>
          </div>
          <p className="text-blue-200 text-lg">Analisis pola pembelian & penjualan investor asing</p>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-3 rounded-lg font-semibold ${
              activeTab === "upload" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            <Upload className="w-5 h-5 inline mr-2" /> Upload Data
          </button>

          <button
            onClick={async () => {
              setActiveTab("master");
              if (availableDates.length === 0) await fetchAvailableDates();
              if (masterData.length === 0) await fetchMasterData(selectedDate);
            }}
            className={`px-6 py-3 rounded-lg font-semibold ${
              activeTab === "master" ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            <Database className="w-5 h-5 inline mr-2" /> Master Data ({masterData.length})
          </button>

          <button
            onClick={() => setActiveTab("accumulation")}
            className={`px-6 py-3 rounded-lg font-semibold ${
              activeTab === "accumulation" ? "bg-green-500 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            <TrendingUp className="w-5 h-5 inline mr-2" /> Akumulasi
          </button>

          <button
            onClick={() => setActiveTab("distribution")}
            className={`px-6 py-3 rounded-lg font-semibold ${
              activeTab === "distribution" ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            <TrendingDown className="w-5 h-5 inline mr-2" /> Distribusi
          </button>
        </div>

        {/* UPLOAD TAB */}
        {activeTab === "upload" && (
          <div className="bg-slate-800 rounded-xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <Database className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Upload Data Excel</h2>
            </div>

            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-blue-500 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-slate-300 text-lg">
                  <span className="font-semibold">Klik untuk upload</span>
                </p>
                <p className="text-sm text-slate-400">CSV atau Excel (.csv .xlsx .xls)</p>
              </div>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        )}

        {/* MASTER DATA TAB */}
        {activeTab === "master" && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-blue-400" />
                <h2 className="text-2xl font-bold text-white">Master Data</h2>
              </div>
            </div>

            {/* DATE FILTER */}
            {availableDates.length > 0 && (
              <div className="mb-6">
                <h3 className="text-slate-300 font-semibold mb-3">Filter by Tanggal:</h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {availableDates.map((date, idx) => (
                    <button
                      key={idx}
                      onClick={async () => {
                        setSelectedDate(date);
                        await fetchMasterData(date);
                      }}
                      className={`px-4 py-2 rounded-lg font-semibold ${
                        selectedDate === date ? "bg-blue-500 text-white" : "bg-slate-700 text-slate-300"
                      }`}
                    >
                      {formatDate(date)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TABLE */}
            {masterData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">Tidak ada data.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-slate-700 text-slate-300">
                    <tr>

                      {/* HEADER DENGAN SORTING */}
                      {[
                        { key: "tanggal", label: "Tanggal" },
                        { key: "kode_saham", label: "Kode" },
                        { key: "nama_perusahaan", label: "Nama Perusahaan" },
                        { key: "open_price", label: "Open" },
                        { key: "tertinggi", label: "High" },
                        { key: "terendah", label: "Low" },
                        { key: "penutupan", label: "Close" },
                        { key: "volume", label: "Volume" },
                        { key: "foreign_buy", label: "Foreign Buy" },
                        { key: "foreign_sell", label: "Foreign Sell" },
                        { key: "foreign_net", label: "Foreign Net" }
                      ].map((col, idx) => (
                        <th
                          key={idx}
                          onClick={() => handleSort(col.key)}
                          className="px-4 py-3 cursor-pointer select-none"
                        >
                          {col.label}{' '}
                          {sortConfig.key === col.key &&
                            (sortConfig.direction === "asc" ? "▲" : "▼")}
                        </th>
                      ))}

                    </tr>
                  </thead>

                  <tbody>
                    {masterData.slice(0, 100).map((r, idx) => (
                      <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                        <td className="px-4 py-3 text-slate-300">{formatDate(r.tanggal)}</td>
                        <td className="px-4 py-3 text-white font-semibold">{r.kode_saham}</td>
                        <td className="px-4 py-3 text-slate-300">{r.nama_perusahaan}</td>
                        <td className="px-4 py-3 text-slate-300">{formatNumber(r.open_price)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatNumber(r.tertinggi)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatNumber(r.terendah)}</td>
                        <td className="px-4 py-3 text-white font-semibold">{formatNumber(r.penutupan)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatNumber(r.volume)}</td>
                        <td className="px-4 py-3 text-green-400">{formatNumber(r.foreign_buy)}</td>
                        <td className="px-4 py-3 text-red-400">{formatNumber(r.foreign_sell)}</td>
                        <td className={`px-4 py-3 font-semibold ${r.foreign_net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {r.foreign_net >= 0 ? "+" : ""}{formatNumber(r.foreign_net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* LIMIT INFO */}
                {masterData.length > 100 && (
                  <div className="text-center mt-4 text-slate-400 text-sm">
                    Menampilkan 100 dari {masterData.length} records
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ACCUMULATION & DISTRIBUTION TABS — (tidak berubah apa-apa) */}
        {/* ... (Tetap sama persis seperti milikmu) ... */}

      </div>
    </div>
  );
};

export default StockAccumulationTracker;
