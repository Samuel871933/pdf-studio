// Écriture d'un fichier PDF 1.7 minimal, sans dépendance.
// La compression utilise l'API native CompressionStream (format zlib = FlateDecode).
import type { TrueTypeFont } from './ttf';

type Part = string | Uint8Array;
const enc = new TextEncoder();

/** Nombre au format PDF (3 décimales max, jamais de notation exponentielle). */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? '0' : r.toFixed(3).replace(/\.?0+$/, '');
}

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Chaîne de texte PDF en UTF-16BE (accents et tous caractères Unicode). */
export function textString(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}

/** Chaîne ASCII littérale (URI) : caractères non ASCII encodés, parenthèses et barres obliques inverses échappées. */
function asciiString(s: string): string {
  let u: string;
  try {
    u = encodeURI(decodeURI(s));
  } catch {
    u = encodeURI(s);
  }
  return `(${u.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Métadonnées XMP (lues par de nombreux outils d'indexation et d'extraction). */
function xmpPacket(m: DocInfo, d: Date): string {
  const alt = (v: string) => `<rdf:Alt><rdf:li xml:lang="x-default">${xml(v)}</rdf:li></rdf:Alt>`;
  return (
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
    '<dc:format>application/pdf</dc:format>' +
    `<dc:title>${alt(m.title)}</dc:title>` +
    (m.author ? `<dc:creator><rdf:Seq><rdf:li>${xml(m.author)}</rdf:li></rdf:Seq></dc:creator>` : '') +
    (m.subject ? `<dc:description>${alt(m.subject)}</dc:description>` : '') +
    (m.keywords ? `<dc:subject><rdf:Bag>${m.keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean).map((k) => `<rdf:li>${xml(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject><pdf:Keywords>${xml(m.keywords)}</pdf:Keywords>` : '') +
    `<dc:language><rdf:Bag><rdf:li>${xml(m.lang)}</rdf:li></rdf:Bag></dc:language>` +
    `<pdf:Producer>PDF Studio</pdf:Producer><xmp:CreatorTool>PDF Studio</xmp:CreatorTool>` +
    `<xmp:CreateDate>${d.toISOString()}</xmp:CreateDate><xmp:ModifyDate>${d.toISOString()}</xmp:ModifyDate>` +
    '</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>'
  );
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  return `(D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${sign}${p(Math.floor(Math.abs(tz) / 60))}'${p(Math.abs(tz) % 60)}')`;
}

export interface DocInfo {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  lang: string;
}

export type StructType = 'H1' | 'H2' | 'H3' | 'P' | 'L' | 'Figure';

/** Lien détecté dans le texte (rectangle en coordonnées PDF). */
export interface LinkAnnot {
  rect: [number, number, number, number];
  uri: string;
  label: string;
}

export interface StructNode {
  type: StructType;
  /** Identifiants de contenu marqué (MCID) de l'élément. */
  mcids: number[];
  /** Pour une liste : un élément par puce. */
  items?: { mcids: number[]; links?: number[] }[];
  links?: number[];
  alt?: string;
}

export interface Structure {
  nodes: StructNode[];
  links: LinkAnnot[];
}

export interface PdfImage {
  width: number;
  height: number;
  /** JPEG brut (DCTDecode) ou pixels RVB bruts. */
  jpeg?: Uint8Array;
  rgb?: Uint8Array;
  alpha?: Uint8Array;
}

export class PdfDocument {
  private objects: Part[][] = [];
  private fonts = new Map<TrueTypeFont, { name: string; id: number }>();
  private xobjects = new Map<string, number>();
  private states = new Map<string, { name: string; id: number }>();

  /** Réserve un numéro d'objet (rempli plus tard). */
  ref(): number {
    this.objects.push([]);
    return this.objects.length;
  }

  set(id: number, ...parts: Part[]) {
    this.objects[id - 1] = parts;
  }

  add(...parts: Part[]): number {
    const id = this.ref();
    this.set(id, ...parts);
    return id;
  }

  async stream(dict: string, data: Uint8Array, compress = true, id = this.ref()): Promise<number> {
    const body = compress ? await deflate(data) : data;
    this.set(id, `<<${dict} /Length ${body.length}${compress ? ' /Filter /FlateDecode' : ''}>>\nstream\n`, body, '\nendstream');
    return id;
  }

  /** Nom de ressource d'une police (embarquée à la fin, avec les seuls glyphes utilisés déclarés). */
  fontName(font: TrueTypeFont): string {
    let f = this.fonts.get(font);
    if (!f) this.fonts.set(font, (f = { name: `F${this.fonts.size + 1}`, id: this.ref() }));
    return f.name;
  }

