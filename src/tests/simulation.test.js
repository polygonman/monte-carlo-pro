// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { randomNormal, simulatePath, runMonteCarlo, buildHistogram, formatBaht } from '../engine.js';

const BASE_PARAMS = {
  initialCapital: 1_000_000,
  annualContribution: 120_000,
  yearsToRetirement: 25,
  yearsInRetirement: 20,
  annualWithdrawal: 600_000,
  meanReturn: 0.07,
  stdDev: 0.0,       // zero volatility for deterministic tests
  inflationRate: 0.0,
};

describe('randomNormal', () => {
  it('produces a number', () => {
    expect(typeof randomNormal()).toBe('number');
  });

  it('has approximate mean 0 over many samples', () => {
    const N = 2_000;
    const sum = Array.from({ length: N }, randomNormal).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum / N)).toBeLessThan(0.15);
  });

  it('has approximate std dev 1 over many samples', () => {
    const N = 2_000;
    const samples = Array.from({ length: N }, randomNormal);
    const mean = samples.reduce((a, b) => a + b, 0) / N;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05);
  });
});

describe('simulatePath', () => {
  it('returns array of length totalYears + 1', () => {
    const path = simulatePath(BASE_PARAMS);
    expect(path.length).toBe(BASE_PARAMS.yearsToRetirement + BASE_PARAMS.yearsInRetirement + 1);
  });

  it('first element equals initialCapital', () => {
    const path = simulatePath(BASE_PARAMS);
    expect(path[0]).toBe(BASE_PARAMS.initialCapital);
  });

  it('balance never goes below zero', () => {
    const path = simulatePath(BASE_PARAMS);
    expect(path.every(b => b >= 0)).toBe(true);
  });

  it('grows during accumulation phase with positive returns and no withdrawals', () => {
    const params = { ...BASE_PARAMS, annualWithdrawal: 0, yearsInRetirement: 1 };
    const path = simulatePath(params);
    expect(path[params.yearsToRetirement]).toBeGreaterThan(params.initialCapital);
  });

  it('goes to zero if withdrawal far exceeds balance (no return)', () => {
    const params = {
      ...BASE_PARAMS,
      initialCapital: 100_000,
      meanReturn: 0.0,
      stdDev: 0.0,
      annualWithdrawal: 1_000_000, // 10x balance
      yearsToRetirement: 1,
      yearsInRetirement: 5,
    };
    const path = simulatePath(params);
    expect(path[path.length - 1]).toBe(0);
  });

  it('applies capital gains tax — lower balance than no-tax version', () => {
    const noTax = simulatePath({ ...BASE_PARAMS, capitalGainsTaxRate: 0 });
    const withTax = simulatePath({ ...BASE_PARAMS, capitalGainsTaxRate: 0.2 });
    expect(withTax[BASE_PARAMS.yearsToRetirement]).toBeLessThan(noTax[BASE_PARAMS.yearsToRetirement]);
  });

  it('pension reduces net withdrawal — higher balance than no-pension', () => {
    const noPension = simulatePath({ ...BASE_PARAMS, pensionAnnualAmount: 0 });
    const withPension = simulatePath({
      ...BASE_PARAMS,
      pensionAnnualAmount: 200_000,
      pensionStartYear: BASE_PARAMS.yearsToRetirement,
    });
    expect(withPension[withPension.length - 1]).toBeGreaterThanOrEqual(noPension[noPension.length - 1]);
  });

  it('expense shock reduces balance — probability 1.0 always fires', () => {
    // No Math.random mocking needed: probability=1.0 means Math.random() < 1.0 is always true
    const noShock = simulatePath({ ...BASE_PARAMS, stdDev: 0, lifeShocks: [] });
    const withShock = simulatePath({
      ...BASE_PARAMS,
      stdDev: 0,
      lifeShocks: [{ probability: 1.0, impactType: 'expense', impactValue: 500_000 }],
    });
    expect(withShock[withShock.length - 1]).toBeLessThanOrEqual(noShock[noShock.length - 1]);
  });

  it('portfolioLoss shock keeps balance non-negative', () => {
    const path = simulatePath({
      ...BASE_PARAMS,
      stdDev: 0,
      lifeShocks: [{ probability: 1.0, impactType: 'portfolioLoss', impactValue: 0.3 }],
    });
    expect(path.every(b => b >= 0)).toBe(true);
  });

  it('portfolioLoss shock reduces balance vs no-shock', () => {
    const noShock = simulatePath({ ...BASE_PARAMS, stdDev: 0, lifeShocks: [] });
    const withShock = simulatePath({
      ...BASE_PARAMS,
      stdDev: 0,
      lifeShocks: [{ probability: 1.0, impactType: 'portfolioLoss', impactValue: 0.3 }],
    });
    expect(withShock[BASE_PARAMS.yearsToRetirement]).toBeLessThan(noShock[BASE_PARAMS.yearsToRetirement]);
  });
});

describe('runMonteCarlo', () => {
  it('successRate is between 0 and 100', () => {
    const res = runMonteCarlo(BASE_PARAMS, 50);
    expect(res.successRate).toBeGreaterThanOrEqual(0);
    expect(res.successRate).toBeLessThanOrEqual(100);
  });

  it('percentileData has totalYears + 1 entries', () => {
    const res = runMonteCarlo(BASE_PARAMS, 50);
    expect(res.percentileData.length).toBe(BASE_PARAMS.yearsToRetirement + BASE_PARAMS.yearsInRetirement + 1);
  });

  it('endingBalances has numSimulations entries', () => {
    const N = 50;
    const res = runMonteCarlo(BASE_PARAMS, N);
    expect(res.endingBalances.length).toBe(N);
  });

  it('p10 <= p50 <= p90 for every year', () => {
    const res = runMonteCarlo(BASE_PARAMS, 50);
    res.percentileData.forEach(d => {
      expect(d.p10).toBeLessThanOrEqual(d.p50);
      expect(d.p50).toBeLessThanOrEqual(d.p90);
    });
  });

  it('worstCase <= medianEnding <= bestCase', () => {
    const res = runMonteCarlo(BASE_PARAMS, 50);
    expect(res.worstCase).toBeLessThanOrEqual(res.medianEnding);
    expect(res.medianEnding).toBeLessThanOrEqual(res.bestCase);
  });
});

describe('buildHistogram', () => {
  it('bin counts sum to total values', () => {
    const values = Array.from({ length: 500 }, (_, i) => i * 1000);
    const hist = buildHistogram(values, 20);
    const total = hist.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(500);
  });

  it('returns single bin when all values are equal', () => {
    const hist = buildHistogram([1_000_000, 1_000_000, 1_000_000]);
    expect(hist.length).toBe(1);
    expect(hist[0].count).toBe(3);
  });
});

describe('formatBaht', () => {
  it('formats millions', () => {
    expect(formatBaht(1_500_000)).toBe('฿1.5M');
  });

  it('formats thousands', () => {
    expect(formatBaht(500_000)).toBe('฿500K');
  });

  it('formats small amounts', () => {
    expect(formatBaht(999)).toBe('฿999');
  });

  it('handles null/undefined gracefully', () => {
    expect(formatBaht(null)).toBe('฿0');
  });
});
