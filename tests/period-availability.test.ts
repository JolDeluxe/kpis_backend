import { describe, expect, it } from "vitest";
import { filterAvailablePeriods, isPeriodAvailable } from "../src/utils/period-availability.js";

describe("disponibilidad de periodos agregados", () => {
  it("mantiene meses y acumulado cuando existen", () => {
    expect(filterAvailablePeriods([1, 2, 19])).toEqual([1, 2, 19]);
  });

  it("habilita Q1 solo con enero, febrero y marzo completos", () => {
    expect(filterAvailablePeriods([1, 2, 13])).toEqual([1, 2]);
    expect(filterAvailablePeriods([1, 2, 3, 13])).toEqual([1, 2, 3, 13]);
  });

  it("habilita Q2, Q3 y Q4 solo con sus tres meses completos", () => {
    expect(filterAvailablePeriods([4, 5, 14])).toEqual([4, 5]);
    expect(filterAvailablePeriods([4, 5, 6, 14])).toEqual([4, 5, 6, 14]);
    expect(filterAvailablePeriods([7, 8, 15])).toEqual([7, 8]);
    expect(filterAvailablePeriods([7, 8, 9, 15])).toEqual([7, 8, 9, 15]);
    expect(filterAvailablePeriods([10, 11, 16])).toEqual([10, 11]);
    expect(filterAvailablePeriods([10, 11, 12, 16])).toEqual([10, 11, 12, 16]);
  });

  it("habilita S1 y S2 solo con sus seis meses completos", () => {
    expect(filterAvailablePeriods([1, 2, 3, 4, 5, 17])).toEqual([1, 2, 3, 4, 5]);
    expect(filterAvailablePeriods([1, 2, 3, 4, 5, 6, 17])).toEqual([1, 2, 3, 4, 5, 6, 17]);
    expect(filterAvailablePeriods([7, 8, 9, 10, 11, 18])).toEqual([7, 8, 9, 10, 11]);
    expect(filterAvailablePeriods([7, 8, 9, 10, 11, 12, 18])).toEqual([7, 8, 9, 10, 11, 12, 18]);
  });

  it("reporta como no disponible un agregado incompleto", () => {
    expect(isPeriodAvailable([1, 2, 13], 13)).toBe(false);
    expect(isPeriodAvailable([1, 2, 3, 13], 13)).toBe(true);
  });
});
