// Converte o catálogo do protótipo (vanellis-app-pern/database.sql) para o modelo novo
// de grupos de opção e grava em src/db/seed/catalogo.json.
//
// Uso: npx tsx scripts/converter-prototipo.ts ../../vanellis-app-pern/database.sql
//
// Roda o SQL do protótipo num PostgreSQL embutido (PGlite), sem precisar de servidor.
// Regras da conversão: doc de requisitos, aba Protótipo e "Modelo de produtos e banco de dados".

import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedCatalogo, SeedGroup, SeedOption, SeedProduct, SeedTemplate } from '../src/db/seed/types';

interface ProtoItem {
  id: number;
  name: string;
  price: string | number | null;
  description: string | null;
  image_url: string | null;
}
interface ProtoProduct {
  id: number;
  name: string;
  category_id: number;
  type: string;
  measure_unit: 'UN' | 'KG';
  base_price: string;
  min_quantity: number;
  description: string | null;
  base_image: string | null;
  alt: string | null;
  sizes: ProtoItem[];
  flavors: ProtoItem[];
  styles: ProtoItem[];
  extras: ProtoItem[];
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Informe o caminho do database.sql do protótipo.');
  process.exit(1);
}
const protoPublic = join(dirname(sqlPath), 'client', 'public');

// --- texto --------------------------------------------------------------------------------

const lowerWords = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'e']);
function titleCase(s: string): string {
  return s
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((w, i) => (i > 0 && lowerWords.has(w) ? w : w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1)))
    .join(' ');
}
const img = (p: string | null) => (p ? `/images${p}` : null);
const num = (v: string | number | null) => (v === null ? null : Number(v));
const clean = (s: string | null) => (s && s.trim() ? s.trim() : null);

