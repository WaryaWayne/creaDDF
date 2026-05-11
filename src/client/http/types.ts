import type { Effect, Schema } from "effect";
import type { DdfHttpError } from "./errors";

export type DdfResponseSchema<T> = Schema.Decoder<T, never>;

export interface DdfODataListQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
  readonly filter?: string;
  readonly count?: boolean;
  readonly top?: number;
  readonly skip?: number;
  readonly orderby?: string | ReadonlyArray<string>;
}

export interface DdfODataGetQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
}

export interface DdfReplicationQuery<Field extends string = string> {
  readonly select?: ReadonlyArray<Field>;
  readonly count?: boolean;
  readonly filter?: string;
  readonly orderby?: string | ReadonlyArray<string>;
}

export interface DdfRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly json?: unknown;
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
    query?: DdfODataListQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  getOData: <T = unknown>(
    path: string,
    key: string | number,
    query?: DdfODataGetQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  replicateIdentifiers: <T = unknown>(
    path: string,
    query?: DdfReplicationQuery,
    schema?: DdfResponseSchema<T>,
  ) => Effect.Effect<T, DdfHttpError>;
  paginateOData: (first: string) => Effect.Effect<Array<unknown>, DdfHttpError>;
}
