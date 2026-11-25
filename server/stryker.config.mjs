// Testes de mutação do servidor (etapa 3 da aba "Qualidade e CI/CD", RQ21). Só as regras puras
// do servidor, com os testes de unidade (vitest.mutacao.config.ts). As regras de preço e de
// cadastro de produto ficam no shared (problemaPreco, validateProduct) e são mutadas lá; rotas e
// banco são cobertos pelos testes de API, que levariam ~3h30 aqui (medido em 24/11/2026).
//
//   npm run mutacao -w server                 só o que mudou desde a última execução
//   npm run mutacao -w server -- --force      tudo de novo
//
// O relatório navegável fica em reports/mutation/index.html. Exige Node 22 (o CI usa 22).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutacao.config.ts' },
  mutate: [
    'src/modules/acesso/tentativas.ts', // bloqueio por tentativas de login (C3)
    'src/modules/configuracoes/validacao.ts', // telefones, links, modelo da mensagem, lembretes
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 80, low: 60, break: null },
  // Mesmo motivo do shared: sem tsconfig na cópia, o Vitest usa o deste pacote (TypeScript 7).
  ignorePatterns: ['tsconfig.json'],
  tsconfigFile: 'tsconfig.stryker-sem-ajuste.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
