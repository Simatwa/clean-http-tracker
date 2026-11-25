import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProcessorContext } from './test-helpers.mjs';

describe('Clean Http Tracker: Prettify Request Body & Response Display', () => {
  describe('Utility Functions for Formatting and Content-Type Handling', () => {
    it('getContentType extracts normalized lowercase MIME type from array or object headers', () => {
      const proc = createProcessorContext();
      const { getContentType } = proc.context;

      // Array headers
      assert.equal(
        getContentType([{ name: 'Content-Type', value: 'application/json; charset=utf-8' }]),
        'application/json'
      );
      assert.equal(
        getContentType([{ name: 'content-type', value: 'TEXT/HTML; Charset=UTF-8' }]),
        'text/html'
      );
      assert.equal(
        getContentType([{ name: 'Content-Type', value: 'text/css' }]),
        'text/css'
      );
      assert.equal(
        getContentType([{ name: 'Other-Header', value: 'foo' }]),
        ''
      );
      assert.equal(getContentType([]), '');
      assert.equal(getContentType(null), '');

      // Object headers
      assert.equal(
        getContentType({ 'content-type': 'application/xml; charset=utf-8' }),
        'application/xml'
      );
      assert.equal(
        getContentType({ 'Content-Type': 'image/png' }),
        'image/png'
      );
    });

    it('isBinaryContentType detects binary MIME types and allows text/xml formats', () => {
      const proc = createProcessorContext();
      const { isBinaryContentType } = proc.context;

      assert.equal(isBinaryContentType('image/png'), true);
      assert.equal(isBinaryContentType('image/jpeg'), true);
      assert.equal(isBinaryContentType('image/gif'), true);
      assert.equal(isBinaryContentType('image/webp'), true);
      assert.equal(isBinaryContentType('audio/mpeg'), true);
      assert.equal(isBinaryContentType('video/mp4'), true);
      assert.equal(isBinaryContentType('application/octet-stream'), true);
      assert.equal(isBinaryContentType('application/pdf'), true);
      assert.equal(isBinaryContentType('application/zip'), true);
      assert.equal(isBinaryContentType('application/gzip'), true);
      assert.equal(isBinaryContentType('application/wasm'), true);

      // SVG image and text types must NOT be binary
      assert.equal(isBinaryContentType('image/svg+xml'), false);
      assert.equal(isBinaryContentType('application/json'), false);
      assert.equal(isBinaryContentType('text/html'), false);
      assert.equal(isBinaryContentType('text/css'), false);
      assert.equal(isBinaryContentType('text/plain'), false);
      assert.equal(isBinaryContentType(''), false);
      assert.equal(isBinaryContentType(null), false);
    });

    it('isPrettifiableContentType recognizes formats that can be formatted to ease human reading', () => {
      const proc = createProcessorContext();
      const { isPrettifiableContentType } = proc.context;

      // Known MIME types
      assert.equal(isPrettifiableContentType('application/json'), true);
      assert.equal(isPrettifiableContentType('application/ld+json'), true);
      assert.equal(isPrettifiableContentType('text/html'), true);
      assert.equal(isPrettifiableContentType('text/css'), true);
      assert.equal(isPrettifiableContentType('application/xml'), true);
      assert.equal(isPrettifiableContentType('image/svg+xml'), true);
      assert.equal(isPrettifiableContentType('application/x-www-form-urlencoded'), true);

      // Strictly inactive for binary
      assert.equal(isPrettifiableContentType('image/png'), false);
      assert.equal(isPrettifiableContentType('application/octet-stream'), false);
      assert.equal(isPrettifiableContentType('application/pdf'), false);

      // Sniffing without header
      assert.equal(isPrettifiableContentType('', '{"key":"value"}'), true);
      assert.equal(isPrettifiableContentType('', '[1, 2, 3]'), true);
      assert.equal(isPrettifiableContentType('', '<div class="test">Hello</div>'), true);
      assert.equal(isPrettifiableContentType('', 'body { color: red; }'), true);
      assert.equal(isPrettifiableContentType('', 'just plain text without structure'), false);
    });

    it('prettifyJson formats JSON string with 2-space indentation', () => {
      const proc = createProcessorContext();
      const { prettifyJson } = proc.context;

      const rawJson = '{"name":"CleanHttpTracker","features":["inspect","prettify"],"meta":{"active":true}}';
      const formatted = prettifyJson(rawJson);
      assert.equal(
        formatted,
        '{\n  "name": "CleanHttpTracker",\n  "features": [\n    "inspect",\n    "prettify"\n  ],\n  "meta": {\n    "active": true\n  }\n}'
      );

      // Gracefully handles invalid JSON without crashing
      const invalid = '{invalid-json:}';
      assert.equal(prettifyJson(invalid), invalid);

      // Handles object directly
      assert.equal(prettifyJson({ a: 1 }), '{\n  "a": 1\n}');
      assert.equal(prettifyJson(''), '');
    });

    it('prettifyHtml formats nested HTML tags with 2-space indentation and respects void tags', () => {
      const proc = createProcessorContext();
      const { prettifyHtml } = proc.context;

      const rawHtml = '<!DOCTYPE html><html><head><title>Test Page</title></head><body><div class="container"><h1>Title</h1><p>Description<br>Line 2</p><input type="text" name="user"></div></body></html>';
      const formatted = prettifyHtml(rawHtml);

      assert.ok(formatted.includes('<!DOCTYPE html>'));
      assert.ok(formatted.includes('<html>'));
      assert.ok(formatted.includes('  <head>'));
      assert.ok(formatted.includes('    <title>Test Page</title>'));
      assert.ok(formatted.includes('  </head>'));
      assert.ok(formatted.includes('  <body>'));
      assert.ok(formatted.includes('    <div class="container">'));
      assert.ok(formatted.includes('      <h1>Title</h1>'));
      assert.ok(formatted.includes('      <input type="text" name="user">'));
      assert.ok(formatted.includes('    </div>'));
      assert.ok(formatted.includes('  </body>'));
      assert.ok(formatted.includes('</html>'));

      // Gracefully handles malformed or plain string
      assert.equal(prettifyHtml('hello world'), 'hello world');
      assert.equal(prettifyHtml(''), '');
    });

    it('prettifyCss formats CSS rules and declarations with indentation', () => {
      const proc = createProcessorContext();
      const { prettifyCss } = proc.context;

      const rawCss = 'body{margin:0;padding:0;background:#fff;}h1,h2{font-size:16px;color:#333;}';
      const formatted = prettifyCss(rawCss);

      assert.ok(formatted.includes('body {'));
      assert.ok(formatted.includes('  margin:0;'));
      assert.ok(formatted.includes('  padding:0;'));
      assert.ok(formatted.includes('}'));
      assert.ok(formatted.includes('h1,h2 {'));
      assert.ok(formatted.includes('  font-size:16px;'));
    });

    it('prettifyContent dispatches correctly based on content-type or sniffing', () => {
      const proc = createProcessorContext();
      const { prettifyContent } = proc.context;

      // JSON dispatch
      const jsonRes = prettifyContent('{"status":"ok"}', 'application/json');
      assert.equal(jsonRes, '{\n  "status": "ok"\n}');

      // HTML dispatch
      const htmlRes = prettifyContent('<div><p>hi</p></div>', 'text/html');
      assert.ok(htmlRes.includes('<div>\n  <p>hi</p>\n</div>'));

      // CSS dispatch
      const cssRes = prettifyContent('a{color:blue;}', 'text/css');
      assert.ok(cssRes.includes('a {\n  color:blue;\n}'));

      // Binary dispatch returns original text without mangling
      const binaryStr = '\x00\x01\x02\x03\x04\x05\x06\x07';
      assert.equal(prettifyContent(binaryStr, 'application/octet-stream'), binaryStr);
    });

    it('inspectBodyForPrettify correctly determines body availability, binary status, and prettifiability', () => {
      const proc = createProcessorContext();
      const { inspectBodyForPrettify } = proc.context;

      // No body
      assert.deepEqual(inspectBodyForPrettify(null, 'application/json'), {
        hasBody: false,
        isBinary: false,
        canPrettify: false,
        contentType: '',
      });

      // Binary content-type
      const binInspect = inspectBodyForPrettify({ raw: [{ bytes: new ArrayBuffer(10) }] }, 'image/png');
      assert.equal(binInspect.hasBody, true);
      assert.equal(binInspect.isBinary, true);
      assert.equal(binInspect.canPrettify, false);

      // JSON body
      const jsonBytes = new TextEncoder().encode('{"user":"tester"}').buffer;
      const jsonInspect = inspectBodyForPrettify({ raw: [{ bytes: jsonBytes }] }, 'application/json');
      assert.equal(jsonInspect.hasBody, true);
      assert.equal(jsonInspect.isBinary, false);
      assert.equal(jsonInspect.canPrettify, true);
    });
  });

  describe('UI Prettify Buttons Rendering and Initial State', () => {
    it('verifies http-tracker.html declares prettify buttons in Request Details and Response Details headers', () => {
      const html = readFileSync('src/html/http-tracker.html', 'utf8');
      assert.ok(html.includes('id="prettify_request_button"'), 'Request header must contain prettify_request_button');
      assert.ok(html.includes('id="prettify_response_button"'), 'Response header must contain prettify_response_button');
      assert.ok(html.includes('class="web_event_button_prettify"'));
    });

    it('verifies styles.css defines styles for .web_event_button_prettify and .web_event_body_toolbar', () => {
      const css = readFileSync('src/css/styles.css', 'utf8');
      assert.ok(css.includes('.web_event_button_prettify'), 'Must define .web_event_button_prettify');
      assert.ok(css.includes('.web_event_button_prettify:hover:not(:disabled)'));
      assert.ok(css.includes('.web_event_button_prettify:disabled'));
      assert.ok(css.includes('.web_event_button_prettify.web_event_button_active'));
      assert.ok(css.includes('.web_event_body_toolbar'));
    });

    it('disables prettify buttons when no body is present', () => {
      const proc = createProcessorContext();
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-get-nobody',
        requestIdEnhanced: 'req-get-nobody',
        url: 'https://example.com/api/get-item',
        method: 'GET',
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onHeadersReceived',
        requestId: 'req-get-nobody',
        requestIdEnhanced: 'req-get-nobody',
        url: 'https://example.com/api/get-item',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      });

      const row = proc.document.getElementById('web_events_list_req-get-nobody');
      proc.eventTracker.markSelectedRequest(row.id);

      const prettifyReqBtn = proc.document.getElementById('prettify_request_button');
      const prettifyResBtn = proc.document.getElementById('prettify_response_button');

      assert.equal(prettifyReqBtn.disabled, true, 'Request prettify button must be disabled when there is no request body');
      assert.equal(prettifyResBtn.disabled, true, 'Response prettify button must be disabled when there is no response body');
    });

    it('disables prettify button and leaves inactive for binary payloads', () => {
      const proc = createProcessorContext();
      // Gzip magic bytes
      const gzipBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00]);

      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-binary-test',
        requestIdEnhanced: 'req-binary-test',
        url: 'https://example.com/download.tar.gz',
        method: 'GET',
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onHeadersReceived',
        requestId: 'req-binary-test',
        requestIdEnhanced: 'req-binary-test',
        url: 'https://example.com/download.tar.gz',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/gzip' }],
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onResponseBody',
        requestId: 'req-binary-test',
        requestIdEnhanced: 'req-binary-test',
        responseBody: {
          raw: [{ bytes: gzipBytes.buffer }],
        },
      });

      const row = proc.document.getElementById('web_events_list_req-binary-test');
      proc.eventTracker.markSelectedRequest(row.id);

      const prettifyResBtn = proc.document.getElementById('prettify_response_button');
      assert.equal(prettifyResBtn.disabled, true, 'Prettify button must be inactive (disabled) for binary payload');
      assert.equal(prettifyResBtn.textContent, 'Prettify');
      assert.ok(prettifyResBtn.title.includes('binary'), 'Title must explain that prettify is unavailable for binary');

      // Check inline body toolbar button is also disabled
      const resTbody = proc.document.getElementById('response_headers_details_body');
      assert.ok(resTbody.textContent.includes('Binary data'));
      assert.ok(resTbody.textContent.includes('gzip'));
    });
  });

  describe('Interactive Prettifying Toggle Functionality for Request and Response', () => {
    it('toggles request body between raw compact JSON and formatted indented JSON', () => {
      const proc = createProcessorContext();
      const compactJson = '{"action":"login","username":"admin","remember":true}';
      const rawBytes = new TextEncoder().encode(compactJson).buffer;

      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-json-toggle',
        requestIdEnhanced: 'req-json-toggle',
        url: 'https://example.com/api/login',
        method: 'POST',
        requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        requestBody: {
          raw: [{ bytes: rawBytes }],
        },
      });

      const row = proc.document.getElementById('web_events_list_req-json-toggle');
      proc.eventTracker.markSelectedRequest(row.id);

      const prettifyReqBtn = proc.document.getElementById('prettify_request_button');
      assert.equal(prettifyReqBtn.disabled, false, 'Prettify button must be enabled for JSON request body');
      assert.equal(prettifyReqBtn.textContent, 'Prettify', 'Initial button label must be Prettify');

      const reqTbody = proc.document.getElementById('request_headers_details_body');
      // Initially displays raw compact JSON
      assert.ok(reqTbody.textContent.includes('"action":"login"'));

      // 1. Click toggle to prettify
      prettifyReqBtn.onclick();
      assert.equal(prettifyReqBtn.textContent, 'Raw', 'Button label must change to Raw after prettifying');
      assert.ok(prettifyReqBtn.classList.contains('web_event_button_active'), 'Must have active class when prettified');
      assert.equal(prettifyReqBtn.getAttribute('aria-pressed'), 'true');

      // Verify request body is now indented with 2 spaces
      const prettifiedText = reqTbody.textContent;
      assert.ok(prettifiedText.includes('"action": "login"'), 'Must have space after colon in formatted JSON');
      assert.ok(prettifiedText.includes('\n  "username": "admin"'), 'Must have newline and 2-space indentation');

      // 2. Click toggle again to return to raw
      prettifyReqBtn.onclick();
      assert.equal(prettifyReqBtn.textContent, 'Prettify', 'Button label must revert to Prettify');
      assert.equal(prettifyReqBtn.classList.contains('web_event_button_active'), false);
      assert.equal(prettifyReqBtn.getAttribute('aria-pressed'), 'false');
      assert.ok(reqTbody.textContent.includes('"action":"login"'), 'Must revert to compact raw JSON');
    });

    it('toggles response body between raw compact HTML and prettified nested HTML', () => {
      const proc = createProcessorContext();
      const rawHtml = '<!DOCTYPE html><html><head><title>Dashboard</title></head><body><main><h1>Welcome</h1></main></body></html>';
      const rawBytes = new TextEncoder().encode(rawHtml).buffer;

      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-html-toggle',
        requestIdEnhanced: 'req-html-toggle',
        url: 'https://example.com/dashboard',
        method: 'GET',
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onHeadersReceived',
        requestId: 'req-html-toggle',
        requestIdEnhanced: 'req-html-toggle',
        url: 'https://example.com/dashboard',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=UTF-8' }],
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onResponseBody',
        requestId: 'req-html-toggle',
        requestIdEnhanced: 'req-html-toggle',
        responseBody: {
          raw: [{ bytes: rawBytes }],
        },
      });

      const row = proc.document.getElementById('web_events_list_req-html-toggle');
      proc.eventTracker.markSelectedRequest(row.id);

      const prettifyResBtn = proc.document.getElementById('prettify_response_button');
      assert.equal(prettifyResBtn.disabled, false, 'Prettify button must be active for HTML response');
      assert.equal(prettifyResBtn.textContent, 'Prettify');

      const resTbody = proc.document.getElementById('response_headers_details_body');
      assert.ok(resTbody.textContent.includes('<!DOCTYPE html><html>'));

      // 1. Click toggle to prettify HTML
      prettifyResBtn.onclick();
      assert.equal(prettifyResBtn.textContent, 'Raw');
      assert.ok(prettifyResBtn.classList.contains('web_event_button_active'));

      // Verify HTML is prettified with newlines and tag indentation
      const formattedHtmlText = resTbody.textContent;
      assert.ok(formattedHtmlText.includes('<html>\n  <head>\n    <title>Dashboard</title>'));
      assert.ok(formattedHtmlText.includes('  <body>\n    <main>\n      <h1>Welcome</h1>'));

      // 2. Click toggle again to return to raw
      prettifyResBtn.onclick();
      assert.equal(prettifyResBtn.textContent, 'Prettify');
      assert.ok(resTbody.textContent.includes('<!DOCTYPE html><html>'));
    });

    it('toggles response body with CSS content-type', () => {
      const proc = createProcessorContext();
      const rawCss = 'body{background:#000;color:#fff;}a{text-decoration:none;}';
      const rawBytes = new TextEncoder().encode(rawCss).buffer;

      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-css-toggle',
        requestIdEnhanced: 'req-css-toggle',
        url: 'https://example.com/styles.css',
        method: 'GET',
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onHeadersReceived',
        requestId: 'req-css-toggle',
        requestIdEnhanced: 'req-css-toggle',
        url: 'https://example.com/styles.css',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/css' }],
      });
      proc.eventTracker.processWebEvent({
        callerName: 'onResponseBody',
        requestId: 'req-css-toggle',
        requestIdEnhanced: 'req-css-toggle',
        responseBody: {
          raw: [{ bytes: rawBytes }],
        },
      });

      const row = proc.document.getElementById('web_events_list_req-css-toggle');
      proc.eventTracker.markSelectedRequest(row.id);

      const prettifyResBtn = proc.document.getElementById('prettify_response_button');
      assert.equal(prettifyResBtn.disabled, false);

      // Prettify CSS
      prettifyResBtn.onclick();
      const resTbody = proc.document.getElementById('response_headers_details_body');
      assert.ok(resTbody.textContent.includes('body {\n  background:#000;\n  color:#fff;\n}'));
      assert.ok(resTbody.textContent.includes('a {\n  text-decoration:none;\n}'));
    });

    it('clicking inline body toolbar button triggers toggle identically to header button', () => {
      const proc = createProcessorContext();
      const compactJson = '{"service":"payments","amount":100}';
      const rawBytes = new TextEncoder().encode(compactJson).buffer;

      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-inline-btn-test',
        requestIdEnhanced: 'req-inline-btn-test',
        url: 'https://example.com/api/pay',
        method: 'POST',
        requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        requestBody: {
          raw: [{ bytes: rawBytes }],
        },
      });

      const row = proc.document.getElementById('web_events_list_req-inline-btn-test');
      proc.eventTracker.markSelectedRequest(row.id);

      // Trigger click via detailsContainer delegated click
      const detailsContainer = proc.document.getElementById('web_details_selected_container');
      const inlineBtn = {
        closest: (sel) => (sel === '.web_event_button_prettify' ? inlineBtn : null),
        getAttribute: (attr) => (attr === 'data-target' ? 'request' : null),
        disabled: false,
      };

      detailsContainer.dispatchEvent({
        type: 'click',
        target: inlineBtn,
      });

      const prettifyReqBtn = proc.document.getElementById('prettify_request_button');
      assert.equal(prettifyReqBtn.textContent, 'Raw', 'Header button should update to Raw after inline click');

      const reqTbody = proc.document.getElementById('request_headers_details_body');
      assert.ok(reqTbody.textContent.includes('"service": "payments"'));
    });

    it('preserves regex mark search highlighting inside prettified body', () => {
      const proc = createProcessorContext();
      const jsonStr = '{"access_token":"xyz-token-777","expires_in":3600}';
      const rawBytes = new TextEncoder().encode(jsonStr).buffer;

      const compiledRegex = new RegExp('xyz-token-[0-9]+', 'gi');
      const rows = proc.httpTrackerDetailsView.buildResponseBodyRows(
        { raw: [{ bytes: rawBytes }] },
        [],
        false,
        compiledRegex,
        'application/json',
        true // prettified
      );

      const contentTd = rows[1].children[0];
      const marks = (contentTd.children || []).filter(c => c.tagName === 'MARK');
      assert.ok(marks.length > 0, 'Must contain <mark> search highlight tags');
      assert.equal(marks[0].textContent, 'xyz-token-777');
    });

    it('resets prettify button states when details view is cleared', () => {
      const proc = createProcessorContext();
      proc.httpTrackerDetailsView.setRequestBodyPrettified(true);
      proc.httpTrackerDetailsView.setResponseBodyPrettified(true);

      const prettifyReqBtn = proc.document.getElementById('prettify_request_button');
      const prettifyResBtn = proc.document.getElementById('prettify_response_button');
      prettifyReqBtn.disabled = false;
      prettifyReqBtn.textContent = 'Raw';
      prettifyReqBtn.classList.add('web_event_button_active');

      proc.httpTrackerDetailsView.clearDetailsView();

      assert.equal(prettifyReqBtn.disabled, true);
      assert.equal(prettifyReqBtn.textContent, 'Prettify');
      assert.equal(prettifyReqBtn.classList.contains('web_event_button_active'), false);
      assert.equal(prettifyResBtn.disabled, true);
      assert.equal(prettifyResBtn.textContent, 'Prettify');
    });
  });
});
