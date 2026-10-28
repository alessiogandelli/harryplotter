import { render } from './render';
import type { Dataset, Spec } from './types';

export type ExportFormat = 'svg' | 'pdf' | 'png' | 'tiff';

/** A standalone, non-interactive SVG string with physical (mm) dimensions. */
export function figureSVG(spec: Spec, dataset: Dataset, physical = true): { svg: SVGSVGElement; text: string } {
  const res = render(spec, dataset, { interactive: false });
  if (!res.svg) throw new Error(res.warnings[0] ?? 'Nothing to export');
  const svg = res.svg;
  // Inline the colour Plot inherits through `currentColor` so other tools see it.
  const ink = svg.style.color || '#000';
  svg.querySelectorAll('[fill="currentColor"]').forEach((el) => el.setAttribute('fill', ink));
  svg.querySelectorAll('[stroke="currentColor"]').forEach((el) => el.setAttribute('stroke', ink));
  // Plot puts typography in an inline style on its <svg>; attributes travel better (PDF, Illustrator, Inkscape)
  svg.querySelectorAll('svg').forEach((el) => {
    const s = (el as SVGSVGElement).style;
    if (s.fontSize) el.setAttribute('font-size', s.fontSize.replace('px', ''));
    if (s.fontFamily) el.setAttribute('font-family', s.fontFamily);
    el.removeAttribute('style');
    el.removeAttribute('class');
  });
  svg.querySelectorAll('style').forEach((s) => s.remove());
  // Plot aligns text with `dy="0.32em"`; PDF converters ignore em units, so resolve them to user units
  svg.querySelectorAll('text, tspan').forEach((el) => {
    for (const attr of ['dy', 'dx', 'y', 'x']) {
      const v = el.getAttribute(attr);
      if (!v || !v.includes('em')) continue;
      el.setAttribute(attr, v.split(/[\s,]+/).map((part) => (part.endsWith('em') ? String(parseFloat(part) * fontSizeOf(el)) : part)).join(' '));
    }
  });
  svg.querySelectorAll('[font-weight]').forEach((el) => {
    if (Number(el.getAttribute('font-weight')) >= 600) el.setAttribute('font-weight', 'bold');
  });
  if (physical) {
    svg.setAttribute('width', `${spec.style.widthMm}mm`);
    svg.setAttribute('height', `${spec.style.heightMm}mm`);
  }
  svg.style.removeProperty('background');
  const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
  return { svg, text };
}

function fontSizeOf(el: Element): number {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const fs = e.getAttribute('font-size');
    if (fs) return parseFloat(fs);
  }
  return 10;
}

export function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const fileBase = (spec: Spec, dataset: Dataset) =>
  (spec.style.title || `${dataset.name}-${spec.mark}`).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60);

async function rasterize(spec: Spec, dataset: Dataset, dpi: number): Promise<HTMLCanvasElement> {
  const { text } = figureSVG(spec, dataset, false);
  const pxW = Math.round((spec.style.widthMm / 25.4) * dpi);
  const pxH = Math.round((spec.style.heightMm / 25.4) * dpi);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterise the figure'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, pxW, pxH);
  URL.revokeObjectURL(url);
  return canvas;
}

/** PNG with the DPI written into its pHYs chunk, so Word/LaTeX/journals read the right size. */
async function pngWithDpi(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  // insert right after IHDR (8-byte signature + 25-byte IHDR chunk)
  const out = new Uint8Array(bytes.length + 21);
  out.set(bytes.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(bytes.subarray(33), 54);
  return new Blob([out], { type: 'image/png' });
}

let crcTable: number[] | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable.push(c >>> 0);
    }
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Baseline TIFF (uncompressed RGB) — some journals still insist on it. */
function tiffFromCanvas(canvas: HTMLCanvasElement, dpi: number): Blob {
  const { width: w, height: h } = canvas;
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const pixels = w * h * 3;
  const entries = 11;
  const ifdSize = 2 + entries * 12 + 4;
  const extra = 6 + 16; // bits per sample + two rationals
  const header = 8;
  const dataOffset = header + ifdSize + extra;
  const buf = new ArrayBuffer(dataOffset + pixels);
  const v = new DataView(buf);
  v.setUint16(0, 0x4949); v.setUint16(2, 42, true); v.setUint32(4, 8, true);
  let p = 8;
  v.setUint16(p, entries, true); p += 2;
  const bpsOff = header + ifdSize, xresOff = bpsOff + 6, yresOff = xresOff + 8;
  const tag = (id: number, type: number, count: number, value: number) => {
    v.setUint16(p, id, true); v.setUint16(p + 2, type, true); v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, value, true); else v.setUint32(p + 8, value, true);
    p += 12;
  };
  tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 3, bpsOff); tag(259, 3, 1, 1); tag(262, 3, 1, 2);
  tag(273, 4, 1, dataOffset); tag(277, 3, 1, 3); tag(278, 4, 1, h); tag(279, 4, 1, pixels);
  tag(282, 5, 1, xresOff); tag(283, 5, 1, yresOff);
  v.setUint32(p, 0, true);
  v.setUint16(bpsOff, 8, true); v.setUint16(bpsOff + 2, 8, true); v.setUint16(bpsOff + 4, 8, true);
  v.setUint32(xresOff, dpi, true); v.setUint32(xresOff + 4, 1, true);
  v.setUint32(yresOff, dpi, true); v.setUint32(yresOff + 4, 1, true);
  // note: ResolutionUnit defaults to inch
  const out = new Uint8Array(buf, dataOffset);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { out[j] = rgba[i]; out[j + 1] = rgba[i + 1]; out[j + 2] = rgba[i + 2]; }
  return new Blob([buf], { type: 'image/tiff' });
}

async function pdfBlob(spec: Spec, dataset: Dataset): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const { svg } = figureSVG(spec, dataset, false);
  const w = spec.style.widthMm, h = spec.style.heightMm;
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  // svg2pdf needs the element in the document to resolve styles
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0';
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    // map web font stacks to the PDF base-14 fonts
    svg.querySelectorAll('[font-family]').forEach((el) => {
      const f = el.getAttribute('font-family') ?? '';
      el.setAttribute('font-family', /serif/i.test(f) && !/sans/i.test(f) ? 'times' : /mono|courier/i.test(f) ? 'courier' : 'helvetica');
    });
    await svg2pdf(svg, pdf, { x: 0, y: 0, width: w, height: h });
  } finally {
    host.remove();
  }
  return pdf.output('blob');
}

export async function exportFigure(spec: Spec, dataset: Dataset, format: ExportFormat, dpi = 300): Promise<void> {
  const base = fileBase(spec, dataset);
  if (format === 'svg') {
    download(`${base}.svg`, new Blob([figureSVG(spec, dataset).text], { type: 'image/svg+xml' }));
  } else if (format === 'pdf') {
    download(`${base}.pdf`, await pdfBlob(spec, dataset));
  } else {
    const canvas = await rasterize(spec, dataset, dpi);
    download(`${base}.${format === 'tiff' ? 'tif' : 'png'}`, format === 'tiff' ? tiffFromCanvas(canvas, dpi) : await pngWithDpi(canvas, dpi));
  }
}

export async function copyPNG(spec: Spec, dataset: Dataset): Promise<void> {
  const canvas = await rasterize(spec, dataset, 200);
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
