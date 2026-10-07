const REQUIRED_MONTHS_BY_AGGREGATE = new Map<number, number[]>([
  [13, [1, 2, 3]],
  [14, [4, 5, 6]],
  [15, [7, 8, 9]],
  [16, [10, 11, 12]],
  [17, [1, 2, 3, 4, 5, 6]],
  [18, [7, 8, 9, 10, 11, 12]]
]);

export const filterAvailablePeriods = (periods: number[]) => {
  const available = new Set(periods);
  return Array.from(available)
    .filter((period) => {
      const requiredMonths = REQUIRED_MONTHS_BY_AGGREGATE.get(period);
      if (!requiredMonths) return true;
      return requiredMonths.every((month) => available.has(month));
    })
    .sort((a, b) => a - b);
};

export const isPeriodAvailable = (periods: number[], period: number) => {
  return filterAvailablePeriods(periods).includes(period);
};