  /** État graphique d'opacité (remplissage / contour), dédupliqué. */
  opacityState(fill: number, stroke: number): string {
    const key = `${num(fill)}|${num(stroke)}`;
    let s = this.states.get(key);
    if (!s) {
      const id = this.add(`<< /Type /ExtGState /ca ${num(fill)} /CA ${num(stroke)} >>`);
      this.states.set(key, (s = { name: `GS${this.states.size + 1}`, id }));
    }
    return s.name;
  }

  hasImage(key: string): string | undefined {
    return this.xobjects.has(key) ? `Im${[...this.xobjects.keys()].indexOf(key) + 1}` : undefined;
  }

  async image(key: string, img: PdfImage): Promise<string> {
    const existing = this.hasImage(key);
    if (existing) return existing;
    const base = `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /BitsPerComponent 8`;
    let smask = '';
    if (img.alpha) {
      const id = await this.stream(`${base} /ColorSpace /DeviceGray`, img.alpha);
      smask = ` /SMask ${id} 0 R`;
    }
    const id = img.jpeg
      ? await this.stream(`${base} /ColorSpace /DeviceRGB /Filter /DCTDecode${smask}`, img.jpeg, false)
      : await this.stream(`${base} /ColorSpace /DeviceRGB${smask}`, img.rgb!);
    this.xobjects.set(key, id);
    return `Im${this.xobjects.size}`;
  }

