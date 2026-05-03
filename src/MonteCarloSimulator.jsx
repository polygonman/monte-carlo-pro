import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, BarChart, Bar, ReferenceLine, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Target, AlertTriangle, Play, Info } from 'lucide-react';

// ============================================================
// Monte Carlo Engine
// ============================================================

// Box-Muller transform สำหรับสุ่มค่าจาก normal distribution
function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ฟังก์ชันจำลอง 1 simulation path
function simulatePath(params) {
  const {
    initialCapital,
    annualContribution,
    yearsToRetirement,
    yearsInRetirement,
    annualWithdrawal,
    meanReturn,
    stdDev,
    inflationRate,
  } = params;

  const totalYears = yearsToRetirement + yearsInRetirement;
  const path = [initialCapital];
  let balance = initialCapital;

  for (let year = 1; year <= totalYears; year++) {
    // สุ่มผลตอบแทนจาก normal distribution
    const annualReturn = meanReturn + stdDev * randomNormal();
    
    // เติบโตด้วย return
    balance = balance * (1 + annualReturn);
    
    if (year <= yearsToRetirement) {
      // ช่วงสะสม: เพิ่มเงินออม (ปรับตามเงินเฟ้อ)
      balance += annualContribution * Math.pow(1 + inflationRate, year - 1);
    } else {
      // ช่วงเกษียณ: ถอนเงิน (ปรับตามเงินเฟ้อ)
      const withdrawalInflated = annualWithdrawal * Math.pow(1 + inflationRate, year - 1);
      balance -= withdrawalInflated;
    }
    
    if (balance < 0) balance = 0;
    path.push(balance);
  }

  return path;
}

// รัน Monte Carlo ทั้งหมด
function runMonteCarlo(params, numSimulations = 1000) {
  const allPaths = [];
  let successCount = 0;
  const retirementStartYear = params.yearsToRetirement;
  
  for (let i = 0; i < numSimulations; i++) {
    const path = simulatePath(params);
    allPaths.push(path);
    // นับว่าสำเร็จถ้ายังมีเงินเหลือหลังเกษียณ
    if (path[path.length - 1] > 0) successCount++;
  }

  // คำนวณ percentile ของแต่ละปี
  const totalYears = params.yearsToRetirement + params.yearsInRetirement;
  const percentileData = [];
  
  for (let year = 0; year <= totalYears; year++) {
    const yearValues = allPaths.map(p => p[year]).sort((a, b) => a - b);
    percentileData.push({
      year,
      age: year, // placeholder
      p10: yearValues[Math.floor(numSimulations * 0.1)],
      p25: yearValues[Math.floor(numSimulations * 0.25)],
      p50: yearValues[Math.floor(numSimulations * 0.5)],
      p75: yearValues[Math.floor(numSimulations * 0.75)],
      p90: yearValues[Math.floor(numSimulations * 0.9)],
      isRetirement: year >= retirementStartYear,
    });
  }

  // Distribution ของ ending balance
  const endingBalances = allPaths.map(p => p[p.length - 1]).sort((a, b) => a - b);
  
  return {
    successRate: (successCount / numSimulations) * 100,
    percentileData,
    endingBalances,
    medianEnding: endingBalances[Math.floor(numSimulations * 0.5)],
    worstCase: endingBalances[Math.floor(numSimulations * 0.1)],
    bestCase: endingBalances[Math.floor(numSimulations * 0.9)],
  };
}

// จัด histogram สำหรับ distribution chart
function buildHistogram(values, bins = 20) {
  const min = values[0];
  const max = values[values.length - 1];
  const binSize = (max - min) / bins;
  const histogram = Array(bins).fill(0).map((_, i) => ({
    range: min + i * binSize,
    rangeLabel: `${Math.round((min + i * binSize) / 1000000)}M`,
    count: 0,
  }));
  
  values.forEach(v => {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    histogram[idx].count++;
  });
  
  return histogram;
}

// Format เงินบาท
const formatBaht = (n) => {
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `฿${(n / 1000).toFixed(0)}K`;
  return `฿${Math.round(n)}`;
};

const formatBahtFull = (n) => {
  return `฿${Math.round(n).toLocaleString()}`;
};

// ============================================================
// Main Component
// ============================================================

