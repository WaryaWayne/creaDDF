import { Data, SchemaIssue } from "effect";
import type {
  DdfTokenTransportError,
  DdfTokenHttpError,
  DdfTokenJsonParseError,
  DdfTokenResponseValidationError,
} from "../auth/errors";
import type {
  DdfInvalidODataQueryError,
  DdfUnsupportedODataParameterError,
} from "./odata";

type DdfSchemaDecodeIssue = ReturnType<
  ReturnType<typeof SchemaIssue.makeFormatterStandardSchemaV1>
>["issues"][number];

const formatSchemaIssue = SchemaIssue.makeFormatterStandardSchemaV1();

const formatPathSegment = (
  segment: NonNullable<DdfSchemaDecodeIssue["path"]>[number],
) => (typeof segment === "object" ? String(segment.key) : String(segment));

const formatIssuePath = (path: DdfSchemaDecodeIssue["path"]) => {
  const segments = path ?? [];
  return segments.length === 0
    ? "<root>"
    : segments.map(formatPathSegment).join(".");
};

const formatSchemaDecodeIssue = (issue: DdfSchemaDecodeIssue) =>
  `${formatIssuePath(issue.path)}: ${issue.message}`;

export const schemaDecodeIssuesFromCause = (
  cause: unknown,
): ReadonlyArray<DdfSchemaDecodeIssue> | undefined => {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "issue" in cause &&
    SchemaIssue.isIssue(cause.issue)
  ) {
    return formatSchemaIssue(cause.issue).issues;
  }
  return undefined;
};

export class DdfApiTransportError extends Data.TaggedError(
  "DdfApiTransportError",
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
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request failed with HTTP ${this.status} from ${this.url}`;
  }
}

export class DdfApiBadRequestQueryError extends Data.TaggedError(
  "DdfApiBadRequestQueryError",
)<{
  readonly url: string;
  readonly status: number;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the request/query with HTTP ${this.status} from ${this.url}`;
  }
}

export class DdfApiUnauthorizedAfterRefreshError extends Data.TaggedError(
  "DdfApiUnauthorizedAfterRefreshError",
)<{
  readonly url: string;
  readonly status: number;
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
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API forbids this request with HTTP ${this.status} from ${this.url}`;
  }
}

export class DdfApiNotFoundError extends Data.TaggedError(
  "DdfApiNotFoundError",
)<{
  readonly url: string;
  readonly status: number;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API resource was not found at ${this.url}`;
  }
}

export class DdfApiTimeoutError extends Data.TaggedError("DdfApiTimeoutError")<{
  readonly url: string;
  readonly status: number;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API request timed out with HTTP ${this.status} from ${this.url}`;
  }
}

export class DdfApiUnsupportedMediaTypeError extends Data.TaggedError(
  "DdfApiUnsupportedMediaTypeError",
)<{
  readonly url: string;
  readonly status: number;
  readonly bodyText?: string;
}> {
  override get message() {
    return `DDF API rejected the media type with HTTP ${this.status} from ${this.url}`;
  }
}

export class DdfApiRetryableServiceUnavailableError extends Data.TaggedError(
  "DdfApiRetryableServiceUnavailableError",
)<{
  readonly url: string;
  readonly status: number;
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
  readonly issues?: ReadonlyArray<DdfSchemaDecodeIssue>;
}> {
  override get message() {
    const details =
      this.issues === undefined || this.issues.length === 0
        ? ""
        : `: ${this.issues.map(formatSchemaDecodeIssue).join("; ")}`;
    return `DDF API response failed schema decoding from ${this.url}${details}`;
  }
}

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
  | DdfTokenTransportError
  | DdfTokenHttpError
  | DdfTokenJsonParseError
  | DdfTokenResponseValidationError;

export type DdfHttpError =
  | DdfAuthError
  | DdfApiTransportError
  | DdfApiMappedHttpError
  | DdfApiJsonParseError
  | DdfApiResponseSchemaDecodeError
  | DdfInvalidODataQueryError
  | DdfUnsupportedODataParameterError;

export const statusError = (args: {
  readonly url: string;
  readonly status: number;
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
