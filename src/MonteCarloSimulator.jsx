import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart, BarChart, Bar,
  ReferenceLine, Legend,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Target, AlertTriangle, Play, Info,
  ChevronDown, ChevronUp, Zap, Receipt, Landmark, BarChart2,
  Plus, Trash2, Save, GitCompare,
} from 'lucide-react';
import { runMonteCarlo, buildHistogram, formatBaht, formatBahtFull } from './engine.js';

// ============================================================
// Scenario colors for comparison overlay
// ============================================================
const SCENARIO_COLORS = ['#4338ca', '#059669', '#d97706'];

// ============================================================
// Collapsible section wrapper
// ============================================================
function Section({ title, icon: Icon, iconColor = 'text-indigo-600', children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
        aria-expanded={open}
      >
        <span className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          {title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 space-y-4">{children}</div>}
    </div>
  );
}

// ============================================================
// Input field
// ============================================================
function InputField({ label, value, onChange, suffix, step = '1', min, ariaLabel }) {
  return (
    <div>
      <label className="text-xs text-slate-600 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          aria-label={ariaLabel || label}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-14 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}

// ============================================================
// Slider field
// ============================================================
function SliderField({ label, value, onChange, min = 0, max = 50, step = 0.5, suffix = '%', ariaLabel }) {
  const display = (parseFloat(value) || 0).toFixed(1);
  return (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-xs text-slate-600">{label}</label>
        <span className="text-xs font-medium text-slate-800">{display}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel || label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-indigo-600"
      />
    </div>
  );
}

// ============================================================
// Life shock preset definitions
// ============================================================
const SHOCK_PRESETS = [
  { name: 'ป่วยหนัก / ค่ารักษา', impactType: 'expense', impactValue: 500_000, probability: 0.03 },
  { name: 'ตกงาน / ไม่มีรายได้ 1 ปี', impactType: 'lostIncome', impactValue: 0, probability: 0.05 },
  { name: 'วิกฤตเศรษฐกิจ (ตลาดลง 30%)', impactType: 'portfolioLoss', impactValue: 0.30, probability: 0.04 },
  { name: 'ปัญหาการเงินครอบครัว', impactType: 'expense', impactValue: 1_000_000, probability: 0.02 },
];

// ============================================================
// Main Component
// ============================================================
export default function MonteCarloSimulator() {
  // ── Basic inputs ──────────────────────────────────────────
  const [inputs, setInputs] = useState({
    currentAge: 35,
    retirementAge: 60,
    lifeExpectancy: 85,
    initialCapital: 0,
    annualContribution: 12_000,
    annualWithdrawal: 600_000,
    meanReturn: 0.10,
    stdDev: 0.10,
    inflationRate: 0.025,
  });

  // ── Tax inputs ────────────────────────────────────────────
  const [taxInputs, setTaxInputs] = useState({
    capitalGainsTaxRate: 0,
    withdrawalTaxRate: 0,
  });

  // ── Pension / Social Security ─────────────────────────────
  const [pensionInputs, setPensionInputs] = useState({
    pensionAnnualAmount: 0,
    pensionStartAge: 60,
    pensionInflationAdjusted: true,
  });

  // ── Life shocks ───────────────────────────────────────────
  const [lifeShocks, setLifeShocks] = useState([]);

  // ── Simulation control ────────────────────────────────────
  const [results, setResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [numSims, setNumSims] = useState(1000);

  // ── Scenario comparison ───────────────────────────────────
  const [savedScenarios, setSavedScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState('');

  // ─────────────────────────────────────────────────────────

  const handleInput = (field, value) =>
    setInputs(prev => ({ ...prev, [field]: value === '' ? '' : (parseFloat(value) || 0) }));

  const handleTax = (field, value) =>
    setTaxInputs(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));

  const handlePension = (field, value) =>
    setPensionInputs(prev => ({ ...prev, [field]: value === '' ? '' : (parseFloat(value) || 0) }));

  // ── Add/remove life shocks ────────────────────────────────
  const addPresetShock = (preset) => {
    setLifeShocks(prev => [...prev, { ...preset }]);
  };

  const addCustomShock = () => {
    setLifeShocks(prev => [
      ...prev,
      { name: 'เหตุการณ์ใหม่', impactType: 'expense', impactValue: 200_000, probability: 0.03 },
    ]);
  };

  const updateShock = (index, field, value) => {
    setLifeShocks(prev => prev.map((s, i) =>
      i === index ? { ...s, [field]: field === 'name' ? value : (parseFloat(value) || 0) } : s
    ));
  };

  const removeShock = (index) => {
    setLifeShocks(prev => prev.filter((_, i) => i !== index));
  };

  // ── Build params ──────────────────────────────────────────
  const buildParams = () => {
    const n = (v) => parseFloat(v) || 0;
    return {
      initialCapital: n(inputs.initialCapital),
      annualContribution: n(inputs.annualContribution),
      yearsToRetirement: n(inputs.retirementAge) - n(inputs.currentAge),
      yearsInRetirement: n(inputs.lifeExpectancy) - n(inputs.retirementAge),
      annualWithdrawal: n(inputs.annualWithdrawal),
      meanReturn: n(inputs.meanReturn),
      stdDev: n(inputs.stdDev),
      inflationRate: n(inputs.inflationRate),
      capitalGainsTaxRate: n(taxInputs.capitalGainsTaxRate) / 100,
      withdrawalTaxRate: n(taxInputs.withdrawalTaxRate) / 100,
      pensionAnnualAmount: n(pensionInputs.pensionAnnualAmount),
      pensionStartYear: n(pensionInputs.pensionStartAge) - n(inputs.currentAge),
      pensionInflationAdjusted: pensionInputs.pensionInflationAdjusted,
      lifeShocks: lifeShocks.map(s => ({
        probability: s.probability,
        impactType: s.impactType,
        impactValue: s.impactType === 'portfolioLoss'
          ? s.impactValue         // already 0–1
          : s.impactValue,        // absolute baht
      })),
    };
  };

  // ── Run simulation ────────────────────────────────────────
  const runSimulation = () => {
    setIsRunning(true);
    setTimeout(() => {
      const params = buildParams();
      const res = runMonteCarlo(params, numSims);
      res.percentileData = res.percentileData.map(d => ({
        ...d,
        age: inputs.currentAge + d.year,
      }));
      setResults(res);
      setIsRunning(false);
    }, 50);
  };

  // ── Save scenario ─────────────────────────────────────────
  const saveScenario = () => {
    if (!results) return;
    const name = scenarioName.trim() || `สถานการณ์ ${savedScenarios.length + 1}`;
    setSavedScenarios(prev => [
      ...prev.slice(0, 2), // max 3 scenarios
      {
        name,
        inputs: { ...inputs },
        taxInputs: { ...taxInputs },
        pensionInputs: { ...pensionInputs },
        lifeShocks: [...lifeShocks],
        results: {
          successRate: results.successRate,
          medianEnding: results.medianEnding,
          bestCase: results.bestCase,
          worstCase: results.worstCase,
          percentileData: results.percentileData,
        },
      },
    ]);
    setScenarioName('');
  };

  // ── Histogram ─────────────────────────────────────────────
  const histogram = useMemo(() => {
    if (!results) return [];
    return buildHistogram(results.endingBalances);
  }, [results]);

  // ── Derived display values ────────────────────────────────
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

  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8" style={{ fontFamily: "'IBM Plex Sans Thai', -apple-system, sans-serif" }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-10 bg-indigo-600 rounded-full" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Monte Carlo Simulator</h1>
              <p className="text-sm text-slate-600">
                จำลองความน่าจะเป็นของแผนเกษียณด้วยการสุ่ม {numSims.toLocaleString()} สถานการณ์
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── Input Panel ─────────────────────────────────── */}
          <div className="lg:col-span-4 space-y-4">

            <Section title="ข้อมูลส่วนตัว" icon={Target}>
              <InputField label="อายุปัจจุบัน" value={inputs.currentAge} onChange={v => handleInput('currentAge', v)} suffix="ปี" />
              <InputField label="อายุที่ต้องการเกษียณ" value={inputs.retirementAge} onChange={v => handleInput('retirementAge', v)} suffix="ปี" />
              <InputField label="วางแผนถึงอายุ" value={inputs.lifeExpectancy} onChange={v => handleInput('lifeExpectancy', v)} suffix="ปี" />
            </Section>

            <Section title="เงินและกระแสเงินสด" icon={TrendingUp} iconColor="text-emerald-600">
              <InputField label="เงินต้นปัจจุบัน" value={inputs.initialCapital} onChange={v => handleInput('initialCapital', v)} suffix="บาท" />
              <InputField label="เงินออมต่อปี (ก่อนเกษียณ)" value={inputs.annualContribution} onChange={v => handleInput('annualContribution', v)} suffix="บาท" />
              <InputField label="ค่าใช้จ่ายต่อปี (หลังเกษียณ)" value={inputs.annualWithdrawal} onChange={v => handleInput('annualWithdrawal', v)} suffix="บาท" />
            </Section>

            <Section title="สมมติฐานตลาด" icon={AlertTriangle} iconColor="text-amber-600">
              <InputField label="ผลตอบแทนเฉลี่ย/ปี" value={inputs.meanReturn * 100} onChange={v => handleInput('meanReturn', v === '' ? '' : v / 100)} suffix="%" step="0.1" />
              <InputField label="ความผันผวน (SD)" value={inputs.stdDev * 100} onChange={v => handleInput('stdDev', v === '' ? '' : v / 100)} suffix="%" step="0.1" />
              <InputField label="เงินเฟ้อ/ปี" value={inputs.inflationRate * 100} onChange={v => handleInput('inflationRate', v === '' ? '' : v / 100)} suffix="%" step="0.1" />
              <div className="pt-2">
                <label className="text-xs text-slate-600 mb-1 block">จำนวน simulation</label>
                <select
                  value={numSims}
                  onChange={e => setNumSims(parseInt(e.target.value))}
                  aria-label="จำนวน simulation"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value={500}>500 (เร็ว)</option>
                  <option value={1000}>1,000 (สมดุล)</option>
                  <option value={5000}>5,000 (แม่นยำ)</option>
                </select>
              </div>
            </Section>

            {/* ── Life Shocks ──────────────────────────────── */}
            <Section title="เหตุการณ์ไม่คาดฝัน (Fat Tails)" icon={Zap} iconColor="text-red-500" defaultOpen={false}>
              <p className="text-xs text-slate-500">เพิ่มความเสี่ยงจากเหตุการณ์รุนแรงที่อาจเกิดขึ้นในแต่ละปี เพื่อให้การจำลองสมจริงยิ่งขึ้น</p>

              {/* Presets */}
              <div className="grid grid-cols-1 gap-2">
                {SHOCK_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => addPresetShock(preset)}
                    className="text-left px-3 py-2 text-xs border border-slate-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors flex justify-between items-center"
                  >
                    <span className="font-medium text-slate-700">{preset.name}</span>
                    <span className="text-slate-400">+</span>
                  </button>
                ))}
              </div>

              {/* Active shocks */}
              {lifeShocks.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  {lifeShocks.map((shock, i) => (
                    <div key={i} className="bg-red-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={shock.name}
                          onChange={e => updateShock(i, 'name', e.target.value)}
                          aria-label="ชื่อเหตุการณ์"
                          className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-md bg-white"
                        />
                        <button onClick={() => removeShock(i)} aria-label="ลบเหตุการณ์" className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500">ประเภท</label>
                          <select
                            value={shock.impactType}
                            onChange={e => updateShock(i, 'impactType', e.target.value)}
                            aria-label="ประเภทผลกระทบ"
                            className="w-full text-xs px-2 py-1 border border-slate-200 rounded-md bg-white mt-1"
                          >
                            <option value="expense">ค่าใช้จ่ายครั้งเดียว (บาท)</option>
                            <option value="portfolioLoss">ตลาดร่วง (%)</option>
                            <option value="lostIncome">ไม่มีรายได้ (1 ปี)</option>
                          </select>
                        </div>
                        {shock.impactType !== 'lostIncome' && (
                          <div>
                            <label className="text-xs text-slate-500">
                              {shock.impactType === 'portfolioLoss' ? 'ลดลง (0–1)' : 'จำนวน (บาท)'}
                            </label>
                            <input
                              type="number"
                              value={shock.impactValue}
                              step={shock.impactType === 'portfolioLoss' ? 0.05 : 100000}
                              onChange={e => updateShock(i, 'impactValue', e.target.value)}
                              aria-label="มูลค่าผลกระทบ"
                              className="w-full text-xs px-2 py-1 border border-slate-200 rounded-md bg-white mt-1"
                            />
                          </div>
                        )}
                      </div>
                      <SliderField
                        label={`โอกาสเกิด/ปี: ${(shock.probability * 100).toFixed(1)}%`}
                        value={shock.probability * 100}
                        onChange={v => updateShock(i, 'probability', v / 100)}
                        min={0}
                        max={20}
                        step={0.5}
                        ariaLabel="โอกาสเกิดต่อปี"
                      />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={addCustomShock}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors"
              >
                <Plus className="w-3 h-3" /> เพิ่มเหตุการณ์เอง
              </button>
            </Section>

            {/* ── Tax ─────────────────────────────────────── */}
            <Section title="ภาษี" icon={Receipt} iconColor="text-purple-600" defaultOpen={false}>
              <p className="text-xs text-slate-500">ภาษีกำไรจากการลงทุนและภาษีถอนเงิน</p>
              <SliderField
                label="ภาษีกำไรทุน (Capital Gains)"
                value={taxInputs.capitalGainsTaxRate}
                onChange={v => handleTax('capitalGainsTaxRate', v)}
                min={0} max={30} step={0.5}
                ariaLabel="ภาษีกำไรทุน"
              />
              <SliderField
                label="ภาษีถอนเงินหลังเกษียณ"
                value={taxInputs.withdrawalTaxRate}
                onChange={v => handleTax('withdrawalTaxRate', v)}
                min={0} max={30} step={0.5}
                ariaLabel="ภาษีถอนเงิน"
              />
            </Section>

            {/* ── Pension ──────────────────────────────────── */}
            <Section title="บำนาญ / รายได้เสริม" icon={Landmark} iconColor="text-blue-600" defaultOpen={false}>
              <p className="text-xs text-slate-500">รายได้ประจำหลังเกษียณ เช่น บำนาญรัฐ กองทุนสำรองเลี้ยงชีพ ประกัน</p>
              <InputField
                label="รายได้บำนาญต่อปี (บาท)"
                value={pensionInputs.pensionAnnualAmount}
                onChange={v => handlePension('pensionAnnualAmount', v)}
                suffix="บาท"
              />
              <InputField
                label="เริ่มรับบำนาญเมื่ออายุ"
                value={pensionInputs.pensionStartAge}
                onChange={v => handlePension('pensionStartAge', v)}
                suffix="ปี"
              />
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pensionInputs.pensionInflationAdjusted}
                  onChange={e => setPensionInputs(p => ({ ...p, pensionInflationAdjusted: e.target.checked }))}
                  aria-label="ปรับบำนาญตามเงินเฟ้อ"
                  className="accent-indigo-600"
                />
                ปรับตามเงินเฟ้อทุกปี
              </label>
            </Section>

            {/* ── Run button ───────────────────────────────── */}
            <button
              onClick={runSimulation}
              disabled={isRunning}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              <Play className="w-5 h-5" />
              {isRunning ? 'กำลังคำนวณ...' : 'รัน Simulation'}
            </button>
          </div>

          {/* ── Results Panel ───────────────────────────────── */}
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
                    <p>✓ รองรับ Fat-tail events และเหตุการณ์ไม่คาดฝัน</p>
                    <p>✓ คำนวณภาษีและรายได้บำนาญ</p>
                    <p>✓ เปรียบเทียบหลายสถานการณ์พร้อมกัน</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* ── Success Rate Card ─────────────────────── */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                      <p className="text-sm text-slate-600 mb-1">โอกาสสำเร็จตามแผน</p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-5xl font-bold" style={{ color: successRateColor }}>
                          {results.successRate.toFixed(1)}%
                        </span>
                        <span
                          className="text-sm font-medium px-3 py-1 rounded-full"
                          style={{ backgroundColor: successRateColor + '20', color: successRateColor }}
                        >
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

                  {/* Save scenario */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                    <input
                      type="text"
                      value={scenarioName}
                      onChange={e => setScenarioName(e.target.value)}
                      placeholder="ตั้งชื่อสถานการณ์นี้..."
                      aria-label="ชื่อสถานการณ์"
                      className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={saveScenario}
                      disabled={savedScenarios.length >= 3}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
                      aria-label="บันทึกสถานการณ์"
                    >
                      <Save className="w-4 h-4" />
                      บันทึก
                    </button>
                  </div>
                </div>

                {/* ── Scenario comparison table ─────────────── */}
                {savedScenarios.length > 0 && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-indigo-600" />
                      เปรียบเทียบสถานการณ์
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="text-left py-2 pr-4">ชื่อ</th>
                            <th className="text-right py-2 pr-4">โอกาสสำเร็จ</th>
                            <th className="text-right py-2 pr-4">P50 (กลาง)</th>
                            <th className="text-right py-2">P90 (ดีสุด)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savedScenarios.map((sc, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-2 pr-4 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: SCENARIO_COLORS[i] }} />
                                {sc.name}
                              </td>
                              <td className="text-right py-2 pr-4 font-medium">
                                {sc.results.successRate.toFixed(1)}%
                              </td>
                              <td className="text-right py-2 pr-4">{formatBaht(sc.results.medianEnding)}</td>
                              <td className="text-right py-2">{formatBaht(sc.results.bestCase)}</td>
                            </tr>
                          ))}
                          {/* Current run */}
                          <tr className="bg-indigo-50">
                            <td className="py-2 pr-4 flex items-center gap-2 font-medium">
                              <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" />
                              ปัจจุบัน
                            </td>
                            <td className="text-right py-2 pr-4 font-medium">{results.successRate.toFixed(1)}%</td>
                            <td className="text-right py-2 pr-4">{formatBaht(results.medianEnding)}</td>
                            <td className="text-right py-2">{formatBaht(results.bestCase)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => setSavedScenarios([])}
                      className="mt-3 text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      ล้างการเปรียบเทียบ
                    </button>
                  </div>
                )}

                {/* ── Percentile Chart ──────────────────────── */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">เส้นทางความมั่งคั่งตามอายุ</h3>
                  <p className="text-xs text-slate-500 mb-4">ช่วงสีแสดง 80% ของผลลัพธ์ทั้งหมด (P10–P90) · เส้นทึบคือค่ากลาง (P50)</p>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={results.percentileData}>
                      <defs>
                        <linearGradient id="colorRange" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="colorRange2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="age"
                        stroke="#64748b"
                        fontSize={12}
                        label={{ value: 'อายุ (ปี)', position: 'insideBottom', offset: -5, fontSize: 12 }}
                      />
                      <YAxis stroke="#64748b" fontSize={12} tickFormatter={formatBaht} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '12px' }}
                        formatter={(value, name) => {
                          const labels = { p10: 'P10 (แย่สุด)', p25: 'P25', p50: 'P50 (กลาง)', p75: 'P75', p90: 'P90 (ดีสุด)' };
                          return [formatBahtFull(value), labels[name] || name];
                        }}
                        labelFormatter={(age) => `อายุ ${age} ปี`}
                      />
                      <ReferenceLine
                        x={inputs.retirementAge}
                        stroke="#dc2626"
                        strokeDasharray="5 5"
                        label={{ value: 'เกษียณ', position: 'top', fontSize: 11, fill: '#dc2626' }}
                      />
                      <Area type="monotone" dataKey="p90" stackId="1" stroke="none" fill="url(#colorRange)" />
                      <Area type="monotone" dataKey="p75" stackId="2" stroke="none" fill="url(#colorRange2)" />
                      <Area type="monotone" dataKey="p25" stackId="3" stroke="none" fill="white" />
                      <Area type="monotone" dataKey="p10" stackId="4" stroke="none" fill="white" />
                      <Line type="monotone" dataKey="p50" stroke="#4338ca" strokeWidth={2.5} dot={false} name="p50" />
                      {/* Saved scenario median overlays */}
                      {savedScenarios.map((sc, i) => (
                        <Line
                          key={i}
                          type="monotone"
                          data={sc.results.percentileData}
                          dataKey="p50"
                          stroke={SCENARIO_COLORS[i]}
                          strokeWidth={1.5}
                          strokeDasharray="6 3"
                          dot={false}
                          name={sc.name}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                  {savedScenarios.length > 0 && (
                    <div className="flex flex-wrap gap-3 mt-3 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-4 h-0.5 bg-indigo-700 inline-block" /> ปัจจุบัน
                      </span>
                      {savedScenarios.map((sc, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: SCENARIO_COLORS[i], borderTop: '2px dashed ' + SCENARIO_COLORS[i] }} />
                          {sc.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Distribution Histogram ─────────────────── */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">
                    การกระจายของเงินคงเหลือ ณ สิ้นอายุ {inputs.lifeExpectancy}
                  </h3>
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

                {/* ── Interpretation Card ───────────────────── */}
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
                    {lifeShocks.length > 0 && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mt-2">
                        ⚡ ผลลัพธ์นี้รวมเหตุการณ์ไม่คาดฝัน {lifeShocks.length} รายการ ซึ่งจะลดโอกาสสำเร็จลงจากการจำลองแบบปกติ
                      </p>
                    )}
                    <p className="text-xs text-slate-500 pt-2 border-t border-indigo-100">
                      <strong>ข้อจำกัด:</strong> โมเดลสมมติผลตอบแทนแบบ normal distribution ในความเป็นจริงตลาดมี fat tails และ sequence-of-returns risk เพิ่มเติม
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
