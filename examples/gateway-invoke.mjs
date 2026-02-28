#!/usr/bin/env node

const BASE_URL = process.env.GATEWAY_BASE_URL ?? "http://localhost:3000";
const SEARCH_PROVIDER = process.env.GATEWAY_PROVIDER ?? "dexter";
const SEARCH_QUERY = process.env.GATEWAY_SEARCH_Q ?? "";
const SEARCH_PAGE_SIZE = Number(process.env.GATEWAY_SEARCH_PAGE_SIZE ?? "20");
const INVOKE_INPUT = { message: "hello from gateway example" };

function ensureObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function parseResponseBody(response) {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { rawText };
  }
}

function buildSearchUrl() {
  const url = new URL("/api/store/search", BASE_URL);
  url.searchParams.set("q", SEARCH_QUERY);
  if (SEARCH_PROVIDER.trim() !== "") {
    url.searchParams.set("provider", SEARCH_PROVIDER);
  }
  url.searchParams.set("pageSize", String(SEARCH_PAGE_SIZE));
  return url;
}

function pickCandidateResult(searchBody) {
  if (!ensureObject(searchBody) || !Array.isArray(searchBody.results)) {
    return null;
  }

  return (
    searchBody.results.find(
      (item) => ensureObject(item) && typeof item.id === "string"
    ) ?? null
  );
}

async function invokeOnce(payload) {
  const invokeUrl = new URL("/api/store/invoke", BASE_URL);
  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await parseResponseBody(response);

  return { response, body };
}

function readAccepts(body) {
  if (!ensureObject(body)) {
    return null;
  }

  return "accepts" in body ? body.accepts : null;
}

function resolvePaymentHeaderName(accepts) {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    return "X-PAYMENT";
  }

  const first = accepts[0];
  if (!ensureObject(first)) {
    return "X-PAYMENT";
  }

  const maybeHeaderNames = [
    first.headerName,
    first.paymentHeaderName,
    first.header_name,
  ];

  for (const value of maybeHeaderNames) {
    if (value === "X-PAYMENT" || value === "PAYMENT-SIGNATURE") {
      return value;
    }
  }

  return "X-PAYMENT";
}

async function signPayment({ accepts, paymentResponseHeader, invokePayload }) {
  // Hyphae does not custody private keys. Signing must be done by caller.
  // Implement real signing with your wallet/key management here.
  const preSigned = process.env.GATEWAY_PAYMENT_VALUE;
  if (preSigned && preSigned.trim() !== "") {
    return {
      headerName: resolvePaymentHeaderName(accepts),
      value: preSigned.trim(),
    };
  }

  console.warn(
    [
      "signPayment(...) placeholder is being used.",
      "Hyphae does not host private keys; replace with local signing.",
      `paymentResponseHeader present: ${Boolean(paymentResponseHeader)}`,
      `invokePayload.id: ${invokePayload.id}`,
    ].join(" ")
  );

  return {
    headerName: resolvePaymentHeaderName(accepts),
    value: "<replace-with-local-signature>",
  };
}

async function main() {
  console.log("[1/4] GET /api/store/search");
  const searchUrl = buildSearchUrl();
  const searchResponse = await fetch(searchUrl, {
    headers: {
      accept: "application/json",
    },
  });
  const searchBody = await parseResponseBody(searchResponse);

  if (!searchResponse.ok) {
    throw new Error(
      `search failed (${searchResponse.status}): ${JSON.stringify(searchBody)}`
    );
  }

  const picked = pickCandidateResult(searchBody);
  if (!picked || typeof picked.id !== "string") {
    throw new Error("search returned no usable result.id");
  }
  console.log(`picked result.id: ${picked.id}`);

  const baseInvokePayload = {
    id: picked.id,
    input: INVOKE_INPUT,
  };

  console.log("[2/4] POST /api/store/invoke (without payment)");
  const firstInvoke = await invokeOnce(baseInvokePayload);
  console.log(`first invoke status: ${firstInvoke.response.status}`);

  if (firstInvoke.response.status !== 402) {
    console.log("first invoke did not return 402, body:");
    console.log(JSON.stringify(firstInvoke.body, null, 2));
    console.log(
      "pick another result.id or query/provider if you need to test 402 flow."
    );
    return;
  }

  const accepts = readAccepts(firstInvoke.body);
  console.log("[3/4] status===402, body.accepts:");
  console.log(JSON.stringify(accepts, null, 2));

  const paymentResponseHeader =
    firstInvoke.response.headers.get("X-PAYMENT-RESPONSE") ??
    firstInvoke.response.headers.get("PAYMENT-RESPONSE");

  const payment = await signPayment({
    accepts,
    paymentResponseHeader,
    invokePayload: baseInvokePayload,
  });

  console.log(
    `[4/4] POST /api/store/invoke (retry with payment header: ${payment.headerName})`
  );
  const retryInvoke = await invokeOnce({
    ...baseInvokePayload,
    payment,
  });

  console.log(`retry status: ${retryInvoke.response.status}`);
  console.log("retry body:");
  console.log(JSON.stringify(retryInvoke.body, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
