import React, { useState, useEffect } from "react";
import {
  Upload,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Database,
  BarChart3,
} from "lucide-react";
import * as XLSX from "xlsx";

const StockAccumulationTracker = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [accumulationStocks, setAccumulationStocks] = useState([]);
  const [distributionStocks, setDistributionStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // SORTING CONFIG
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "asc",
  });

  // FORMAT HELPERS
  const formatNumber = (num) =>
    Number(num).toLocaleString("id-ID", {
      maximumFractionDigits: 0,
    });

  const formatDate = (str) => {
    if (!str) return "-";
    const d = new Date(str);
    return d.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // LOAD AVAILABLE DATES
  const fetchAvailableDates = async () => {
    try {
      const res = await fetch("/.netlify/functions/get-dates");
      const data = await res.json();
      setAvailableDates(data.dates || []);
    } catch (err) {
      console.error("Error fetching dates", err);
    }
  };

  // LOAD MASTER DATA
  const fetchMasterData = async (date) => {
    setLoading(true);
    try {
      const res = await fetch("/.netlify/functions/get-master", {
        method: "POST",
        body: JSON.stringify({ tanggal: date }),
      });

      const data = await res.json();
      setMasterData(data.records || []);
    } catch (err) {
      console.error("Error loading master data:", err);
    }
    setLoading(false);
  };

  // DELETE DATA BY DATE
  const deleteDate = async (date) => {
    if (!window.confirm(`Hapus semua data tanggal ${formatDate(date)} ?`)) {
      return;
    }

    try {
      const res = await fetch("/.netlify/functions/delete-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal: date }),
      });

      const result = await res.json();

      if (result.success) {
        alert(`Data tanggal ${formatDate(date)} berhasil dihapus.`);
        fetchAvailableDates();

        if (selectedDate === date) {
          setMasterData([]);
        }
      } else {
        alert("Gagal menghapus data.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Terjadi error ketika menghapus data.");
    }
  };

  // SORTING FUNCTION
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

  // FILE UPLOAD HANDLER
  const handleFileUpload = async (e) => {
    const files = [...e.target.files];
    if (files.length === 0) return;

    setUploadedFiles(files.map((f) => f.name));

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    await fetch("/.netlify/functions/upload-file", {
      method: "POST",
      body: formData,
    });

    await fetchAvailableDates();
    alert("Upload selesai!");
  };

  useEffect(() => {
    fetchAvailableDates();
    setTimeout(() => setIsInitialLoad(false), 600);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
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
            <h1 className="text-4xl font-bold text-white">
              Detector Akumulasi & Distribusi Saham
            </h1>
          </div>
          <p className="text-blue-200 text-lg">
            Analisis pola pembelian dan penjualan investor asing
          </p>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "upload"
                ? "bg-blue-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "master"
                ? "bg-blue-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <Database className="w-5 h-5 inline mr-2" /> Master Data (
            {masterData.length})
          </button>

          <button
            onClick={() => setActiveTab("accumulation")}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "accumulation"
                ? "bg-green-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <TrendingUp className="w-5 h-5 inline mr-2" /> Akumulasi (
            {accumulationStocks.length})
          </button>

          <button
            onClick={() => setActiveTab("distribution")}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === "distribution"
                ? "bg-red-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            <TrendingDown className="w-5 h-5 inline mr-2" /> Distribusi (
            {distributionStocks.length})
          </button>
        </div>

        {/* ====== UPLOAD TAB ====== */}
        {activeTab === "upload" && (
          <div className="bg-slate-800 rounded-xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <Database className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                Upload Data Excel / CSV
              </h2>
              <p className="text-slate-300">
                Format nama file:{" "}
                <code className="bg-slate-700 px-2 py-1 rounded">
                  2025-11-28.csv
                </code>
              </p>
            </div>

            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-blue-500 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-lg text-slate-300">
                  <span className="font-semibold">Klik untuk upload</span> atau
                  drag & drop
                </p>
                <p className="text-sm text-slate-400">File CSV atau Excel</p>
              </div>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
              />
            </label>

            {uploadedFiles.length > 0 && (
              <div className="mt-6">
                <h3 className="text-white font-semibold mb-3">
                  File yang sudah diupload:
                </h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-700 px-4 py-2 rounded text-slate-300 text-sm"
                    >
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== MASTER DATA TAB (START) ====== */}
        {activeTab === "master" && (
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
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {/* DATE FILTER */}
            {availableDates.length > 0 && (
              <div className="mb-6">
                <h3 className="text-slate-300 font-semibold mb-3">
                  Filter by Tanggal Upload:
                </h3>

                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 min-w-max">
                    {availableDates.map((date, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            setSelectedDate(date);
                            await fetchMasterData(date);
                          }}
                          className={`px-4 py-2 rounded-lg font-semibold ${
                            selectedDate === date
                              ? "bg-blue-500 text-white"
                              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                          }`}
                        >
                          {formatDate(date)}
                        </button>

                        {/* DELETE DATE */}
                        <button
                          onClick={() => deleteDate(date)}
                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-lg text-sm"
                          title="Hapus data tanggal ini"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* TABLE VIEW */}
            {masterData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Tidak ada data. Upload dulu atau pilih tanggal.
              </div>
            ) : (
              <div>
                <div className="mb-4 text-slate-300">
                  Menampilkan data tanggal:{" "}
                  <span className="text-white font-semibold">
                    {selectedDate ? formatDate(selectedDate) : "Semua tanggal"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-slate-700 text-slate-300">
                      <tr>
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
                          { key: "foreign_net", label: "Foreign Net" },
                        ].map((col, idx) => (
                          <th
                            key={idx}
                            onClick={() => handleSort(col.key)}
                            className="px-4 py-3 cursor-pointer select-none"
                          >
                            {col.label}{" "}
                            {sortConfig.key === col.key &&
                              (sortConfig.direction === "asc" ? "▲" : "▼")}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {masterData.slice(0, 100).map((record, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-700 hover:bg-slate-700/50"
                        >
                          <td className="px-4 py-3 text-slate-300">
                            {formatDate(record.tanggal)}
                          </td>
                          <td className="px-4 py-3 text-white font-semibold">
                            {record.kode_saham}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {record.nama_perusahaan}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {formatNumber(record.open_price)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {formatNumber(record.tertinggi)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {formatNumber(record.terendah)}
                          </td>
                          <td className="px-4 py-3 text-white font-semibold">
                            {formatNumber(record.penutupan)}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {formatNumber(record.volume)}
                          </td>
                          <td className="px-4 py-3 text-green-400">
                            {formatNumber(record.foreign_buy)}
                          </td>
                          <td className="px-4 py-3 text-red-400">
                            {formatNumber(record.foreign_sell)}
                          </td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              record.foreign_net >= 0
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {record.foreign_net >= 0 ? "+" : ""}
                            {formatNumber(record.foreign_net)}
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

        {/* ========= ACCUMULATION TAB ========= */}
        {activeTab === "accumulation" && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-8 h-8 text-green-400" />
              <h2 className="text-2xl font-bold text-white">
                Saham dalam Akumulasi Asing (≥5 Hari)
              </h2>
            </div>

            {accumulationStocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Belum ada data. Upload dan klik "Analisis".
              </div>
            ) : (
              <div className="space-y-4">
                {accumulationStocks.map((stock, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-r from-green-900/30 to-slate-700 p-5 rounded-lg border border-green-500/30"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {stock.kode}
                        </h3>
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
                        <div className="text-slate-400 text-xs mb-1">
                          Durasi Akumulasi
                        </div>
                        <div className="text-green-400 font-bold text-lg">
                          {stock.hari} Hari
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Mulai</div>
                        <div className="text-white font-semibold">
                          {formatDate(stock.mulai)}
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">
                          Total Net
                        </div>
                        <div className="text-green-400 font-bold">
                          +{formatNumber(stock.total_net)}
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">
                          Data Terakhir
                        </div>
                        <div className="text-white font-semibold">
                          {formatDate(stock.latest_date)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========= DISTRIBUTION TAB ========= */}
        {activeTab === "distribution" && (
          <div className="bg-slate-800 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <TrendingDown className="w-8 h-8 text-red-400" />
              <h2 className="text-2xl font-bold text-white">
                Saham dalam Distribusi Asing (≥2 Hari)
              </h2>
            </div>

            {distributionStocks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Belum ada data. Upload dan klik "Analisis".
              </div>
            ) : (
              <div className="space-y-4">
                {distributionStocks.map((stock, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-r from-red-900/30 to-slate-700 p-5 rounded-lg border border-red-500/30"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {stock.kode}
                        </h3>
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
                        <div className="text-slate-400 text-xs mb-1">
                          Durasi Distribusi
                        </div>
                        <div className="text-red-400 font-bold text-lg">
                          {stock.hari} Hari
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">Mulai</div>
                        <div className="text-white font-semibold">
                          {formatDate(stock.mulai)}
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">
                          Total Net
                        </div>
                        <div className="text-red-400 font-bold">
                          {formatNumber(stock.total_net)}
                        </div>
                      </div>

                      <div className="bg-slate-800/50 p-3 rounded">
                        <div className="text-slate-400 text-xs mb-1">
                          Data Terakhir
                        </div>
                        <div className="text-white font-semibold">
                          {formatDate(stock.latest_date)}
                        </div>
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