// --- peso ---------------------------------------------------------------------------------

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(gramas?|g|quilos?|kg)\b`;
const RANGE = new RegExp(`${NUM}\\s*(?:${UNIT})?\\s*(?:a|à|até|-)\\s*${NUM}\\s*${UNIT}`, 'i');
const SINGLE = new RegExp(`${NUM}\\s*${UNIT}`, 'i');

/** Lê faixas como "700 gramas a 1 quilo", "2 à 2,2 quilos", "cerca de 2kg". Retorna kg. */
function parseWeight(text: string | null): [number, number] | null {
  if (!text) return null;
  const toKg = (value: string, unit: string) => {
    const n = Number(value.replace(',', '.'));
    return unit.toLowerCase().startsWith('g') ? n / 1000 : n;
  };
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const range = text.match(RANGE);
  if (range) {
    // Sem unidade no primeiro número, vale a do segundo ("2 à 2,2 quilos").
    const a = toKg(range[1]!, range[2] ?? range[4]!);
    const b = toKg(range[3]!, range[4]!);
    return [round(Math.min(a, b)), round(Math.max(a, b))];
  }
  const single = text.match(SINGLE);
  if (single) {
    // Peso único ("aproximadamente 1,4 quilos"): faixa de 5% para cada lado, provisória.
    const kg = toKg(single[1]!, single[2]!);
    return [round(kg * 0.95), round(kg * 1.05)];
  }
  return null;
}

/** Pesos provisórios por tamanho quando o protótipo não tem o dado (editáveis no painel). */
const provisionalWeight: Record<string, [number, number]> = {
  Mini: [0.9, 1.0],
  Pequena: [1.3, 1.5],
  Médio: [1.9, 2.1],
  Grande: [2.6, 3.0],
  Familia: [3.6, 4.0],
};

// --- conversão ----------------------------------------------------------------------------

function convertProduct(p: ProtoProduct, position: number): SeedProduct {
  const isKg = p.measure_unit === 'KG';
  const priceBySize = p.type.startsWith('priceBySize');
  const priceByFlavor = p.type.startsWith('priceByFlavor');
  const groups: SeedGroup[] = [];
  const pending: string[] = [];

  if (p.styles.length) {
    groups.push({
      name: 'Estilo',
      minSelect: 1,
      maxSelect: 1,
      controlsImage: false,
      options: p.styles.map((s) => ({ name: titleCase(s.name), imageUrl: img(s.image_url) })),
    });
  }

  if (p.sizes.length) {
    groups.push({
      name: 'Tamanho',
      minSelect: 1,
      maxSelect: 1,
      controlsImage: false,
      options: p.sizes.map((s): SeedOption => {
        const name = titleCase(s.name);
        const option: SeedOption = { name, imageUrl: img(s.image_url) };
        if (priceBySize) Object.assign(option, { priceMode: 'replace', price: num(s.price) });
        if (isKg) {
          const parsed = parseWeight(s.description);
          const weight = parsed ?? provisionalWeight[name];
          if (!parsed) pending.push(`peso provisório em ${name}`);
          if (weight) Object.assign(option, { weightMinKg: weight[0], weightMaxKg: weight[1] });
        } else {
          option.description = clean(s.description);
        }
        return option;
      }),
    });
  }

  if (p.flavors.length) {
    const double = p.type.includes('doubleFlavor');
    groups.push({
      name: 'Sabor',
      minSelect: 1,
      maxSelect: double ? 2 : 1,
      controlsImage: false,
      options: p.flavors.map((f): SeedOption => {
        const option: SeedOption = {
          name: titleCase(f.name),
          description: clean(f.description),
          imageUrl: img(f.image_url),
        };
        if (priceByFlavor) Object.assign(option, { priceMode: 'replace', price: num(f.price) });
        return option;
      }),
    });
  }

  const extras = p.extras.filter((e) => e.name !== 'Sem adicional');
  if (extras.length) {
    // "Sem adicional" vira mínimo 0; Morangos não tem acréscimo de preço.
    groups.push({
      name: 'Adicional',
      minSelect: 0,
      maxSelect: 1,
      controlsImage: false,
      options: extras.map((e) => ({ name: titleCase(e.name) })),
    });
  }

  // O primeiro grupo com fotos controla a foto do card; os demais perdem as fotos.
  let imageGroupFound = false;
  for (const g of groups) {
    const hasImages = g.options.some((o) => o.imageUrl);
    if (hasImages && !imageGroupFound) {
      g.controlsImage = true;
      imageGroupFound = true;
    } else {
      for (const o of g.options) o.imageUrl = null;
    }
  }

  // Produto por quilo sem grupo de tamanho: o peso fica no produto (ex: Pizza Pan).
  let productWeight: [number, number] | null = null;
  if (isKg && !p.sizes.length) {
    productWeight = parseWeight(p.description);
    if (!productWeight) pending.push('sem peso no produto');
  }

  if (p.styles.some((s) => !s.image_url)) pending.push('estilo sem foto');
  if (p.base_image && !existsSync(join(protoPublic, 'images', p.base_image))) {
    pending.push(`foto não encontrada (${p.base_image})`);
  }

  return {
    categoryProtoId: p.category_id,
    name: titleCase(p.name),
    description: clean(p.description),
    imageUrl: img(p.base_image),
    imageAlt: clean(p.alt),
    saleUnit: p.measure_unit,
    basePrice: priceBySize || priceByFlavor ? null : num(p.base_price),
    weightMinKg: productWeight?.[0] ?? null,
    weightMaxKg: productWeight?.[1] ?? null,
    minQuantity: p.min_quantity,
    position,
    groups,
    origin: p.type,
    pending,
  };
}

// Modelos iniciais (doc: "Modelos de produto"), tirados dos 11 tipos do protótipo.
const modelos: SeedTemplate[] = [
  { name: 'Unidade simples', saleUnit: 'UN', groups: [] },
  { name: 'Unidade com sabor', saleUnit: 'UN', groups: [{ name: 'Sabor', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: false, definesPdvCode: true, controlsImage: false }] },
  { name: 'Unidade com preço por sabor', saleUnit: 'UN', groups: [{ name: 'Sabor', minSelect: 1, maxSelect: 1, priceMode: 'replace', hasWeight: false, definesPdvCode: true, controlsImage: false }] },
  { name: 'Unidade com tamanho', saleUnit: 'UN', groups: [{ name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: 'replace', hasWeight: false, definesPdvCode: true, controlsImage: true }] },
  {
    name: 'Unidade com tamanho e sabor',
    saleUnit: 'UN',
    groups: [
      { name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: 'replace', hasWeight: false, definesPdvCode: true, controlsImage: true },
      { name: 'Sabor', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: false, definesPdvCode: false, controlsImage: false },
    ],
  },
  { name: 'Quilo com tamanho', saleUnit: 'KG', groups: [{ name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: true, definesPdvCode: false, controlsImage: false }] },
  {
    name: 'Quilo com estilo e tamanho',
    saleUnit: 'KG',
    groups: [
      { name: 'Estilo', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: false, definesPdvCode: false, controlsImage: true },
      { name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: true, definesPdvCode: false, controlsImage: false },
    ],
  },
  {
    name: 'Quilo com estilo, tamanho e adicional',
    saleUnit: 'KG',
    groups: [
      { name: 'Estilo', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: false, definesPdvCode: false, controlsImage: true },
      { name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: true, definesPdvCode: false, controlsImage: false },
      { name: 'Adicional', minSelect: 0, maxSelect: 1, priceMode: 'add', hasWeight: false, definesPdvCode: false, controlsImage: false },
    ],
  },
  {
    name: 'Quilo com sabor e tamanho',
    saleUnit: 'KG',
    groups: [
      { name: 'Sabor', minSelect: 1, maxSelect: 1, priceMode: 'replace', hasWeight: false, definesPdvCode: false, controlsImage: false },
      { name: 'Tamanho', minSelect: 1, maxSelect: 1, priceMode: null, hasWeight: true, definesPdvCode: false, controlsImage: false },
    ],
  },
  { name: 'Quilo com até 2 sabores', saleUnit: 'KG', groups: [{ name: 'Sabor', minSelect: 1, maxSelect: 2, priceMode: null, hasWeight: false, definesPdvCode: false, controlsImage: false }] },
];

// --- execução -----------------------------------------------------------------------------

const pg = new PGlite();
await pg.exec(readFileSync(sqlPath, 'utf8'));

const categorias = await pg.query<{ id: number; name: string; slug: string }>(
  'SELECT id, name, slug FROM category ORDER BY id',
);

// Mesma consulta da API do protótipo (server/index.js).
const item = (table: string, ref: string, catalog: string, cols: string) => `
  COALESCE((SELECT json_agg(json_build_object(${cols}) ORDER BY x.ctid)
    FROM ${table} x JOIN ${catalog} c ON c.id = x.${ref} WHERE x.product_id = p.id), '[]')`;
const produtos = await pg.query<ProtoProduct>(`
  SELECT p.*,
    ${item('product_sizes', 'size_id', 'sizes', `'id', x.size_id, 'name', c.name, 'price', x.price, 'description', x.weight_description, 'image_url', x.image_url`)} AS sizes,
    ${item('product_flavors', 'flavor_id', 'flavors', `'id', x.flavor_id, 'name', c.name, 'price', x.price, 'description', x.flavor_description, 'image_url', x.image_url`)} AS flavors,
    ${item('product_styles', 'style_id', 'styles', `'id', x.style_id, 'name', c.name, 'price', null, 'description', null, 'image_url', x.image_url`)} AS styles,
    ${item('product_extras', 'extra_id', 'extras', `'id', x.extra_id, 'name', c.name, 'price', x.price, 'description', null, 'image_url', null`)} AS extras
  FROM products p ORDER BY p.id`);

const seed: SeedCatalogo = {
  categorias: categorias.rows.map((c, i) => ({ protoId: c.id, name: titleCase(c.name), slug: c.slug, position: i })),
  produtos: produtos.rows.map((p, i) => convertProduct(p, i)),
  modelos,
};

const out = fileURLToPath(new URL('../src/db/seed/catalogo.json', import.meta.url));
writeFileSync(out, JSON.stringify(seed, null, 2) + '\n');

const pendentes = seed.produtos.filter((p) => p.pending.length);
console.log(`${seed.categorias.length} categorias, ${seed.produtos.length} produtos, ${modelos.length} modelos -> ${out}`);
console.log(`${pendentes.length} produtos com pendências:`);
for (const p of pendentes) console.log(`  ${p.name}: ${p.pending.join(', ')}`);
await pg.close();
