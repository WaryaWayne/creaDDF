import { Data } from "effect";

export class DdfTokenResponseValidationError extends Data.TaggedError(
  "DdfTokenResponseValidationError",
)<{
  readonly url: string;
  readonly failure: unknown;
}> {
  override get message() {
    return `Token response is missing required fields from ${this.url}`;
  }
}

export class DdfTokenTransportError extends Data.TaggedError(
  "DdfTokenTransportError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Token request transport failed before receiving a response from ${this.url}`;
  }
}

const formatHttpStatus = (status: number, statusText: string) => {
  const text = statusText.trim();
  return text.length > 0 ? `${status} ${text}` : String(status);
};

export class DdfTokenHttpError extends Data.TaggedError("DdfTokenHttpError")<{
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
}> {
  override get message() {
    return `Token request failed with HTTP ${formatHttpStatus(
      this.status,
      this.statusText,
    )}`;
  }
}

export class DdfTokenJsonParseError extends Data.TaggedError(
  "DdfTokenJsonParseError",
)<{
  readonly url: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Token response body is not valid JSON from ${this.url}`;
  }
}
