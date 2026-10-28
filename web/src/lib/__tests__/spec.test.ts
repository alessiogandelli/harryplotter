import { describe, expect, it } from 'vitest';
import { normalizeSpec, prettify } from '../spec';

describe('prettify', () => {
  it('turns column names into axis labels with units', () => {
    expect(prettify('rt_ms')).toBe('RT (ms)');
    expect(prettify('time_h')).toBe('Time (h)');
    expect(prettify('temperature_C')).toBe('Temperature (°C)');
    expect(prettify('od600')).toBe('OD₆₀₀');
    expect(prettify('stance_confidence')).toBe('Stance confidence');
    expect(prettify('bodyMass_kg')).toBe('Body mass (kg)');
    expect(prettify('pH')).toBe('pH');
    expect(prettify('conc_uM')).toBe('Conc (µM)');
    expect(prettify('ldl_mmol_l')).toBe('LDL (mmol/L)');
  });
});

describe('normalizeSpec', () => {
  it('fills defaults and drops junk', () => {
    const s = normalizeSpec({ mark: 'nope', style: { fontSize: 999, palette: 'rainbow' }, enc: { x: 3 } });
    expect(s.mark).toBe('scatter');
    expect(s.style.fontSize).toBe(48);
    expect(s.style.palette).toBe('okabe-ito');
    expect(s.enc.x).toBeUndefined();
  });
});
