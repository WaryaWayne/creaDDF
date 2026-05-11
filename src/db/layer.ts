import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";

export interface DdfDatabaseConfig {
  readonly databaseUrl: Redacted.Redacted<string>;
}

export type DdfDrizzleDatabase = EffectPgDatabase & { readonly $client: PgClient.PgClient };

export class DdfDatabase extends Context.Service<DdfDatabase>()(
  "crea-ddf-effect-sdk/db/layer/DdfDatabase",
  {
    make: Effect.gen(function* () {
      const db = yield* PgDrizzle.makeWithDefaults();
      return { db, pg: db.$client };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerFromConfig = (config: DdfDatabaseConfig) => {
    const pgLayer = PgClient.layer({
      url: config.databaseUrl,
      applicationName: "crea-ddf-effect-sdk",
    });
    return Layer.merge(this.layer.pipe(Layer.provide(pgLayer)), pgLayer);
  };

  static readonly layerFromUrl = (databaseUrl: Redacted.Redacted<string>) =>
    this.layerFromConfig({ databaseUrl });

  static readonly layerConfig = (() => {
    const pgLayer = PgClient.layerConfig({
      url: Config.redacted("DATABASE_URL"),
      applicationName: Config.succeed("crea-ddf-effect-sdk"),
    });
    return Layer.merge(this.layer.pipe(Layer.provide(pgLayer)), pgLayer);
  })();
}

export const ddfDatabaseConfigFromEnv = Config.all({
  databaseUrl: Config.redacted("DATABASE_URL"),
});
