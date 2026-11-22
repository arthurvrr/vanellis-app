// Ponto único do esquema: cada módulo declara suas tabelas e elas são reunidas aqui
// para o Drizzle (consultas e geração de migrações).
export * from '../modules/catalogo/schema';
export * from '../modules/agenda/schema';
export * from '../modules/configuracoes/schema';
