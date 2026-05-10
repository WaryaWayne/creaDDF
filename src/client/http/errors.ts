import { Data } from "effect";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type {
  DdfTokenFetchError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "../auth/errors";
import type { DdfInvalidODataQueryError } from "./odata";

const formatHttpStatus = (status: number, statusText: string) => {
  const text = statusText.trim();
  return text.length > 0 ? `${status} ${text}` : String(status);
};

export class DdfApiTransportFetchFailure extends Data.TaggedError(
  "DdfApiTransportFetchFailure",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API request failed before receiving a response from ${this.url}`;
  }
}

export class DdfApiHttpError extends Data.TaggedError("DdfApiHttpError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request failed with HTTP ${formatHttpStatus(
      this.status,
      this.statusText,
    )} from ${this.url}`;
  }
}

export class DdfApiBadRequestQueryError extends Data.TaggedError(
  "DdfApiBadRequestQueryError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the request/query with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiUnauthorizedAfterRefreshError extends Data.TaggedError(
  "DdfApiUnauthorizedAfterRefreshError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API returned unauthorized after refreshing credentials from ${this.url}`;
  }
}

export class DdfApiForbiddenError extends Data.TaggedError(
  "DdfApiForbiddenError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API forbids this request with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiNotFoundError extends Data.TaggedError(
  "DdfApiNotFoundError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API resource was not found at ${this.url}`;
  }
}

export class DdfApiTimeoutError extends Data.TaggedError("DdfApiTimeoutError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request timed out with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiUnsupportedMediaTypeError extends Data.TaggedError(
  "DdfApiUnsupportedMediaTypeError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the media type with HTTP ${formatHttpStatus(this.status, this.statusText)} from ${this.url}`;
  }
}

export class DdfApiRetryableServiceUnavailableError extends Data.TaggedError(
  "DdfApiRetryableServiceUnavailableError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API service is unavailable after retries from ${this.url}`;
  }
}

export class DdfApiInternalServerError extends Data.TaggedError(
  "DdfApiInternalServerError",
)<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API returned an internal server error from ${this.url}`;
  }
}

export class DdfApiJsonParseError extends Data.TaggedError(
  "DdfApiJsonParseError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API response body is not valid JSON from ${this.url}`;
  }
}

export class DdfApiResponseSchemaDecodeError extends Data.TaggedError(
  "DdfApiResponseSchemaDecodeError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `DDF API response failed schema decoding from ${this.url}`;
  }
}

export class RetryableApiStatus extends Data.TaggedError("RetryableApiStatus")<{
  readonly response: HttpClientResponse.HttpClientResponse;
}> {}

export type DdfApiMappedHttpError =
  | DdfApiHttpError
  | DdfApiBadRequestQueryError
  | DdfApiUnauthorizedAfterRefreshError
  | DdfApiForbiddenError
  | DdfApiNotFoundError
  | DdfApiTimeoutError
  | DdfApiUnsupportedMediaTypeError
  | DdfApiRetryableServiceUnavailableError
  | DdfApiInternalServerError;

export type DdfAuthError =
  | DdfTokenFetchError
  | DdfTokenHttpError
  | DdfTokenJsonParseError
  | DdfTokenResponseValidationError;

export type DdfHttpError =
  | DdfAuthError
  | DdfApiTransportFetchFailure
  | DdfApiMappedHttpError
  | DdfApiJsonParseError
  | DdfApiResponseSchemaDecodeError
  | DdfInvalidODataQueryError;

export const statusError = (args: {
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText?: string;
}): DdfApiMappedHttpError => {
  switch (args.status) {
    case 400:
      return new DdfApiBadRequestQueryError(args);
    case 401:
      return new DdfApiUnauthorizedAfterRefreshError(args);
    case 403:
      return new DdfApiForbiddenError(args);
    case 404:
      return new DdfApiNotFoundError(args);
    case 408:
      return new DdfApiTimeoutError(args);
    case 415:
      return new DdfApiUnsupportedMediaTypeError(args);
    case 500:
      return new DdfApiInternalServerError(args);
    case 503:
      return new DdfApiRetryableServiceUnavailableError(args);
    default:
      return new DdfApiHttpError(args);
  }
};
