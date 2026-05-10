import type { Effect, Schema } from "effect";
import type { ODataGetQuery, ODataListQuery, ReplicationQuery } from "@/types";
import type { DdfHttpError } from "./errors";

export type DdfResponseSchema<T> = Schema.Decoder<T, never>;

export interface DdfRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit | null;
}

export interface DdfHttpApi {
  requestJson: <T = unknown>(
    path: string,
    init?: DdfRequestOptions,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  listOData: <T = unknown>(
    path: string,
    query?: ODataListQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  getOData: <T = unknown>(
    path: string,
    key: string | number,
    query?: ODataGetQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  replicateIdentifiers: <T = unknown>(
    path: string,
    query?: ReplicationQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  paginateOData: (first: string) => Effect.Effect<Array<unknown>, DdfHttpError>;
}
