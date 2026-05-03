// Box-Muller transform — normal distribution sampler
export function randomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Simulate one retirement path.
 *
 * params shape:
 *   initialCapital, annualContribution, yearsToRetirement, yearsInRetirement,
 *   annualWithdrawal, meanReturn, stdDev, inflationRate,
 *   capitalGainsTaxRate, withdrawalTaxRate,
 *   pensionStartYear, pensionAnnualAmount, pensionInflationAdjusted,
 *   lifeShocks: [{ probability, impactType, impactValue }]
 *     impactType: "expense" | "portfolioLoss" | "lostIncome"
 */
export function simulatePath(params) {
  const {
    initialCapital,
    annualContribution,
    yearsToRetirement,
    yearsInRetirement,
    annualWithdrawal,
    meanReturn,
    stdDev,
    inflationRate,
    capitalGainsTaxRate = 0,
    withdrawalTaxRate = 0,
    pensionStartYear = yearsToRetirement,
    pensionAnnualAmount = 0,
    pensionInflationAdjusted = true,
    lifeShocks = [],
  } = params;

  const totalYears = yearsToRetirement + yearsInRetirement;
  const path = [initialCapital];
  let balance = initialCapital;

  for (let year = 1; year <= totalYears; year++) {
    const annualReturn = meanReturn + stdDev * randomNormal();
    const gain = balance * annualReturn;

    // Apply capital gains tax on positive gains during accumulation
    let taxedGain = gain;
    if (year <= yearsToRetirement && gain > 0 && capitalGainsTaxRate > 0) {
      taxedGain = gain * (1 - capitalGainsTaxRate);
    }
    balance = balance + taxedGain;

    // Apply life shocks
    let incomeBlocked = false;
    for (const shock of lifeShocks) {
      if (Math.random() < shock.probability) {
        if (shock.impactType === 'expense') {
          balance = Math.max(0, balance - shock.impactValue);
        } else if (shock.impactType === 'portfolioLoss') {
          balance = balance * (1 - shock.impactValue);
        } else if (shock.impactType === 'lostIncome') {
          incomeBlocked = true;
        }
      }
    }

    if (year <= yearsToRetirement) {
      // Accumulation: add inflation-adjusted contribution (unless income is blocked by shock)
      if (!incomeBlocked) {
        balance += annualContribution * Math.pow(1 + inflationRate, year - 1);
      }
    } else {
      // Retirement: subtract gross withdrawal (with tax gross-up)
      const retirementYear = year - yearsToRetirement;
      const withdrawalInflated = annualWithdrawal * Math.pow(1 + inflationRate, year - 1);
      const grossWithdrawal = withdrawalTaxRate > 0
        ? withdrawalInflated / (1 - withdrawalTaxRate)
        : withdrawalInflated;

      // Pension / Social Security offsets the withdrawal
      const pensionThisYear = year >= pensionStartYear
        ? (pensionInflationAdjusted
            ? pensionAnnualAmount * Math.pow(1 + inflationRate, retirementYear - 1)
            : pensionAnnualAmount)
        : 0;

      balance -= Math.max(0, grossWithdrawal - pensionThisYear);
    }

    if (balance < 0) balance = 0;
    path.push(balance);
  }

  return path;
}

export function runMonteCarlo(params, numSimulations = 1000) {
  const allPaths = [];
  let successCount = 0;
  const retirementStartYear = params.yearsToRetirement;

  for (let i = 0; i < numSimulations; i++) {
    const path = simulatePath(params);
    allPaths.push(path);
    if (path[path.length - 1] > 0) successCount++;
  }

  const totalYears = params.yearsToRetirement + params.yearsInRetirement;
  const percentileData = [];

  for (let year = 0; year <= totalYears; year++) {
    const yearValues = allPaths.map(p => p[year]).sort((a, b) => a - b);
    percentileData.push({
      year,
      age: year,
      p10: yearValues[Math.floor(numSimulations * 0.1)],
      p25: yearValues[Math.floor(numSimulations * 0.25)],
      p50: yearValues[Math.floor(numSimulations * 0.5)],
      p75: yearValues[Math.floor(numSimulations * 0.75)],
      p90: yearValues[Math.floor(numSimulations * 0.9)],
      isRetirement: year >= retirementStartYear,
    });
  }

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

export function buildHistogram(values, bins = 20) {
  const min = values[0];
  const max = values[values.length - 1];
  if (min === max) {
    return [{ range: min, rangeLabel: `${Math.round(min / 1000000)}M`, count: values.length }];
  }
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

export const formatBaht = (n) => {
  if (n == null) return '฿0';
  if (n >= 1000000) return `฿${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `฿${(n / 1000).toFixed(0)}K`;
  return `฿${Math.round(n)}`;
};

export const formatBahtFull = (n) => {
  if (n == null) return '฿0';
  return `฿${Math.round(n).toLocaleString()}`;
};
