import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  Users, CheckCircle, AlertTriangle, XCircle, Search, 
  FileText, BarChart2, MessageSquare, Calendar, TrendingUp, Database, Link, RefreshCw, Trash2, Globe, FilterX, PlayCircle, UserCheck, Settings, AlertCircle, Info, ChevronRight, ExternalLink
} from 'lucide-react';

/** * CATI CES 2026 Analytics Dashboard
 * ระบบวิเคราะห์ผลการตรวจ QC งานสัมภาษณ์ (CATI)
 */

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSHePu18q6f93lQqVW5_JNv6UygyYRGNjT5qOq4nSrROCnGxt1pkdgiPT91rm-_lVpku-PW-LWs-ufv/pub?gid=470556665&single=true&output=csv"; 

const COLORS = {
  'ดีเยี่ยม': '#10B981',
  'ผ่านเกณฑ์': '#3B82F6',
  'ควรปรับปรุง': '#F59E0B',
  'พบข้อผิดพลาด': '#EF4444',
  'ไม่ผ่านเกณฑ์': '#7F1D1D',
};

const RESULT_ORDER = ['ดีเยี่ยม', 'ผ่านเกณฑ์', 'ควรปรับปรุง', 'พบข้อผิดพลาด', 'ไม่ผ่านเกณฑ์'];

const parseCSV = (text) => {
  const result = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  if (!text) return [];
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { cell += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { row.push(cell); cell = ''; }
      else if (char === '\r' || char === '\n') {
        row.push(cell);
        if (row.length > 1 || row[0] !== '') result.push(row);
        row = []; cell = '';
        if (char === '\r' && nextChar === '\n') i++;
      } else cell += char;
    }
  }
  if (cell || row.length > 0) { row.push(cell); result.push(row); }
  return result;
};

