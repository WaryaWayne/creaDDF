import { Effect } from "effect";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import type * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import type { DdfRequestOptions } from "./types";

export const responseText = (res: HttpClientResponse.HttpClientResponse) =>
  res.text.pipe(Effect.orElseSucceed(() => undefined as string | undefined));

export const requestFromOptions = (url: string, init?: DdfRequestOptions) => {
  const method = init?.method ?? "GET";
  let request = HttpClientRequest.make(method)(url, {
    headers: init?.headers,
    acceptJson: true,
  });

  if (init?.body !== undefined) {
    if (init.body instanceof URLSearchParams) {
      request = HttpClientRequest.bodyUrlParams(request, init.body);
    } else if (typeof init.body === "string") {
      request = HttpClientRequest.bodyText(
        request,
        init.body,
        init.headers?.["content-type"] ??
          init.headers?.["Content-Type"] ??
          "application/json",
      );
    } else {
      request = HttpClientRequest.bodyJsonUnsafe(request, init.body);
    }
  }

  return request;
};
