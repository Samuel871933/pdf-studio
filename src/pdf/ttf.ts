// Lecteur TrueType minimal : juste ce qu'il faut pour embarquer une police dans un PDF
// (métriques, table de correspondance caractère → glyphe, largeurs).

export class TrueTypeFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly italicAngle: number;
  readonly bbox: [number, number, number, number];
  readonly postScriptName: string;
  /** Glyphes utilisés → point de code Unicode (pour la table ToUnicode). */
  readonly used = new Map<number, number>();

  private readonly cmap = new Map<number, number>();
  private readonly advances: number[] = [];

  constructor(readonly bytes: Uint8Array) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tables = new Map<string, number>();
    const numTables = v.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(...bytes.subarray(rec, rec + 4));
      tables.set(tag, v.getUint32(rec + 8));
    }
    const table = (tag: string) => {
      const off = tables.get(tag);
      if (off === undefined) throw new Error(`Police invalide : table ${tag} absente.`);
      return off;
    };

    const head = table('head');
    this.unitsPerEm = v.getUint16(head + 18);
    const s = 1000 / this.unitsPerEm;
    this.bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)].map(
      (n) => Math.round(n * s),
    ) as [number, number, number, number];

    const hhea = table('hhea');
    this.ascent = Math.round(v.getInt16(hhea + 4) * s);
    this.descent = Math.round(v.getInt16(hhea + 6) * s);
    const numberOfHMetrics = v.getUint16(hhea + 34);
    const hmtx = table('hmtx');
    for (let i = 0; i < numberOfHMetrics; i++) this.advances.push(v.getUint16(hmtx + i * 4));

    const os2 = tables.get('OS/2');
    this.capHeight = os2 !== undefined && v.getUint16(os2) >= 2 ? Math.round(v.getInt16(os2 + 88) * s) : this.ascent;
    const post = tables.get('post');
    this.italicAngle = post !== undefined ? v.getInt32(post + 4) / 65536 : 0;
    this.postScriptName = readPostScriptName(v, tables.get('name')) ?? 'Font';
    readCmap(v, table('cmap'), this.cmap);
  }

  glyph(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  has(codePoint: number): boolean {
    return this.cmap.has(codePoint);
  }

  /** Largeur d'un glyphe en millièmes de cadratin (unités PDF). */
  width(gid: number): number {
    const adv = this.advances[Math.min(gid, this.advances.length - 1)] ?? 0;
    return Math.round((adv * 1000) / this.unitsPerEm);
  }

  /** Encode le texte en identifiants de glyphes (Identity-H) au format hexadécimal PDF. */
  encode(text: string): string {
    let hex = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      let gid = this.glyph(cp);
      if (!gid) gid = this.glyph(0xfffd) || this.glyph(0x3f); // caractère absent : � ou ?
      if (!this.used.has(gid)) this.used.set(gid, gid === this.glyph(cp) ? cp : 0xfffd);
      hex += gid.toString(16).padStart(4, '0');
    }
    return `<${hex}>`;
  }
}

function readCmap(v: DataView, cmap: number, out: Map<number, number>) {
  const n = v.getUint16(cmap + 2);
  let fmt4 = -1;
  let fmt12 = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmap + 4 + i * 8;
    const platform = v.getUint16(rec);
    const encoding = v.getUint16(rec + 2);
    const sub = cmap + v.getUint32(rec + 4);
    const format = v.getUint16(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) fmt12 = sub;
    if (format === 4) fmt4 = sub;
  }
  if (fmt12 >= 0) {
    const groups = v.getUint32(fmt12 + 12);
    for (let g = 0; g < groups; g++) {
      const p = fmt12 + 16 + g * 12;
      const start = v.getUint32(p);
      const end = v.getUint32(p + 4);
      const gid = v.getUint32(p + 8);
      for (let c = start; c <= end && c - start < 0x10000; c++) out.set(c, gid + c - start);
    }
    return;
  }
  if (fmt4 < 0) throw new Error('Police invalide : aucune table cmap Unicode.');
  const segX2 = v.getUint16(fmt4 + 6);
  const ends = fmt4 + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let i = 0; i < segX2; i += 2) {
    const end = v.getUint16(ends + i);
    const start = v.getUint16(starts + i);
    const delta = v.getInt16(deltas + i);
    const ro = v.getUint16(ranges + i);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid: number;
      if (ro === 0) gid = (c + delta) & 0xffff;
      else {
        const g = v.getUint16(ranges + i + ro + 2 * (c - start));
        gid = g ? (g + delta) & 0xffff : 0;
      }
      if (gid) out.set(c, gid);
    }
  }
}

function readPostScriptName(v: DataView, name: number | undefined): string | undefined {
  if (name === undefined) return;
  const count = v.getUint16(name + 2);
  const strings = name + v.getUint16(name + 4);
  for (let i = 0; i < count; i++) {
    const rec = name + 6 + i * 12;
    if (v.getUint16(rec + 6) !== 6) continue; // nameID 6 = nom PostScript
    const platform = v.getUint16(rec);
    const len = v.getUint16(rec + 8);
    const off = strings + v.getUint16(rec + 10);
    let s = '';
    if (platform === 3 || platform === 0) for (let j = 0; j < len; j += 2) s += String.fromCharCode(v.getUint16(off + j));
    else for (let j = 0; j < len; j++) s += String.fromCharCode(v.getUint8(off + j));
    s = s.replace(/[^A-Za-z0-9-]/g, '');
    if (s) return s;
  }
}