export default function MonteCarloSimulator() {
  const [inputs, setInputs] = useState({
    currentAge: 55,
    retirementAge: 60,
    lifeExpectancy: 85,
    initialCapital: 3000000,
    annualContribution: 200000,
    annualWithdrawal: 500000,
    meanReturn: 0.05,
    stdDev: 0.10,
    inflationRate: 0.025,
  });

  const [results, setResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [numSims, setNumSims] = useState(1000);

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const runSimulation = () => {
    setIsRunning(true);
    // ใช้ setTimeout เพื่อให้ UI update ก่อน
    setTimeout(() => {
      const params = {
        initialCapital: inputs.initialCapital,
        annualContribution: inputs.annualContribution,
        yearsToRetirement: inputs.retirementAge - inputs.currentAge,
        yearsInRetirement: inputs.lifeExpectancy - inputs.retirementAge,
        annualWithdrawal: inputs.annualWithdrawal,
        meanReturn: inputs.meanReturn,
        stdDev: inputs.stdDev,
        inflationRate: inputs.inflationRate,
      };
      
      const res = runMonteCarlo(params, numSims);
      
      // เพิ่ม age ให้ percentileData
      res.percentileData = res.percentileData.map(d => ({
        ...d,
        age: inputs.currentAge + d.year,
      }));
      
      setResults(res);
      setIsRunning(false);
    }, 50);
  };

  const histogram = useMemo(() => {
    if (!results) return [];
    return buildHistogram(results.endingBalances);
  }, [results]);

  const successRateColor = results
    ? results.successRate >= 85 ? '#10b981' 
    : results.successRate >= 70 ? '#f59e0b' 
    : '#ef4444'
    : '#94a3b8';

  const successRateLabel = results
    ? results.successRate >= 85 ? 'ปลอดภัยดี'
    : results.successRate >= 70 ? 'ควรปรับแผน'
    : 'เสี่ยงสูง'
    : '';

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8" style={{ fontFamily: "'IBM Plex Sans Thai', -apple-system, sans-serif" }}>
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-10 bg-indigo-600 rounded-full"></div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Monte Carlo Simulator</h1>
              <p className="text-sm text-slate-600">จำลองความน่าจะเป็นของแผนเกษียณด้วยการสุ่ม {numSims.toLocaleString()} สถานการณ์</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Input Panel */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                ข้อมูลส่วนตัว
              </h2>
              <div className="space-y-4">
                <InputField label="อายุปัจจุบัน" value={inputs.currentAge} onChange={(v) => handleInputChange('currentAge', v)} suffix="ปี" />
                <InputField label="อายุที่ต้องการเกษียณ" value={inputs.retirementAge} onChange={(v) => handleInputChange('retirementAge', v)} suffix="ปี" />
                <InputField label="วางแผนถึงอายุ" value={inputs.lifeExpectancy} onChange={(v) => handleInputChange('lifeExpectancy', v)} suffix="ปี" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                เงินและกระแสเงินสด
              </h2>
              <div className="space-y-4">
                <InputField label="เงินต้นปัจจุบัน" value={inputs.initialCapital} onChange={(v) => handleInputChange('initialCapital', v)} suffix="บาท" />
                <InputField label="เงินออมต่อปี (ก่อนเกษียณ)" value={inputs.annualContribution} onChange={(v) => handleInputChange('annualContribution', v)} suffix="บาท" />
                <InputField label="ค่าใช้จ่ายต่อปี (หลังเกษียณ)" value={inputs.annualWithdrawal} onChange={(v) => handleInputChange('annualWithdrawal', v)} suffix="บาท" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                สมมติฐานตลาด
              </h2>
              <div className="space-y-4">
                <InputField label="ผลตอบแทนเฉลี่ย/ปี" value={inputs.meanReturn * 100} onChange={(v) => handleInputChange('meanReturn', v / 100)} suffix="%" step="0.1" />
                <InputField label="ความผันผวน (SD)" value={inputs.stdDev * 100} onChange={(v) => handleInputChange('stdDev', v / 100)} suffix="%" step="0.1" />
                <InputField label="เงินเฟ้อ/ปี" value={inputs.inflationRate * 100} onChange={(v) => handleInputChange('inflationRate', v / 100)} suffix="%" step="0.1" />
                <div className="pt-2">
                  <label className="text-xs text-slate-600 mb-1 block">จำนวน simulation</label>
                  <select 
                    value={numSims} 
                    onChange={(e) => setNumSims(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value={500}>500 (เร็ว)</option>
                    <option value={1000}>1,000 (สมดุล)</option>
                    <option value={5000}>5,000 (แม่นยำ)</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={runSimulation}
              disabled={isRunning}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              <Play className="w-5 h-5" />
              {isRunning ? 'กำลังคำนวณ...' : 'รัน Simulation'}
            </button>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-8 space-y-4">
            
            {!results ? (
              <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Info className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">พร้อมเริ่มการจำลอง</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    ป้อนข้อมูลทางด้านซ้ายและกด "รัน Simulation" เพื่อดูว่าแผนเกษียณของคุณมีโอกาสสำเร็จกี่เปอร์เซ็นต์ 
                    ภายใต้สภาวะตลาดที่ผันผวน
                  </p>
                  <div className="mt-6 pt-6 border-t border-slate-200 text-left space-y-2 text-sm text-slate-600">
                    <p>✓ ใช้การสุ่มผลตอบแทนจาก Normal Distribution</p>
                    <p>✓ ปรับค่าใช้จ่ายตามเงินเฟ้อทุกปี</p>
                    <p>✓ แสดงผลด้วย percentile 10-90</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Success Rate Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">โอกาสสำเร็จตามแผน</p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-5xl font-bold" style={{ color: successRateColor }}>
                          {results.successRate.toFixed(1)}%
                        </span>
                        <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ backgroundColor: successRateColor + '20', color: successRateColor }}>
                          {successRateLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        {Math.round(numSims * results.successRate / 100).toLocaleString()} จาก {numSims.toLocaleString()} สถานการณ์ เงินยังเหลือถึงอายุ {inputs.lifeExpectancy}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">แย่สุด (P10)</p>
                        <p className="text-lg font-bold text-red-600">{formatBaht(results.worstCase)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">กลาง (P50)</p>
                        <p className="text-lg font-bold text-slate-900">{formatBaht(results.medianEnding)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">ดีสุด (P90)</p>
                        <p className="text-lg font-bold text-emerald-600">{formatBaht(results.bestCase)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Percentile Chart */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">เส้นทางความมั่งคั่งตามอายุ</h3>
                  <p className="text-xs text-slate-500 mb-4">ช่วงสีแสดง 80% ของผลลัพธ์ทั้งหมด (P10–P90) · เส้นทึบคือค่ากลาง (P50)</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={results.percentileData}>
                      <defs>
                        <linearGradient id="colorRange" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05}/>
                        </linearGradient>
                        <linearGradient id="colorRange2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="age" stroke="#64748b" fontSize={12} label={{ value: 'อายุ', position: 'insideBottom', offset: -5, fontSize: 12 }} />
                      <YAxis stroke="#64748b" fontSize={12} tickFormatter={formatBaht} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px' }}
                        formatter={(value) => formatBahtFull(value)}
                        labelFormatter={(age) => `อายุ ${age} ปี`}
                      />
                      <ReferenceLine x={inputs.retirementAge} stroke="#dc2626" strokeDasharray="5 5" label={{ value: 'เกษียณ', position: 'top', fontSize: 11, fill: '#dc2626' }} />
                      <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="url(#colorRange)" />
                      <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="url(#colorRange2)" />
                      <Area type="monotone" dataKey="p25" stackId="3" stroke="none" fill="white" />
                      <Area type="monotone" dataKey="p10" stackId="4" stroke="none" fill="white" />
                      <Line type="monotone" dataKey="p50" stroke="#4338ca" strokeWidth={2.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Distribution Histogram */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">การกระจายของเงินคงเหลือ ณ สิ้นอายุ {inputs.lifeExpectancy}</h3>
                  <p className="text-xs text-slate-500 mb-4">นับจำนวนสถานการณ์ที่ลงเอยในแต่ละช่วงเงิน</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={histogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="rangeLabel" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px' }}
                        formatter={(value) => [`${value} สถานการณ์`, 'จำนวน']}
                      />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Interpretation Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-2xl p-6 border border-indigo-100">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-600" />
                    การตีความผลลัพธ์
                  </h3>
                  <div className="space-y-2 text-sm text-slate-700">
                    {results.successRate >= 85 && (
                      <p>✓ แผนนี้มีความเป็นไปได้สูงที่จะสำเร็จ เงินน่าจะเพียงพอจนถึงอายุ {inputs.lifeExpectancy} แม้ในสถานการณ์ตลาดผันผวน</p>
                    )}
                    {results.successRate >= 70 && results.successRate < 85 && (
                      <p>⚠ ควรพิจารณาเพิ่มเงินออม ลดค่าใช้จ่ายหลังเกษียณ หรือทำงานต่ออีก 2-3 ปี เพื่อเพิ่มโอกาสสำเร็จ</p>
                    )}
                    {results.successRate < 70 && (
                      <p>⚠ แผนนี้มีความเสี่ยงสูงที่เงินจะหมดก่อนอายุ {inputs.lifeExpectancy} แนะนำให้ปรับปรุงอย่างน้อยหนึ่งตัวแปร</p>
                    )}
                    <p className="text-xs text-slate-500 pt-2 border-t border-indigo-100">
                      <strong>ข้อจำกัด:</strong> โมเดลสมมติว่าผลตอบแทนมีการกระจายแบบปกติ (normal distribution) ซึ่งในความเป็นจริงตลาดมักมี fat tails และ sequence-of-returns risk ที่โมเดลนี้ไม่ได้ครอบคลุมเต็มที่
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Input Component
// ============================================================

function InputField({ label, value, onChange, suffix, step = "1" }) {
  return (
    <div>
      <label className="text-xs text-slate-600 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-14 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}
