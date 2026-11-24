import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProcessorContext, createTestContext } from './test-helpers.mjs';

describe('Clean Http Tracker Features: Response Body Inspection & Internal Cache Filtering', () => {
  describe('Internal Cache Requests Exclusion from Requests List', () => {
    it('does not add a request to the requests list if it has fromCache: "Internal"', () => {
      const proc = createProcessorContext();
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-internal-direct',
        requestIdEnhanced: 'req-internal-direct',
        url: 'https://example.com/internal-direct',
        method: 'GET',
        fromCache: 'Internal',
      });

      const urlsList = proc.document.getElementById('urls_list');
      const row = urlsList.children.find(c => c.id === 'web_events_list_req-internal-direct');
      assert.equal(row, undefined, 'Request with fromCache: "Internal" must not be added to requests list');
      assert.equal(proc.document.getElementById('web_events_list_req-internal-direct'), null);
    });

    it('removes an existing row from requests list when updated to fromCache: "Internal"', () => {
      const proc = createProcessorContext();
      // 1. Initial onBeforeRequest adds row to requests list
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-hsts-transition',
        requestIdEnhanced: 'req-hsts-transition',
        url: 'http://example.com/redirect-me',
        method: 'GET',
      });

      const urlsList = proc.document.getElementById('urls_list');
      let row = urlsList.children.find(c => c.id === 'web_events_list_req-hsts-transition');
      assert.ok(row, 'Initial request row must exist in DOM');

      // 2. onBeforeRedirect arrives with fromCache: "Internal"
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRedirect',
        requestId: 'req-hsts-transition',
        requestIdEnhanced: 'req-hsts-transition',
        url: 'http://example.com/redirect-me',
        redirectUrl: 'https://example.com/redirect-me',
        method: 'GET',
        statusCode: 307,
        fromCache: 'Internal',
      });

      // 3. Hop 0 row must have been removed from requests side
      row = urlsList.children.find(c => c.id === 'web_events_list_req-hsts-transition');
      assert.equal(row, undefined, 'Row must be removed from requests list when cache is Internal');
      assert.equal(proc.document.getElementById('web_events_list_req-hsts-transition'), null);

      // 4. Target redirect hop (https) is added to the requests list
      const targetRow = urlsList.children.find(c => c.id === 'web_events_list_req-hsts-transition_1');
      assert.ok(targetRow, 'Target redirect URL must appear in requests list');
      assert.equal(proc.document.getElementById('web_event_url_req-hsts-transition_1')?.textContent, 'https://example.com/redirect-me');
    });

    it('clears selection and details view when a currently selected request becomes Internal cache', () => {
      const proc = createProcessorContext();
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-selected-test',
        requestIdEnhanced: 'req-selected-test',
        url: 'http://example.com/select-then-internal',
        method: 'GET',
      });

      // Select row
      const row = proc.document.getElementById('web_events_list_req-selected-test');
      assert.ok(row, 'Row must exist');
      proc.eventTracker.markSelectedRequest(row.id);

      // Check details container is visible
      const detailsContainer = proc.document.getElementById('web_details_selected_container');
      assert.equal(detailsContainer.style.display, 'block');

      // Now update to Internal cache
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRedirect',
        requestId: 'req-selected-test',
        requestIdEnhanced: 'req-selected-test',
        url: 'http://example.com/select-then-internal',
        redirectUrl: 'https://example.com/select-then-internal',
        statusCode: 307,
        fromCache: 'Internal',
      });

      // Details view must be hidden/cleared
      assert.equal(detailsContainer.style.display, 'none');
      assert.equal(proc.document.getElementById('web_events_list_req-selected-test'), null);
    });
  });

  describe('Response Body Display Feature', () => {
    it('caches and retrieves response body in httpTrackerEventCache', () => {
      const proc = createProcessorContext();
      const testBody = { raw: [{ bytes: new TextEncoder().encode('{"status":"ok"}').buffer }] };

      proc.httpTrackerEventCache.insertResponseBody({
        requestIdEnhanced: 'req-res-cache',
        responseBody: testBody,
      });

      const retrieved = proc.httpTrackerEventCache.getResponseBody('req-res-cache');
      assert.deepEqual(retrieved, testBody);

      proc.httpTrackerEventCache.removeEntry('req-res-cache');
      assert.equal(proc.httpTrackerEventCache.getResponseBody('req-res-cache'), undefined);
    });

    it('buildResponseBodyRows formats text and JSON raw bytes', () => {
      const proc = createProcessorContext();
      const rawPayload = JSON.stringify({ message: 'Hello world', count: 42 });
      const rawBytes = new TextEncoder().encode(rawPayload).buffer;

      const rows = proc.httpTrackerDetailsView.buildResponseBodyRows(
        { raw: [{ bytes: rawBytes }] },
        [],
        false,
        null
      );

      assert.ok(rows.length >= 2, 'Must produce banner and content rows');
      assert.equal(rows[0].textContent, 'Body (response data)');
      assert.ok(rows[1].textContent.includes('Hello world'));
      assert.ok(rows[1].textContent.includes('42'));
    });

    it('buildResponseBodyRows formats form data or object properties', () => {
      const proc = createProcessorContext();
      const rows = proc.httpTrackerDetailsView.buildResponseBodyRows(
        { formData: { success: 'true', userId: '12345' } },
        [],
        false,
        null
      );

      assert.equal(rows[0].textContent, 'Body (form fields data)');
      const text = rows.map(r => r.textContent).join(' ');
      assert.ok(text.includes('success'));
      assert.ok(text.includes('12345'));
    });

    it('buildResponseBodyRows detects compressed / binary data and displays informative notice', () => {
      const proc = createProcessorContext();
      // Gzip magic bytes: 0x1f, 0x8b
      const gzipBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00]);

      const rows = proc.httpTrackerDetailsView.buildResponseBodyRows(
        { raw: [{ bytes: gzipBytes.buffer }] },
        [],
        false,
        null
      );

      assert.equal(rows[0].textContent, 'Body (response data)');
      assert.ok(rows[1].textContent.includes('Binary data'));
      assert.ok(rows[1].textContent.includes('gzip'));
    });

    it('buildResponseBodyRows highlights matches when Find in details regex pattern is provided', () => {
      const proc = createProcessorContext();
      const rawBytes = new TextEncoder().encode('Server token: secret-token-xyz123 end of stream').buffer;
      const compiledRegex = new RegExp('secret-token-[a-z0-9]+', 'gi');

      const rows = proc.httpTrackerDetailsView.buildResponseBodyRows(
        { raw: [{ bytes: rawBytes }] },
        [],
        false,
        compiledRegex
      );

      const contentTd = rows[1].children[0];
      const marks = (contentTd.children || []).filter(c => c.tagName === 'MARK');
      assert.ok(marks.length > 0, 'Must have <mark> tags inside response body');
      assert.equal(marks[0].textContent, 'secret-token-xyz123');
    });

    it('renders response body in response table alongside request payload in request table', () => {
      const proc = createProcessorContext();

      // Dispatch request with requestBody
      proc.eventTracker.processWebEvent({
        callerName: 'onBeforeRequest',
        requestId: 'req-full-cycle',
        requestIdEnhanced: 'req-full-cycle',
        url: 'https://example.com/api/data',
        method: 'POST',
        requestBody: {
          formData: { query: 'test-query' },
        },
      });

      // Dispatch response headers
      proc.eventTracker.processWebEvent({
        callerName: 'onHeadersReceived',
        requestId: 'req-full-cycle',
        requestIdEnhanced: 'req-full-cycle',
        url: 'https://example.com/api/data',
        statusCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      });

      // Dispatch response body
      proc.eventTracker.processWebEvent({
        callerName: 'onResponseBody',
        requestId: 'req-full-cycle',
        requestIdEnhanced: 'req-full-cycle',
        responseBody: {
          raw: [{ bytes: new TextEncoder().encode('{"result":"success"}').buffer }],
        },
      });

      // Select request to render details
      const row = proc.document.getElementById('web_events_list_req-full-cycle');
      proc.eventTracker.markSelectedRequest(row.id);

      // Verify request payload is in request table
      const reqTbody = proc.document.getElementById('request_headers_details_body');
      assert.ok(reqTbody.textContent.includes('Body (form fields data)'));
      assert.ok(reqTbody.textContent.includes('test-query'));

      // Verify response body is in response table
      const resTbody = proc.document.getElementById('response_headers_details_body');
      assert.ok(resTbody.textContent.includes('Body (response data)'));
      assert.ok(resTbody.textContent.includes('{"result":"success"}'));
    });
  });

  describe('Clean Http Tracker Extension Naming Parity', () => {
    it('verifies manifest.json defines name as Clean Http Tracker and includes webRequestBlocking', () => {
      const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
      assert.equal(manifest.name, 'Clean Http Tracker');
      assert.ok(manifest.action.default_title.includes('Clean Http Tracker'));
      assert.ok(manifest.commands._execute_action.description.includes('Clean Http Tracker'));
      assert.ok(manifest.permissions.includes('webRequestBlocking'));
      assert.ok(manifest.permissions.includes('webRequestFilterResponse'));
    });

    it('verifies package.json defines name as clean-http-tracker', () => {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      assert.equal(pkg.name, 'clean-http-tracker');
      assert.ok(pkg.scripts['package:verify'].includes('clean-http-tracker-chrome-'));
      assert.ok(pkg.scripts['package:verify'].includes('clean-http-tracker-firefox-'));
    });

    it('verifies http-tracker.html branding elements display Clean Http Tracker', () => {
      const html = readFileSync('src/html/http-tracker.html', 'utf8');
      assert.ok(html.includes('<title>Clean Http Tracker</title>'));
      assert.ok(html.includes('<h1 class="tracker_brand_title">Clean Http Tracker</h1>'));
      assert.ok(html.includes('alt="Clean Http Tracker"'));
    });

    it('verifies options.html branding elements display Clean Http Tracker', () => {
      const html = readFileSync('src/html/options.html', 'utf8');
      assert.ok(html.includes('<title>Clean Http Tracker Preferences</title>'));
      assert.ok(html.includes('<h2>Clean Http Tracker Preferences</h2>'));
      assert.ok(html.includes('alt="Clean Http Tracker Logo"'));
    });
  });
});
