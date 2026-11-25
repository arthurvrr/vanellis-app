// Cadastro de produto no painel (etapa 3: RF14, RF29, RF30, RF40, RN41). O mesmo formato e as
// mesmas validações valem na tela (aviso na hora) e no servidor (que recusa o que é erro).
//
// Cada grupo de opção tem três características, como nos modelos de produto:
//  - priceMode: as opções trocam o preço ('replace'), somam ('add') ou não mexem (null);
//  - hasWeight: as opções têm faixa de peso (tamanhos de produto por quilo);
//  - hasPdv: as opções têm código PDV próprio (ex: Cupcake Mini e Tradicional).

import type { PriceMode, SaleUnit } from './catalogo';

export interface OptionForm {
  /** Ausente em opção nova. Manter o id preserva os carrinhos dos clientes. */
  id?: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  pdvCode: string | null;
  available: boolean;
}

export interface GroupForm {
  id?: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  controlsImage: boolean;
  priceMode: PriceMode | null;
  hasWeight: boolean;
  hasPdv: boolean;
  options: OptionForm[];
}

export interface ProductForm {
  categoryId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  pdvCode: string | null;
  saleUnit: SaleUnit;
  basePrice: number | null;
  weightMinKg: number | null;
  weightMaxKg: number | null;
  minQuantity: number;
  leadTimeHours: number | null;
  available: boolean;
  groups: GroupForm[];
}

/** Grupo de um modelo de produto (product_template.groups). */
export interface TemplateGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  priceMode: PriceMode | null;
  controlsImage: boolean;
  hasWeight: boolean;
  definesPdvCode: boolean;
}

export interface TemplateDTO {
  id: number;
  name: string;
  saleUnit: SaleUnit;
  groups: TemplateGroup[];
}

export const emptyOption = (): OptionForm => ({
  name: '',
  description: null,
  imageUrl: null,
  price: null,
  weightMinKg: null,
  weightMaxKg: null,
  pdvCode: null,
  available: true,
});

export const emptyGroup = (): GroupForm => ({
  name: '',
  minSelect: 1,
  maxSelect: 1,
  controlsImage: false,
  priceMode: null,
  hasWeight: false,
  hasPdv: false,
  options: [],
});

/** Produto novo a partir de um modelo (RF40): grupos montados, faltando as opções. */
export function productFromTemplate(t: Pick<TemplateDTO, 'saleUnit' | 'groups'> | null, categoryId: number): ProductForm {
  return {
    categoryId,
    name: '',
    description: null,
    imageUrl: null,
    imageAlt: null,
    pdvCode: null,
    saleUnit: t?.saleUnit ?? 'UN',
    basePrice: null,
    weightMinKg: null,
    weightMaxKg: null,
    minQuantity: 1,
    leadTimeHours: null,
    available: true,
    groups: (t?.groups ?? []).map((g) => ({
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      controlsImage: g.controlsImage,
      priceMode: g.priceMode,
      hasWeight: g.hasWeight,
      hasPdv: g.definesPdvCode,
      options: [],
    })),
  };
}

/** Cópia para o RF46: mesmos grupos e preços, indisponível, sem ids nem códigos PDV. */
export function duplicateProduct(p: ProductForm): ProductForm {
  return {
    ...p,
    name: `${p.name} (cópia)`.slice(0, 100),
    pdvCode: null,
    available: false,
    groups: p.groups.map(({ id: _g, ...g }) => ({
      ...g,
      options: g.options.map(({ id: _o, ...o }) => ({ ...o, pdvCode: null })),
    })),
  };
}

export interface FormProblems {
  /** Impedem salvar: estrutura do produto. */
  errors: string[];
  /** Não impedem: código PDV ou foto faltando. */
  warnings: string[];
}

const PDV = /^[A-Za-z0-9.-]{1,20}$/;
// O teste de null só estreita o tipo para o TypeScript: null já é recusado por Number.isFinite e
// pelas comparações seguintes. Fica numa linha própria para desligar só as mutações dele.
const money = (v: number | null) =>
  // Stryker disable next-line ConditionalExpression,LogicalOperator: null já falha em Number.isFinite (mutação equivalente)
  v !== null &&
  (Number.isFinite(v) && v >= 0 && v <= 99999);
const weight = (min: number | null, max: number | null) =>
  // Stryker disable next-line ConditionalExpression,LogicalOperator: null já falha em min > 0 ou max >= min (mutação equivalente)
  min !== null && max !== null &&
  (min > 0 && max >= min && max <= 100);