const App = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sheetUrl, setSheetUrl] = useState(localStorage.getItem('qc_sheet_url') || DEFAULT_SHEET_URL);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterResult, setFilterResult] = useState('All');
  const [filterACBC, setFilterACBC] = useState('All');
  const [filterSup, setFilterSup] = useState('All');
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [showSync, setShowSync] = useState(!localStorage.getItem('qc_sheet_url') && !DEFAULT_SHEET_URL);
  
  const [activeCell, setActiveCell] = useState({ agent: null, resultType: null });

  useEffect(() => {
    if (sheetUrl && sheetUrl.includes('http')) {
      fetchFromSheet(sheetUrl);
    }
  }, [sheetUrl]);

  const fetchFromSheet = async (urlToFetch) => {
    let finalUrl = urlToFetch.trim();
    if (finalUrl.includes('docs.google.com/spreadsheets/d/') && !finalUrl.includes('pub?')) {
        const idMatch = finalUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch) {
            finalUrl = `https://docs.google.com/spreadsheets/d/e/${idMatch[1]}/pub?output=csv`;
        }
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(finalUrl);
      if (!response.ok) throw new Error("ไม่สามารถเข้าถึงไฟล์ได้ (404 หรือ ลิ้งก์หมดอายุ)");
      
      const csvText = await response.text();
      if (csvText.includes('<!DOCTYPE html>')) throw new Error("ลิ้งก์ที่ส่งมาไม่ใช่ CSV กรุณา Publish to Web เป็น CSV");
      
      const allRows = parseCSV(csvText);
      if (allRows.length < 2) throw new Error("ไฟล์ไม่มีข้อมูล");

      let headerIdx = allRows.findIndex(row => row.some(cell => {
        const c = cell.toString().toLowerCase();
        return c.includes("interviewer") || c.includes("สรุปผล") || c.includes("วันที่สัมภาษณ์");
      }));
      
      if (headerIdx === -1) throw new Error("หาหัวตารางไม่เจอ กรุณาตรวจสอบชื่อคอลัมน์");
      
      const headers = allRows[headerIdx].map(h => h.trim());
      const getIdx = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      
      const idx = {
        year: getIdx("Year"),
        month: getIdx("เดือน"),
        date: getIdx("วันที่สัมภาษณ์"),
        touchpoint: getIdx("TOUCH_POINT"),
        type: getIdx("AC / BC"),
        sup: getIdx("Supervisor"),
        agent: getIdx("Interviewer"),
        audio: getIdx("ไฟล์เสียง"),
        result: getIdx("สรุปผลการสัมภาษณ์"),
        comment: getIdx("Comment")
      };

      if (idx.agent === -1 || idx.result === -1) throw new Error("ไม่พบคอลัมน์ 'Interviewer' หรือ 'สรุปผลการสัมภาษณ์'");

      const parsedData = allRows.slice(headerIdx + 1)
        .filter(row => {
          const agentName = row[idx.agent]?.toString().trim() || "";
          return agentName !== "" && agentName !== "#N/A" && !agentName.toLowerCase().includes("interviewer");
        })
        .map((row, index) => {
          let rawResult = row[idx.result]?.toString().trim() || "N/A";
          let cleanResult = "N/A";
          if (rawResult.includes("ดีเยี่ยม")) cleanResult = "ดีเยี่ยม";
          else if (rawResult.includes("ผ่านเกณฑ์")) cleanResult = "ผ่านเกณฑ์";
          else if (rawResult.includes("ควรปรับปรุง")) cleanResult = "ควรปรับปรุง";
          else if (rawResult.includes("พบข้อผิดพลาด")) cleanResult = "พบข้อผิดพลาด";
          else if (rawResult.includes("ไม่ผ่านเกณฑ์")) cleanResult = "ไม่ผ่านเกณฑ์";

          return {
            id: index,
            year: idx.year !== -1 ? row[idx.year]?.toString().trim() : 'N/A',
            month: idx.month !== -1 ? row[idx.month]?.toString().trim() : 'N/A',
            date: idx.date !== -1 ? row[idx.date]?.toString().trim() : 'N/A',
            touchpoint: idx.touchpoint !== -1 ? row[idx.touchpoint]?.toString().trim() : 'N/A',
            type: idx.type !== -1 ? row[idx.type]?.toString().trim() : 'N/A',
            supervisor: idx.sup !== -1 ? row[idx.sup]?.toString().trim() : 'N/A',
            agent: row[idx.agent]?.toString().trim() || 'Unknown',
            audio: idx.audio !== -1 ? row[idx.audio]?.toString().trim() : '',
            result: cleanResult,
            comment: idx.comment !== -1 ? row[idx.comment]?.toString().trim() : ''
          };
        });

      setData(parsedData);
      localStorage.setItem('qc_sheet_url', finalUrl);
      setShowSync(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearConnection = () => {
    localStorage.removeItem('qc_sheet_url');
    setSheetUrl("");
    setData([]);
    setShowSync(true);
  };

  const availableMonths = useMemo(() => {
    const months = data.map(d => d.month).filter(m => m && m !== 'N/A');
    return [...new Set(months)];
  }, [data]);

  const availableSups = useMemo(() => {
    const sups = data.map(d => d.supervisor).filter(s => s && s !== 'N/A');
    return [...new Set(sups)].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.agent.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.comment.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesResult = filterResult === 'All' || item.result === filterResult;
      const matchesACBC = filterACBC === 'All' || item.type === filterACBC;
      const matchesSup = filterSup === 'All' || item.supervisor === filterSup;
      const matchesYear = selectedYear === 'All' || item.year === selectedYear;
      const matchesMonth = selectedMonth === 'All' || item.month === selectedMonth;
      return matchesSearch && matchesResult && matchesACBC && matchesSup && matchesYear && matchesMonth;
    });
  }, [data, searchTerm, filterResult, filterACBC, filterSup, selectedYear, selectedMonth]);

  const agentSummary = useMemo(() => {
    const summaryMap = {};
    filteredData.forEach(item => {
      if (!summaryMap[item.agent]) {
        summaryMap[item.agent] = { name: item.agent, 'ดีเยี่ยม': 0, 'ผ่านเกณฑ์': 0, 'ควรปรับปรุง': 0, 'พบข้อผิดพลาด': 0, 'ไม่ผ่านเกณฑ์': 0, total: 0 };
      }
      if (summaryMap[item.agent][item.result] !== undefined) {
        summaryMap[item.agent][item.result] += 1;
      }
      summaryMap[item.agent].total += 1;
    });
    return Object.values(summaryMap).sort((a, b) => b.total - a.total);
  }, [filteredData]);

  const detailLogs = useMemo(() => {
    let result = filteredData;
    if (activeCell.agent && activeCell.resultType) {
      result = result.filter(d => d.agent === activeCell.agent && d.result === activeCell.resultType);
    }
    return result;
  }, [filteredData, activeCell]);

  const passRate = useMemo(() => {
    if (filteredData.length === 0) return 0;
    const passed = filteredData.filter(d => ['ดีเยี่ยม', 'ผ่านเกณฑ์'].includes(d.result)).length;
    return ((passed / filteredData.length) * 100).toFixed(1);
  }, [filteredData]);

  const handleMatrixClick = (agentName, type) => {
    if (activeCell.agent === agentName && activeCell.resultType === type) {
      setActiveCell({ agent: null, resultType: null });
    } else {
      setActiveCell({ agent: agentName, resultType: type });
      document.getElementById('detail-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full -mr-32 -mt-32 opacity-50 blur-3xl"></div>
          <div className="flex items-center gap-5 relative z-10">
            <div className={`p-4 rounded-2xl text-white shadow-xl transition-all duration-700 ${data.length > 0 ? 'bg-indigo-600 rotate-0' : 'bg-slate-300 rotate-12 opacity-50'}`}>
              <Database size={32} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3 uppercase italic">
                CATI CES 2026 ANALYTICS
                {loading && <RefreshCw size={24} className="animate-spin text-indigo-500" />}
              </h1>
              <div className="text-slate-500 text-[10px] font-bold flex items-center gap-2 uppercase tracking-[0.2em] mt-1">
                {data.length > 0 ? (
                  <><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Connected: {data.length.toLocaleString()} Cases</>
                ) : (
                  <><div className="w-2 h-2 rounded-full bg-red-400"></div> No Active Connection</>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 relative z-10">
            <button 
              onClick={() => setShowSync(!showSync)} 
              className="flex items-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
            >
              <Settings size={16} /> {data.length > 0 ? 'MANAGE CONNECTION' : 'CONNECT GOOGLE SHEET'}
            </button>
            {data.length > 0 && (
              <button onClick={clearConnection} className="p-3.5 bg-white text-red-500 rounded-xl hover:bg-red-50 border border-slate-200 transition-all hover:border-red-200">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </header>

        {/* Sync Panel */}
        {(showSync || error) && (
          <div className={`p-8 rounded-[2.5rem] shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500 border-2 ${error ? 'bg-red-50 border-red-200' : 'bg-white border-indigo-100'}`}>
            <div className="flex items-center justify-between mb-8">
                <h3 className={`text-xl font-black flex items-center gap-3 italic ${error ? 'text-red-700' : 'text-slate-800'}`}>
                    {error ? <AlertCircle className="text-red-500" /> : <Globe className="text-indigo-500" />}
                    {error ? 'CONNECTION ERROR' : 'SETUP DATA SOURCE'}
                </h3>
                {data.length > 0 && (
                  <button onClick={() => {setShowSync(false); setError(null);}} className="text-slate-400 font-bold text-xs hover:text-slate-600">CLOSE PANEL</button>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <p className="text-xs font-black text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-widest"><Info size={16} className="text-indigo-500"/> Google Sheets CSV Guide</p>
                        <ul className="text-xs text-slate-500 space-y-3 list-none leading-relaxed font-medium">
                            <li className="flex gap-3"><span className="flex-none w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">1</span> Open your QC Spreadsheet.</li>
                            <li className="flex gap-3"><span className="flex-none w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">2</span> Go to <span className="text-indigo-600 font-bold italic">File &gt; Share &gt; Publish to web</span>.</li>
                            <li className="flex gap-3"><span className="flex-none w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">3</span> Select <span className="text-indigo-600 font-bold italic">"ACQC"</span> sheet and choose <span className="text-indigo-600 font-bold italic">"CSV"</span> format.</li>
                            <li className="flex gap-3"><span className="flex-none w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">4</span> Click <span className="text-indigo-600 font-bold italic">Publish</span> and copy the generated link.</li>
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col justify-center gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">CSV DATA URL</label>
                      <input 
                          type="text" placeholder="https://docs.google.com/spreadsheets/d/e/..." 
                          className={`w-full px-6 py-4 bg-white border-2 rounded-2xl text-sm font-medium focus:ring-4 outline-none transition-all ${error ? 'border-red-200 focus:ring-red-100' : 'border-slate-100 focus:ring-indigo-50 focus:border-indigo-500'}`}
                          value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
                      />
                    </div>
                    <button 
                        onClick={() => fetchFromSheet(sheetUrl)} 
                        disabled={loading || !sheetUrl}
                        className={`w-full py-4 text-white rounded-2xl text-xs font-black tracking-widest uppercase transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 ${loading ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-black shadow-slate-200'}`}
                    >
                        {loading ? 'SYNCHRONIZING...' : 'START ANALYSIS'}
                    </button>
                    {error && <p className="text-[10px] text-red-600 font-black mt-2 flex items-center justify-center gap-2 uppercase tracking-wider"><AlertCircle size={14}/> {error}</p>}
                </div>
            </div>
          </div>
        )}

        {data.length > 0 ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Audited', value: filteredData.length, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-100/50', border: 'border-indigo-100' },
                { label: 'Pass Rate', value: `${passRate}%`, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100/50', border: 'border-emerald-100' },
                { label: 'Improvement', value: filteredData.filter(d=>d.result==='ควรปรับปรุง').length, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100/50', border: 'border-orange-100' },
                { label: 'Fatal Errors', value: filteredData.filter(d=>d.result==='พบข้อผิดพลาด' || d.result==='ไม่ผ่านเกณฑ์').length, icon: XCircle, color: 'text-red-600', bg: 'bg-red-100/50', border: 'border-red-100' }
              ].map((kpi, i) => (
                <div key={i} className={`bg-white p-6 md:p-8 rounded-[2rem] border ${kpi.border} shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 group`}>
                  <div className={`w-12 h-12 ${kpi.bg} ${kpi.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}><kpi.icon size={22} strokeWidth={2.5} /></div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{kpi.label}</p>
                  <h2 className={`text-3xl md:text-4xl font-black ${kpi.color} tracking-tight italic`}>{kpi.value.toLocaleString()}</h2>
                </div>
              ))}
            </div>

            {/* Matrix Section */}
            <div className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="font-black text-slate-800 flex items-center gap-3 italic text-xl uppercase tracking-tight">
                    <TrendingUp size={24} className="text-indigo-500" />
                    Quality Performance Matrix
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 italic flex items-center gap-2 tracking-widest opacity-80">
                    <ChevronRight size={14} className="text-indigo-400"/> Click cell to filter details below
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <UserCheck size={16} className="text-indigo-500" />
                    <select className="bg-transparent text-[10px] font-black outline-none cursor-pointer uppercase tracking-wider" value={filterSup} onChange={(e)=>setFilterSup(e.target.value)}>
                      <option value="All">ALL SUPERVISORS</option>
                      {availableSups.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="w-px h-6 bg-slate-200"></div>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Calendar size={16} className="text-indigo-500" />
                    <select className="bg-transparent text-[10px] font-black outline-none cursor-pointer uppercase tracking-wider" value={selectedMonth} onChange={(e)=>setSelectedMonth(e.target.value)}>
                      <option value="All">ALL MONTHS</option>
                      {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-white z-20 font-black text-slate-400 text-[10px] uppercase tracking-[0.2em] border-b border-slate-100 shadow-sm">
                    <tr>
                      <th rowSpan="2" className="px-10 py-8 border-b-2 border-slate-100 border-r border-slate-50 bg-white min-w-[200px]">INTERVIEWER NAME</th>
                      <th colSpan={RESULT_ORDER.length} className="px-4 py-5 text-center border-b-2 border-slate-100 bg-slate-50/80 text-indigo-600 font-black italic">QUALITY RESULTS SUMMARY</th>
                      <th rowSpan="2" className="px-10 py-8 text-center bg-slate-50 text-slate-800 border-b-2 border-slate-100 border-l border-slate-100">TOTAL</th>
                    </tr>
                    <tr className="bg-white">
                      {RESULT_ORDER.map(type => (
                        <th key={type} className="px-4 py-4 text-center border-b border-slate-100 border-r border-slate-50 text-slate-500 font-black tracking-tighter">
                          {type}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium">
                    {agentSummary.length > 0 ? agentSummary.map((agent, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-all duration-200 group">
                        <td className="px-10 py-5 font-black text-slate-700 border-r border-slate-50 group-hover:text-indigo-600">{agent.name}</td>
                        {RESULT_ORDER.map(type => {
                          const isActive = activeCell.agent === agent.name && activeCell.resultType === type;
                          const val = agent[type];
                          return (
                            <td 
                              key={type} 
                              className={`px-4 py-5 text-center border-r border-slate-50 transition-all ${val > 0 ? 'cursor-pointer hover:bg-white hover:shadow-inner' : ''} ${isActive ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-500 z-10' : ''}`}
                              onClick={() => val > 0 && handleMatrixClick(agent.name, type)}
                            >
                              {val > 0 ? (
                                <span className="text-base font-black" style={{ color: COLORS[type] }}>
                                  {val}
                                </span>
                              ) : (
                                <span className="text-slate-200 font-black">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-10 py-5 text-center bg-slate-50/30 font-black text-slate-900 border-l border-slate-100 group-hover:bg-indigo-50 transition-colors">{agent.total}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={RESULT_ORDER.length + 2} className="py-20 text-center text-slate-400 font-bold italic tracking-widest uppercase opacity-40">No records found for current filters</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed Case Log */}
            <div id="detail-section" className="bg-white rounded-[3rem] shadow-sm border border-slate-200 overflow-hidden scroll-mt-8">
              <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="space-y-3">
                  <h3 className="font-black text-slate-800 uppercase tracking-[0.2em] text-xs flex items-center gap-3 italic">
                    <MessageSquare size={18} className="text-indigo-500" /> Granular Case Intelligence
                  </h3>
                  {activeCell.agent && (
                    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
                      <span className="text-[10px] font-black px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl flex items-center gap-2 shadow-sm border border-indigo-100">
                        FILTERING: {activeCell.agent} — {activeCell.resultType}
                        <button onClick={() => setActiveCell({ agent: null, resultType: null })} className="ml-2 bg-indigo-200/50 p-1 rounded-lg hover:bg-red-100 hover:text-red-600 transition-all">
                          <FilterX size={14} />
                        </button>
                      </span>
                    </div>
                  )}
                </div>
                <div className="relative w-full md:w-96 group">
                  <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                  <input 
                    type="text" placeholder="Search by agent name, feedback, or keywords..." 
                    className="w-full pl-14 pr-8 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-400 transition-all shadow-inner"
                    value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[700px]">
                <table className="w-full text-left text-xs font-medium">
                  <thead className="sticky top-0 bg-white shadow-sm z-10 border-b border-slate-100 font-black text-slate-400 uppercase tracking-[0.2em]">
                    <tr>
                      <th className="px-10 py-6">METADATA</th>
                      <th className="px-10 py-6">INTERVIEWER / PROJECT</th>
                      <th className="px-6 py-6 text-center">QA STATUS</th>
                      <th className="px-10 py-6">QC FEEDBACK & ARTIFACTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailLogs.length > 0 ? detailLogs.slice(0, 200).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-all group">
                        <td className="px-10 py-6">
                          <div className="font-black text-slate-800 text-sm">{item.date}</div>
                          <div className="text-[9px] text-slate-400 uppercase font-black mt-1 tracking-widest flex items-center gap-1.5"><UserCheck size={10}/> SUP: {item.supervisor}</div>
                          <div className={`text-[9px] font-black inline-block px-2.5 py-1 rounded-lg mt-2 shadow-sm ${item.type === 'AC' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-white'}`}>{item.type}</div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors flex items-center gap-2">{item.agent}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic mt-1.5 flex items-center gap-1.5 opacity-70">
                            <TrendingUp size={12}/> {item.touchpoint}
                          </div>
                        </td>
                        <td className="px-6 py-6 text-center">
                          <span className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black shadow-sm border" style={{ backgroundColor: `${COLORS[item.result]}08`, color: COLORS[item.result], borderColor: `${COLORS[item.result]}20` }}>
                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: COLORS[item.result] }}></div>
                            {item.result}
                          </span>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex flex-col gap-3">
                            <p className="text-slate-500 font-medium italic leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                              {item.comment ? `"${item.comment}"` : <span className="text-slate-200">No specific comment recorded.</span>}
                            </p>
                            {item.audio && item.audio.includes('http') && (
                              <a 
                                href={item.audio} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-black text-[10px] uppercase tracking-widest transition-all w-fit hover:translate-x-1"
                              >
                                <PlayCircle size={16} /> LISTEN SESSION RECORDING <ExternalLink size={12}/>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-10 py-32 text-center">
                            <div className="bg-slate-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200"><FilterX size={40}/></div>
                            <h4 className="text-slate-300 font-black uppercase tracking-widest italic text-xl">No Matching Records</h4>
                            <p className="text-slate-400 text-[10px] font-bold mt-2 uppercase tracking-widest">Adjust filters to find more results</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          !loading && (
            <div className="bg-white rounded-[4rem] border-4 border-dashed border-slate-100 py-32 text-center shadow-inner relative overflow-hidden group">
                <div className="absolute inset-0 bg-indigo-50/20 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                <div className="bg-slate-50 w-28 h-28 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-sm relative z-10">
                  <Database size={48} className="text-slate-200" />
                </div>
                <h2 className="text-3xl font-black text-slate-200 tracking-tighter uppercase italic relative z-10">System Idle: Pending Source</h2>
                <p className="text-slate-400 text-xs mt-4 max-w-sm mx-auto font-black uppercase tracking-[0.2em] leading-relaxed px-6 relative z-10">
                  Please click <span className="text-indigo-500 underline underline-offset-4">"Connect Google Sheet"</span> and paste your Published CSV URL to initialize analytics.
                </p>
            </div>
          )
        )}

      </div>
      
      {/* Footer Branding */}
      <footer className="max-w-7xl mx-auto mt-12 mb-8 text-center text-slate-400">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] italic flex items-center justify-center gap-3">
          <span className="w-12 h-px bg-slate-200"></span> 
          CATI CES 2026 Analytical Intelligence 
          <span className="w-12 h-px bg-slate-200"></span>
        </p>
      </footer>
    </div>
  );
};

export default App;