  private async embedFont(font: TrueTypeFont, id: number) {
    const name = font.postScriptName;
    const file = await this.stream(` /Length1 ${font.bytes.length}`, font.bytes);
    const descriptor = this.add(
      `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${font.bbox.join(' ')}]` +
        ` /ItalicAngle ${num(font.italicAngle)} /Ascent ${font.ascent} /Descent ${font.descent}` +
        ` /CapHeight ${font.capHeight} /StemV 80 /FontFile2 ${file} 0 R >>`,
    );
    const gids = [...font.used.keys()].sort((a, b) => a - b);
    const widths = gids.map((g) => `${g} [${font.width(g)}]`).join(' ');
    const cid = this.add(
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name}` +
        ` /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>` +
        ` /FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${widths}] >>`,
    );
    const toUnicode = await this.stream('', enc.encode(toUnicodeCMap(font.used)));
    this.set(
      id,
      `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H` +
        ` /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
    );
  }

  async page(width: number, height: number, content: string, meta: DocInfo, tags: Structure): Promise<Uint8Array> {
    for (const [font, { id }] of this.fonts) await this.embedFont(font, id);
    const contents = await this.stream('', enc.encode(content));
    const dict = (m: Map<unknown, unknown>, entries: [string, number][]) => (m.size ? entries.map(([n, i]) => `/${n} ${i} 0 R`).join(' ') : '');
    const fonts = dict(this.fonts, [...this.fonts.values()].map((f) => [f.name, f.id]));
    const images = dict(this.xobjects, [...this.xobjects.values()].map((id, i) => [`Im${i + 1}`, id]));
    const states = dict(this.states, [...this.states.values()].map((s) => [s.name, s.id]));
    const resources =
      `<< /ProcSet [/PDF /Text /ImageB /ImageC]` +
      (fonts ? ` /Font << ${fonts} >>` : '') +
      (images ? ` /XObject << ${images} >>` : '') +
      (states ? ` /ExtGState << ${states} >>` : '') +
      ' >>';
    const pagesId = this.ref();
    const pageId = this.ref();
    const { root, annots } = this.structure(pageId, tags);
    this.set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Resources ${resources}` +
        ` /Contents ${contents} 0 R /StructParents 0 /Tabs /S` +
        (annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : '') +
        ' >>',
    );
    this.set(pagesId, `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
    const now = new Date();
    const xmp = await this.stream(' /Type /Metadata /Subtype /XML', enc.encode(xmpPacket(meta, now)), false);
    const catalog = this.add(
      `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang ${textString(meta.lang)} /Metadata ${xmp} 0 R` +
        ` /MarkInfo << /Marked true >> /StructTreeRoot ${root} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`,
    );
    const date = pdfDate(now);
    const info = this.add(
      `<< /Title ${textString(meta.title)}` +
        (meta.author ? ` /Author ${textString(meta.author)}` : '') +
        (meta.subject ? ` /Subject ${textString(meta.subject)}` : '') +
        (meta.keywords ? ` /Keywords ${textString(meta.keywords)}` : '') +
        ` /Creator ${textString('PDF Studio')} /Producer ${textString('PDF Studio')} /CreationDate ${date} /ModDate ${date} >>`,
    );
    return this.serialize(catalog, info);
  }

  /**
   * Arbre de structure (PDF balisé) : titres, paragraphes, listes et figures dans l'ordre de lecture,
   * décorations marquées comme artefacts, liens reliés à leurs annotations.
   */
  private structure(pageId: number, tags: Structure): { root: number; annots: number[] } {
    const root = this.ref();
    const doc = this.ref();
    const parentOf: number[] = []; // MCID -> élément
    const children: number[] = [];
    const annots: number[] = [];
    const linkKeys: [number, number][] = [];
    const pg = `/Pg ${pageId} 0 R`;
    const k = (mcids: number[], extra: string[] = []) => {
      const all = [...mcids.map(String), ...extra];
      return all.length === 1 ? all[0] : `[${all.join(' ')}]`;
    };
    const linkElems = (parent: number, links: number[] = []) =>
      links.map((li) => {
        const link = tags.links[li];
        const annot = this.ref();
        const elem = this.ref();
        const key = linkKeys.length + 1;
        linkKeys.push([key, elem]);
        annots.push(annot);
        this.set(
          annot,
          `<< /Type /Annot /Subtype /Link /Rect [${link.rect.map(num).join(' ')}] /Border [0 0 0] /F 4` +
            ` /A << /S /URI /URI ${asciiString(link.uri)} >> /StructParent ${key} /Contents ${textString(link.label)} >>`,
        );
        this.set(elem, `<< /Type /StructElem /S /Link /P ${parent} 0 R ${pg} /K << /Type /OBJR /Obj ${annot} 0 R ${pg} >> >>`);
        return `${elem} 0 R`;
      });

    for (const node of tags.nodes) {
      const id = this.ref();
      children.push(id);
      if (node.type === 'L') {
        const items = (node.items ?? []).map((item) => {
          const li = this.ref();
          const body = this.ref();
          for (const m of item.mcids) parentOf[m] = body;
          const links = linkElems(body, item.links);
          this.set(body, `<< /Type /StructElem /S /LBody /P ${li} 0 R ${pg} /K ${k(item.mcids, links)} >>`);
          this.set(li, `<< /Type /StructElem /S /LI /P ${id} 0 R ${pg} /K ${body} 0 R >>`);
          return `${li} 0 R`;
        });
        this.set(id, `<< /Type /StructElem /S /L /P ${doc} 0 R ${pg} /K [${items.join(' ')}] >>`);
        continue;
      }
      for (const m of node.mcids) parentOf[m] = id;
      const links = linkElems(id, node.links);
      const alt = node.alt ? ` /Alt ${textString(node.alt)}` : '';
      this.set(id, `<< /Type /StructElem /S /${node.type} /P ${doc} 0 R ${pg}${alt} /K ${k(node.mcids, links)} >>`);
    }
    this.set(doc, `<< /Type /StructElem /S /Document /P ${root} 0 R /K [${children.map((c) => `${c} 0 R`).join(' ')}] >>`);
    const nums = [`0 [${parentOf.map((e) => (e ? `${e} 0 R` : 'null')).join(' ')}]`, ...linkKeys.map(([key, e]) => `${key} ${e} 0 R`)];
    const tree = this.add(`<< /Nums [${nums.join(' ')}] >>`);
    this.set(root, `<< /Type /StructTreeRoot /K ${doc} 0 R /ParentTree ${tree} 0 R /ParentTreeNextKey ${linkKeys.length + 1} >>`);
    return { root, annots };
  }

  private serialize(root: number, info: number): Uint8Array {
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let size = 0;
    const push = (p: Part) => {
      const b = typeof p === 'string' ? enc.encode(p) : p;
      chunks.push(b);
      size += b.length;
    };
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // %PDF-1.7 + marqueur binaire
    this.objects.forEach((parts, i) => {
      offsets.push(size);
      push(`${i + 1} 0 obj\n`);
      parts.forEach(push);
      push('\nendobj\n');
    });
    const xref = size;
    const n = this.objects.length + 1;
    const fileId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    push(`xref\n0 ${n}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
    push(`trailer\n<< /Size ${n} /Root ${root} 0 R /Info ${info} 0 R /ID [<${fileId}> <${fileId}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** Table ToUnicode : permet de copier / rechercher le texte du PDF. */
function toUnicodeCMap(used: Map<number, number>): string {
  const entries = [...used].sort((a, b) => a[0] - b[0]);
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  const utf16 = (cp: number) => [...String.fromCodePoint(cp)].map((c) => c.split('').map((u) => hex(u.charCodeAt(0))).join('')).join('');
  let blocks = '';
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    blocks += `${chunk.length} beginbfchar\n${chunk.map(([g, cp]) => `<${hex(g)}> <${utf16(cp)}>`).join('\n')}\nendbfchar\n`;
  }
  return (
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    blocks +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n'
  );
}
