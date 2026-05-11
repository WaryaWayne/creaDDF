export const splitSqlStatements = (sql: string): ReadonlyArray<string> =>
  sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
