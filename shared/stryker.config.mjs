// Testes de mutação do shared (etapa 3 da aba "Qualidade e CI/CD", RQ16): o Stryker altera o
// código um pedacinho por vez (troca > por >=, apaga uma linha, inverte uma condição) e confere
// se algum teste falha. Mutação que sobrevive = um erro desse tipo passaria despercebido.
//
//   npm run mutacao -w shared                 só o que mudou desde a última execução
//   npm run mutacao -w shared -- --force      tudo de novo
//
// O relatório navegável fica em reports/mutation/index.html. Exige Node 22 (o CI usa 22).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
  mutate: ['src/**/*.ts', '!src/**/*.test.ts', '!src/test-utils.ts', '!src/index.ts'],
  // Cada mutação roda só os testes que passam por aquela linha.
  coverageAnalysis: 'perTest',
  // Modo incremental (RQ18): reaproveita o resultado das mutações cujo código e testes não mudaram.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // RQ22: por enquanto só relatório; o piso (break) entra depois que a nota estabilizar.
  thresholds: { high: 80, low: 60, break: null },
  // O Stryker trabalha numa cópia em .stryker-tmp/ e ajustaria o "extends" do tsconfig dela com a
  // API JS do TypeScript, que o TypeScript 7 não tem mais. Sem tsconfig na cópia, o Vitest usa o
  // deste pacote, logo acima, com os caminhos certos.
  ignorePatterns: ['tsconfig.json'],
  tsconfigFile: 'tsconfig.stryker-sem-ajuste.json',
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