export function validateProduct(p: ProductForm): FormProblems {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = (i: number, grp: GroupForm) => `Grupo ${i + 1}${grp.name.trim() ? ` (${grp.name.trim()})` : ''}`;

  // Dados gerais
  if (!p.name.trim()) errors.push('Informe o nome do produto');
  if (p.name.trim().length > 100) errors.push('Nome: até 100 caracteres');
  if (!Number.isInteger(p.minQuantity) || p.minQuantity < 1 || p.minQuantity > 999)
    errors.push('Quantidade mínima: de 1 a 999');
  if (p.leadTimeHours !== null && (!Number.isInteger(p.leadTimeHours) || p.leadTimeHours < 0 || p.leadTimeHours > 720))
    errors.push('Antecedência: de 0 a 720 horas');

  const replaceGroups = p.groups.filter((x) => x.priceMode === 'replace');
  const weightGroups = p.groups.filter((x) => x.hasWeight);
  if (replaceGroups.length > 1) errors.push('Só um grupo pode trocar o preço');
  if (weightGroups.length > 1) errors.push('Só um grupo pode ter faixa de peso');
  if (p.groups.filter((x) => x.controlsImage).length > 1) errors.push('Só um grupo pode trocar a foto');

  // Preço base: obrigatório, a menos que um grupo troque o preço
  if (replaceGroups.length === 0 && !money(p.basePrice)) errors.push('Informe o preço do produto');
  if (p.basePrice !== null && !money(p.basePrice)) errors.push('Preço do produto inválido');

  // Peso (RN23): só por quilo; por quilo precisa no produto ou num grupo
  if (p.saleUnit === 'UN') {
    if (weightGroups.length) errors.push('Faixa de peso só vale para produto vendido por quilo');
  } else {
    const productWeight = p.weightMinKg !== null || p.weightMaxKg !== null;
    if (productWeight && !weight(p.weightMinKg, p.weightMaxKg))
      errors.push('Faixa de peso do produto inválida (mínimo maior que zero e máximo maior ou igual)');
    if (!productWeight && !weightGroups.length)
      errors.push('Produto por quilo precisa de faixa de peso no produto ou num grupo de tamanhos, para a estimativa');
  }

  // Grupos e opções
  const groupNames = new Set<string>();
  p.groups.forEach((grp, i) => {
    const label = g(i, grp);
    // Stryker disable next-line MethodExpression: maiúsculas ou minúsculas dão a mesma comparação sem distinguir caixa
    const key = grp.name.trim().toLowerCase();
    if (!key) errors.push(`${label}: informe o nome`);
    else if (groupNames.has(key)) errors.push(`${label}: já existe outro grupo com esse nome`);
    groupNames.add(key);
    if (!grp.options.length) errors.push(`${label}: adicione ao menos uma opção`);
    if (!Number.isInteger(grp.minSelect) || grp.minSelect < 0) errors.push(`${label}: mínimo de escolhas inválido`);
    if (!Number.isInteger(grp.maxSelect) || grp.maxSelect < 1) errors.push(`${label}: o máximo de escolhas precisa ser ao menos 1`);
    if (grp.minSelect > grp.maxSelect) errors.push(`${label}: o mínimo de escolhas é maior que o máximo`);
    if (grp.options.length && grp.minSelect > grp.options.length)
      errors.push(`${label}: o mínimo de escolhas é maior que o número de opções`);
    if (p.saleUnit === 'KG' && grp.hasPdv) errors.push(`${label}: produto por quilo usa um código só, no produto`);

    const optionNames = new Set<string>();
    grp.options.forEach((o, j) => {
      const ol = `${label}, opção ${o.name.trim() || j + 1}`;
      // Stryker disable next-line MethodExpression: maiúsculas ou minúsculas dão a mesma comparação sem distinguir caixa
      const ok = o.name.trim().toLowerCase();
      if (!ok) errors.push(`${label}: opção ${j + 1} sem nome`);
      else if (optionNames.has(ok)) errors.push(`${label}: duas opções com o nome "${o.name.trim()}"`);
      optionNames.add(ok);
      if (grp.priceMode && !money(o.price)) errors.push(`${ol}: informe o preço`);
      if (grp.hasWeight && !weight(o.weightMinKg, o.weightMaxKg)) errors.push(`${ol}: informe a faixa de peso`);
      if (grp.controlsImage && !o.imageUrl) warnings.push(`${ol}: sem foto (o card usa a foto do produto)`);
    });
  });

  // Códigos PDV (RN41): formato e repetição dentro do produto; falta é só aviso
  const codes = [p.pdvCode, ...p.groups.flatMap((x) => x.options.map((o) => o.pdvCode))].filter(
    (c): c is string => !!c,
  );
  for (const c of codes) if (!PDV.test(c)) errors.push(`Código PDV "${c}" inválido: use letras, números, ponto ou hífen`);
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) errors.push(`Código PDV ${dup} repetido neste produto`);

  const pdvGroup = p.groups.find((x) => x.hasPdv);
  if (p.saleUnit === 'UN' && pdvGroup) {
    const missing = pdvGroup.options.filter((o) => !o.pdvCode).length;
    if (missing) warnings.push(`${missing} ${missing === 1 ? 'opção' : 'opções'} de ${pdvGroup.name || 'grupo'} sem código PDV`);
  } else if (!p.pdvCode) {
    warnings.push('Produto sem código PDV');
  }
  if (!p.imageUrl) warnings.push('Produto sem foto');

  return { errors, warnings };
}
