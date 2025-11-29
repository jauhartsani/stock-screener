import React, { useState } from 'react';
import { Upload, TrendingUp, TrendingDown, AlertCircle, Database, BarChart3 } from 'lucide-react';

// KONFIGURASI SUPABASE - ISI DENGAN CREDENTIALS ANDA
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

const StockAccumulationTracker = () => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [accumulationStocks, setAccumulationStocks] = useState([]);
  const [distributionStocks, setDistributionStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');

  // Supabase client function
  const getSupabaseClient = () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('your-project')) {
      throw new Error('Supabase belum dikonfigurasi. Silakan update SUPABASE_URL dan SUPABASE_ANON_KEY di kode.');
    }
    
    return {
      from: (table) => ({
        select: (columns) => ({
          order: (col, opts) => ({
            limit: async (lim) => {
              const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${columns}&order=${col}.${opts.ascending ? 'asc' : 'desc'}&limit=${lim}`, {
                headers: {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
              });
              const data = await response.json();
              return { data, error: response.ok ? null : data };
            }
          })
        }),
        upsert: async (records, opts) => {
          const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(records)
          });
          const data = response.ok ? await response.json() : await response.text();
          return { data, error: response.ok ? null : data };
        }
      })
    };
  };

  // Parse CSV data
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        // Split by comma but handle quoted values
        const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
        const row = {};
        headers.forEach((header, index) => {
          let value = values[index]?.trim() || '';
          // Remove quotes if present
          value = value.replace(/^"|"$/g, '');
          row[header] = value;
        });
        data.push(row);
      }
    }
    return data;
  };

  // Parse Excel file using FileReader
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

  // Upload data ke Supabase
  const uploadToSupabase = async (stocks, date) => {
    try {
      const supabase = getSupabaseClient();
      const records = stocks.map(stock => {
        // Parse tanggal dengan format "28 Nov 2025"
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
      }).filter(record => record.kode_saham); // Filter out empty records

      if (records.length === 0) {
        throw new Error('Tidak ada data valid untuk diupload');
      }

      const { data, error } = await supabase
        .from('stock_data')
        .upsert(records, { onConflict: 'kode_saham,tanggal' });

      if (error) throw error;
      return records.length;
    } catch (error) {
      console.error('Error uploading to Supabase:', error);
      throw error;
    }
  };

  // Analisis akumulasi dan distribusi
  const analyzeStocks = async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: stockData, error } = await supabase
        .from('stock_data')
        .select('*')
        .order('tanggal', { ascending: false })
        .limit(1000);

      if (error) throw error;

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

        // Cek akumulasi (5 hari berturut-turut foreign_net positif)
        let accDays = 0;
        let accStartDate = null;
        let totalAccNet = 0;

        for (let i = 0; i < Math.min(records.length, 10); i++) {
          if (records[i].foreign_net > 0) {
            if (accDays === 0) accStartDate = records[i].tanggal;
            accDays++;
            totalAccNet += records[i].foreign_net;
          } else {
            if (accDays >= 5) break;
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
            totalDistNet += records[i].foreign_net;
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

      // Sort berdasarkan total net dan jumlah hari
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
          
          // Check file extension
          const fileName = file.name.toLowerCase();
          
          if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            // Parse Excel file
            stocks = await parseExcel(file);
          } else {
            // Parse CSV file
            const text = await file.text();
            stocks = parseCSV(text);
          }

          if (stocks.length === 0) {
            console.warn(`File ${file.name} tidak memiliki data`);
            continue;
          }
          
          // Extract date from filename or use current date
          const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
          const date = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];

          const recordCount = await uploadToSupabase(stocks, date);
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
        </div>

        {/* Setup Notice */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-yellow-100 text-sm">
              <strong>Setup Database:</strong> Pastikan sudah update SUPABASE_URL dan SUPABASE_ANON_KEY di kode, lalu buat tabel di Supabase dengan SQL berikut:
              <pre className="mt-2 p-2 bg-slate-800 rounded text-xs overflow-x-auto">
{`CREATE TABLE stock_data (
  id BIGSERIAL PRIMARY KEY,
  kode_saham VARCHAR(10) NOT NULL,
  nama_perusahaan TEXT,
  tanggal DATE NOT NULL,
  open_price NUMERIC,
  penutupan NUMERIC,
  tertinggi NUMERIC,
  terendah NUMERIC,
  volume BIGINT,
  foreign_buy BIGINT,
  foreign_sell BIGINT,
  foreign_net BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(kode_saham, tanggal)
);`}
              </pre>
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

        {/* Accumulation Tab */}
        {activeTab === 'accumulation' && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">
                Saham dalam Akumulasi Asing (≥5 Hari)
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
