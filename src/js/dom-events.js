const trackUrls = {
  urls: ['<all_urls>'],
};

function checkWireProtocol(url) {
  if (typeof isWireProtocol === 'function') {
    return isWireProtocol(url);
  }
  if (!url || typeof url !== 'string') {
    return false;
  }
  const colonIndex = url.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }
  const protocol = url.slice(0, colonIndex + 1).toLowerCase();
  const set = typeof WIRE_PROTOCOLS !== 'undefined' ? WIRE_PROTOCOLS : new Set(['http:', 'https:', 'ws:', 'wss:']);
  return set.has(protocol);
}

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const resHeadersWithBlocking = httpTracker.isFF ? ['responseHeaders', 'blocking'] : ['responseHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const webRequest = httpTracker.browser.webRequest;

function attachResponseFilter(details) {
  if (!httpTracker.isFF || !webRequest || typeof webRequest.filterResponseData !== 'function') {
    return;
  }
  try {
    const filter = webRequest.filterResponseData(details.requestId);
    const chunks = [];
    const MAX_RESPONSE_CAPTURE_BYTES = 5 * 1024 * 1024;
    let capturedBytes = 0;

    filter.ondata = (event) => {
      try {
        filter.write(event.data);
      } catch (err) {}
      if (capturedBytes < MAX_RESPONSE_CAPTURE_BYTES) {
        chunks.push(event.data);
        capturedBytes += event.data.byteLength;
      }
    };

    filter.onstop = () => {
      try {
        filter.close();
      } catch (err) {}
      if (chunks.length > 0) {
        const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }

        const rawBuffer = combined.buffer;
        const dv = new DataView(rawBuffer);
        const compression = typeof detectCompressionType === 'function' ? detectCompressionType(dv) : '';
        if (typeof DecompressionStream !== 'undefined' && (compression === 'gzip' || compression === 'deflate')) {
          const ds = new DecompressionStream(compression);
          const writer = ds.writable.getWriter();
          writer.write(rawBuffer);
          writer.close();
          const reader = ds.readable.getReader();
          const decompressedChunks = [];
          (async () => {
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                decompressedChunks.push(value);
              }
              const decompLen = decompressedChunks.reduce((acc, c) => acc + c.byteLength, 0);
              const decompResult = new Uint8Array(decompLen);
              let dOffset = 0;
              for (const dc of decompressedChunks) {
                decompResult.set(dc, dOffset);
                dOffset += dc.byteLength;
              }
              eventTracker.processWebEvent({
                callerName: 'onResponseBody',
                requestId: details.requestId,
                requestIdEnhanced: details.requestIdEnhanced || details.requestId,
                responseBody: {
                  raw: [{ bytes: decompResult.buffer }],
                },
              });
            } catch (err) {
              eventTracker.processWebEvent({
                callerName: 'onResponseBody',
                requestId: details.requestId,
                requestIdEnhanced: details.requestIdEnhanced || details.requestId,
                responseBody: {
                  raw: [{ bytes: rawBuffer }],
                },
              });
            }
          })();
        } else {
          eventTracker.processWebEvent({
            callerName: 'onResponseBody',
            requestId: details.requestId,
            requestIdEnhanced: details.requestIdEnhanced || details.requestId,
            responseBody: {
              raw: [{ bytes: rawBuffer }],
            },
          });
        }
      }
    };

    filter.onerror = () => {
      try {
        filter.disconnect();
      } catch (err) {}
    };
  } catch (e) {
    // filterResponseData throws on internal/special requests or if already hooked
  }
}

function forwardEvent(eventName) {
  return function(details) {
    if (details?.url && !checkWireProtocol(details.url)) {
      return;
    }
    details.callerName = eventName;
    details.requestIdEnhanced = details.requestId;
    if (eventName === 'onBeforeRedirect' && details.redirectUrl && (!details.statusCode || Number(details.statusCode) === 0)) {
      details.statusCode = 307;
      details.statusLine = details.statusLine || 'HTTP/1.1 307 Internal Redirect (HSTS)';
      if (details.fromCache === undefined || details.fromCache === false) {
        details.fromCache = 'Internal';
      }
    }
    if (eventName === 'onHeadersReceived') {
      attachResponseFilter(details);
    }
    eventTracker.processWebEvent(details);
  };
}

const LISTENER_CONFIG = [
  {event: 'onBeforeRequest', headers: reqBodyHeaders},
  {event: 'onBeforeSendHeaders', headers: reqHeaders},
  {event: 'onSendHeaders', headers: reqHeaders},
  {event: 'onHeadersReceived', headers: resHeadersWithBlocking},
  {event: 'onAuthRequired', headers: resHeadersWithBlocking},
  {event: 'onBeforeRedirect', headers: resHeaders},
  {event: 'onResponseStarted', headers: resHeaders},
  {event: 'onCompleted', headers: resHeaders},
];

LISTENER_CONFIG.forEach(({event, headers}) => {
  webRequest[event].addListener(forwardEvent(event), trackUrls, headers);
});

// Firefox does not accept a 3rd argument (extraInfoSpec) for onErrorOccurred
if (httpTracker.isFF) {
  webRequest.onErrorOccurred.addListener(
      forwardEvent('onErrorOccurred'), trackUrls,
  );
} else {
  webRequest.onErrorOccurred.addListener(
      forwardEvent('onErrorOccurred'), trackUrls, errorHeaders,
  );
}

if (typeof globalThis !== 'undefined') {
  globalThis.httpTrackerDomEvents = {
    forwardEvent,
  };
}
