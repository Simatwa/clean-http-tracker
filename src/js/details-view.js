const httpTrackerDetailsView = (function() {
  const decoder = new TextDecoder('UTF-8');
  let isRequestPrettified = false;
  let isResponsePrettified = false;
  const ignoreHeaders = new Set(['frameAncestors', 'frameId', 'parentFrameId', 'tabId', 'timeStamp', 'type', 'callerName', 'requestIdEnhanced', 'requestId', 'requestBody']);

  function appendMarkedText(parent, text, compiledFindPattern) {
    if (text === null || text === undefined) {
      return;
    }
    const str = String(text);
    if (!compiledFindPattern) {
      parent.appendChild(document.createTextNode(str));
      return;
    }
    compiledFindPattern.lastIndex = 0;
    let lastIndex = 0;
    let match = compiledFindPattern.exec(str);
    while (match !== null) {
      if (match[0].length === 0) {
        compiledFindPattern.lastIndex++;
        if (match.index >= str.length) {
          break;
        }
        match = compiledFindPattern.exec(str);
        continue;
      }
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      parent.appendChild(mark);
      lastIndex = match.index + match[0].length;
      match = compiledFindPattern.exec(str);
    }
    if (lastIndex < str.length) {
      parent.appendChild(document.createTextNode(str.slice(lastIndex)));
    }
  }

  function renderBannerRow(title) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'web_event_detail_cookie';
    td.textContent = title;
    tr.appendChild(td);
    return tr;
  }

  function renderNoticeRow(message, key = '', isError = true) {
    const tr = document.createElement('tr');
    const tdKey = document.createElement('td');
    tdKey.className = 'web_event_detail_header_key';
    tdKey.textContent = key;
    const tdVal = document.createElement('td');
    tdVal.className = isError ? 'web_event_detail_header_value web_event_style_error' : 'web_event_detail_header_value';
    if (!isError) {
      tdVal.style.color = '#888';
      tdVal.style.fontStyle = 'italic';
    }
    tdVal.textContent = message;
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    return tr;
  }

  function renderMessageRow(contentNodeOrText, textAlign = 'left') {
    const tr = document.createElement('tr');
    tr.style.whiteSpace = 'pre-wrap';
    tr.style.wordBreak = 'break-all';
    if (textAlign === 'center') {
      tr.style.textAlign = 'center';
    }

    const td = document.createElement('td');
    td.colSpan = 2;
    if (textAlign === 'center') {
      td.style.textAlign = 'center';
    }

    if (contentNodeOrText && typeof contentNodeOrText === 'object') {
      if (Array.isArray(contentNodeOrText)) {
        contentNodeOrText.forEach((child) => td.appendChild(child));
      } else {
        td.appendChild(contentNodeOrText);
      }
    } else if (contentNodeOrText !== undefined && contentNodeOrText !== null) {
      td.appendChild(document.createTextNode(String(contentNodeOrText)));
    }

    tr.appendChild(td);
    return tr;
  }

  function renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern, isError = false) {
    const displayVal = maskValue(key, value, maskPatterns, isMaskEnabled);
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.className = 'web_event_detail_header_key';
    appendMarkedText(tdKey, key, compiledFindPattern);
    tr.appendChild(tdKey);

    const tdVal = document.createElement('td');
    tdVal.className = 'web_event_detail_header_value' + (isError ? ' web_event_style_error' : '');
    appendMarkedText(tdVal, displayVal, compiledFindPattern);
    tr.appendChild(tdVal);

    return tr;
  }

  function setAttr(el, name, val) {
    if (el && typeof el.setAttribute === 'function') {
      el.setAttribute(name, val);
    }
  }

  function createBodyPrettifyToolbar(target, isPrettified, isBinary, canPrettify) {
    const toolbar = document.createElement('div');
    toolbar.className = 'web_event_body_toolbar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'web_event_button_prettify';
    setAttr(btn, 'data-target', target);
    if (isBinary) {
      btn.disabled = true;
      btn.textContent = 'Prettify';
      btn.title = 'Prettify unavailable for binary data';
      setAttr(btn, 'aria-pressed', 'false');
    } else {
      btn.disabled = !canPrettify;
      btn.textContent = isPrettified ? 'Raw' : 'Prettify';
      btn.title = isPrettified ? 'Show raw unformatted display' : 'Prettify display (indent JSON, prettify HTML/CSS)';
      if (isPrettified) {
        btn.classList.add('web_event_button_active');
        setAttr(btn, 'aria-pressed', 'true');
      } else {
        btn.classList.remove('web_event_button_active');
        setAttr(btn, 'aria-pressed', 'false');
      }
    }
    toolbar.appendChild(btn);
    return toolbar;
  }

  function updatePrettifyHeaderButtons({
    requestBody,
    responseBody,
    requestContentType,
    responseContentType,
  }) {
    const reqInspect = typeof inspectBodyForPrettify === 'function' ?
      inspectBodyForPrettify(requestBody, requestContentType) :
      { hasBody: Boolean(requestBody), isBinary: false, canPrettify: true };
    const prettifyReqBtn = getById('prettify_request_button');
    if (prettifyReqBtn) {
      if (!reqInspect.hasBody) {
        prettifyReqBtn.disabled = true;
        prettifyReqBtn.textContent = 'Prettify';
        prettifyReqBtn.title = 'No request body to prettify';
        prettifyReqBtn.classList.remove('web_event_button_active');
        setAttr(prettifyReqBtn, 'aria-pressed', 'false');
      } else if (reqInspect.isBinary) {
        prettifyReqBtn.disabled = true;
        prettifyReqBtn.textContent = 'Prettify';
        prettifyReqBtn.title = 'Prettify unavailable for binary data';
        prettifyReqBtn.classList.remove('web_event_button_active');
        setAttr(prettifyReqBtn, 'aria-pressed', 'false');
      } else {
        prettifyReqBtn.disabled = false;
        prettifyReqBtn.textContent = isRequestPrettified ? 'Raw' : 'Prettify';
        prettifyReqBtn.title = isRequestPrettified ? 'Show raw unformatted display' : 'Prettify display (indent JSON, prettify HTML/CSS)';
        if (isRequestPrettified) {
          prettifyReqBtn.classList.add('web_event_button_active');
          setAttr(prettifyReqBtn, 'aria-pressed', 'true');
        } else {
          prettifyReqBtn.classList.remove('web_event_button_active');
          setAttr(prettifyReqBtn, 'aria-pressed', 'false');
        }
      }
    }

    const resInspect = typeof inspectBodyForPrettify === 'function' ?
      inspectBodyForPrettify(responseBody, responseContentType) :
      { hasBody: Boolean(responseBody), isBinary: false, canPrettify: true };
    const prettifyResBtn = getById('prettify_response_button');
    if (prettifyResBtn) {
      if (!resInspect.hasBody) {
        prettifyResBtn.disabled = true;
        prettifyResBtn.textContent = 'Prettify';
        prettifyResBtn.title = 'No response body to prettify';
        prettifyResBtn.classList.remove('web_event_button_active');
        setAttr(prettifyResBtn, 'aria-pressed', 'false');
      } else if (resInspect.isBinary) {
        prettifyResBtn.disabled = true;
        prettifyResBtn.textContent = 'Prettify';
        prettifyResBtn.title = 'Prettify unavailable for binary data';
        prettifyResBtn.classList.remove('web_event_button_active');
        setAttr(prettifyResBtn, 'aria-pressed', 'false');
      } else {
        prettifyResBtn.disabled = false;
        prettifyResBtn.textContent = isResponsePrettified ? 'Raw' : 'Prettify';
        prettifyResBtn.title = isResponsePrettified ? 'Show raw unformatted display' : 'Prettify display (indent JSON, prettify HTML/CSS)';
        if (isResponsePrettified) {
          prettifyResBtn.classList.add('web_event_button_active');
          setAttr(prettifyResBtn, 'aria-pressed', 'true');
        } else {
          prettifyResBtn.classList.remove('web_event_button_active');
          setAttr(prettifyResBtn, 'aria-pressed', 'false');
        }
      }
    }
  }

  function renderSelectedEventDetails({
    requestEvent,
    responseEvent,
    requestBody,
    responseBody,
    maskPatterns,
    isMaskEnabled,
    optimizeResponseCookies,
    compiledFindPattern,
    isRequestPrettified: customReqPrettified,
    isResponsePrettified: customResPrettified,
  }) {
    if (customReqPrettified !== undefined) {
      isRequestPrettified = Boolean(customReqPrettified);
    }
    if (customResPrettified !== undefined) {
      isResponsePrettified = Boolean(customResPrettified);
    }

    const requestContentType = typeof getContentType === 'function' ? getContentType(requestEvent?.requestHeaders) : '';
    const responseContentType = typeof getContentType === 'function' ? getContentType(responseEvent?.responseHeaders) : '';

    updatePrettifyHeaderButtons({
      requestBody,
      responseBody,
      requestContentType,
      responseContentType,
    });

    const requestRows = buildURLDetailsRows(requestEvent, 'requestDetails', maskPatterns, isMaskEnabled, compiledFindPattern, false, responseEvent);
    const responseRows = buildURLDetailsRows(responseEvent, 'responseDetails', maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies, requestEvent);
    const requestFormRows = buildRequestFormRows(requestBody, maskPatterns, isMaskEnabled, compiledFindPattern, requestContentType, isRequestPrettified);
    const responseBodyRows = buildResponseBodyRows(responseBody, maskPatterns, isMaskEnabled, compiledFindPattern, responseContentType, isResponsePrettified);

    const reqEl = getById('web_event_details_selected_request');
    const resEl = getById('web_event_details_selected_response');
    if (reqEl) {
      reqEl.style.border = '1px solid';
    }
    if (resEl) {
      resEl.style.border = '1px solid';
    }

    const reqBodyEl = getById('request_headers_details_body') || getById('request_headers_details');
    if (reqBodyEl) {
      if (typeof reqBodyEl.replaceChildren === 'function') {
        reqBodyEl.replaceChildren(...requestRows, ...requestFormRows);
      } else {
        reqBodyEl.textContent = '';
        [...requestRows, ...requestFormRows].forEach((r) => reqBodyEl.appendChild(r));
      }
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      if (typeof resBodyEl.replaceChildren === 'function') {
        resBodyEl.replaceChildren(...responseRows, ...responseBodyRows);
      } else {
        resBodyEl.textContent = '';
        [...responseRows, ...responseBodyRows].forEach((r) => resBodyEl.appendChild(r));
      }
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.display = 'block';
      detailsContainer.style.visibility = 'visible';
    }
  }

  function clearDetailsView() {
    const reqEl = getById('web_event_details_selected_request');
    const resEl = getById('web_event_details_selected_response');
    if (reqEl) {
      reqEl.style.border = 'none';
    }
    if (resEl) {
      resEl.style.border = 'none';
    }

    const reqHead = getById('web_event_detail_request_head');
    const resHead = getById('web_event_detail_response_head');
    if (reqHead) {
      reqHead.style.display = 'none';
    }
    if (resHead) {
      resHead.style.display = 'none';
    }

    const copyCurlBtn = getById('copy_curl_button');
    if (copyCurlBtn) {
      copyCurlBtn.disabled = true;
      if (copyCurlBtn._copyTimeout) {
        clearTimeout(copyCurlBtn._copyTimeout);
        delete copyCurlBtn._copyTimeout;
      }
      copyCurlBtn.textContent = 'Copy as cURL';
      copyCurlBtn.classList.remove('copy_success');
    }

    const prettifyReqBtn = getById('prettify_request_button');
    if (prettifyReqBtn) {
      prettifyReqBtn.disabled = true;
      prettifyReqBtn.textContent = 'Prettify';
      prettifyReqBtn.classList.remove('web_event_button_active');
      setAttr(prettifyReqBtn, 'aria-pressed', 'false');
    }

    const prettifyResBtn = getById('prettify_response_button');
    if (prettifyResBtn) {
      prettifyResBtn.disabled = true;
      prettifyResBtn.textContent = 'Prettify';
      prettifyResBtn.classList.remove('web_event_button_active');
      setAttr(prettifyResBtn, 'aria-pressed', 'false');
    }

    const reqBodyEl = getById('request_headers_details_body') || getById('request_headers_details');
    if (reqBodyEl) {
      if (typeof reqBodyEl.replaceChildren === 'function') {
        reqBodyEl.replaceChildren();
      } else {
        reqBodyEl.textContent = '';
      }
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      if (typeof resBodyEl.replaceChildren === 'function') {
        resBodyEl.replaceChildren();
      } else {
        resBodyEl.textContent = '';
      }
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.display = 'none';
      detailsContainer.style.visibility = 'hidden';
    }
  }

  function buildURLDetailsRows(webEventIdDetails, detailsType, maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies, relatedEvent) {
    const rows = [];
    if (webEventIdDetails) {
      rows.push(renderBannerRow('Headers'));

      const metadataRows = [];
      const headerRows = [];

      Object.entries(webEventIdDetails).forEach(([key, value]) => {
        if (key !== 'responseHeaders' && key !== 'requestHeaders') { // headers added by browser
          if (!ignoreHeaders.has(key) && value !== undefined && value !== null) {
            const content = typeof value !== 'object' ?
              value :
              Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
            const isError = key === 'error' ||
              (key === 'statusCode' && Number(value) >= 400) ||
              (key === 'statusLine' && /\b[45]\d{2}\b/.test(String(value)));
            metadataRows.push(renderKeyValueRow(key, content, maskPatterns, isMaskEnabled, compiledFindPattern, isError));
          }
        } else if (Array.isArray(value)) { // application headers
          const headers = sortJsonByProperty(value, 'name');
          headerRows.push(...generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern));
        }
      });

      rows.push(...metadataRows);
      rows.push(...headerRows);

      if (detailsType === 'requestDetails' && !webEventIdDetails.requestHeaders) {
        const isRedirect = (relatedEvent?.statusCode && Number(relatedEvent.statusCode) >= 300 && Number(relatedEvent.statusCode) < 400) ||
          Boolean(relatedEvent?.redirectUrl) ||
          Boolean(webEventIdDetails.redirectUrl);
        const isSuccess = relatedEvent?.statusCode && Number(relatedEvent.statusCode) >= 200 && Number(relatedEvent.statusCode) < 400;
        if (isRedirect) {
          rows.push(renderNoticeRow('No request headers sent (internal browser redirect)', '', false));
        } else if (isSuccess) {
          rows.push(renderNoticeRow('No request headers sent (internal / cached resource)', '', false));
        } else {
          rows.push(renderNoticeRow('Request blocked'));
        }
      }
    } else if (detailsType === 'responseDetails') {
      rows.push(renderNoticeRow('Response not available'));
    } else {
      rows.push(renderNoticeRow('Request not available'));
    }
    return rows;
  }

  function buildRequestFormRows(webEventIdRequestForm, maskPatterns, isMaskEnabled, compiledFindPattern, contentType = '', isPrettified = isRequestPrettified) {
    const rows = [];
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        rows.push(renderBannerRow('Body (form fields data)'));
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          rows.push(renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern));
        });
      } else if (webEventIdRequestForm.raw) {
        rows.push(renderBannerRow('Body (raw form data)'));
        for (const eachByte of webEventIdRequestForm.raw) {
          if (!eachByte.bytes) {
            if (eachByte.file) {
              const fileSpan = document.createElement('span');
              fileSpan.style.color = '#888';
              fileSpan.style.fontStyle = 'italic';
              fileSpan.textContent = `[File upload: ${eachByte.file}]`;
              rows.push(renderMessageRow(fileSpan));
            }
            continue;
          }
          const dataView = new DataView(eachByte.bytes);
          const decodedString = decoder.decode(dataView);
          const isBinary = isBinaryData(decodedString) || (typeof isBinaryContentType === 'function' && isBinaryContentType(contentType));
          if (isBinary) {
            const type = detectCompressionType(dataView);
            const binarySpan = document.createElement('span');
            binarySpan.style.color = '#888';
            binarySpan.style.fontStyle = 'italic';
            binarySpan.textContent = `[Binary data \u2014 ${dataView.byteLength} bytes, likely ${type}. Cannot display compressed content.]`;
            const toolbar = createBodyPrettifyToolbar('request', false, true, false);
            const tr = document.createElement('tr');
            tr.style.whiteSpace = 'pre-wrap';
            tr.style.wordBreak = 'break-all';
            const td = document.createElement('td');
            td.colSpan = 2;
            td.appendChild(toolbar);
            td.appendChild(binarySpan);
            tr.appendChild(td);
            rows.push(tr);
          } else {
            const tr = document.createElement('tr');
            tr.style.whiteSpace = 'pre-wrap';
            tr.style.wordBreak = 'break-all';
            const td = document.createElement('td');
            td.colSpan = 2;
            const toolbar = createBodyPrettifyToolbar('request', isPrettified, false, true);
            td.appendChild(toolbar);
            const displayText = isPrettified && typeof prettifyContent === 'function' ?
              prettifyContent(decodedString, contentType) :
              decodedString;
            appendMarkedText(td, displayText, compiledFindPattern);
            tr.appendChild(td);
            rows.push(tr);
          }
        }
      } else if (typeof webEventIdRequestForm.body === 'string') {
        rows.push(renderBannerRow('Body (raw form data)'));
        const isBinary = isBinaryData(webEventIdRequestForm.body) || (typeof isBinaryContentType === 'function' && isBinaryContentType(contentType));
        const tr = document.createElement('tr');
        tr.style.whiteSpace = 'pre-wrap';
        tr.style.wordBreak = 'break-all';
        const td = document.createElement('td');
        td.colSpan = 2;
        const toolbar = createBodyPrettifyToolbar('request', isPrettified, isBinary, !isBinary);
        td.appendChild(toolbar);
        const displayText = isPrettified && typeof prettifyContent === 'function' ?
          prettifyContent(webEventIdRequestForm.body, contentType) :
          webEventIdRequestForm.body;
        appendMarkedText(td, displayText, compiledFindPattern);
        tr.appendChild(td);
        rows.push(tr);
      } else if (webEventIdRequestForm.error) {
        rows.push(renderBannerRow('Body'));
        const errorSpan = document.createElement('span');
        errorSpan.className = 'web_event_style_warning';
        errorSpan.textContent = `[⚠️ Body unavailable from browser: ${webEventIdRequestForm.error} (e.g. streaming, keepalive, or beacon)]`;
        rows.push(renderMessageRow(errorSpan, 'center'));
      }
    }
    return rows;
  }

  function buildResponseBodyRows(webEventIdResponseBody, maskPatterns, isMaskEnabled, compiledFindPattern, contentType = '', isPrettified = isResponsePrettified) {
    const rows = [];
    if (webEventIdResponseBody) {
      if (webEventIdResponseBody.formData) {
        rows.push(renderBannerRow('Body (form fields data)'));
        Object.entries(webEventIdResponseBody.formData).forEach(([key, value]) => {
          rows.push(renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern));
        });
      } else if (webEventIdResponseBody.raw) {
        rows.push(renderBannerRow('Body (response data)'));
        for (const eachByte of webEventIdResponseBody.raw) {
          if (!eachByte.bytes) {
            continue;
          }
          const dataView = new DataView(eachByte.bytes);
          const decodedString = decoder.decode(dataView);
          const isBinary = isBinaryData(decodedString) || (typeof isBinaryContentType === 'function' && isBinaryContentType(contentType));
          if (isBinary) {
            const type = detectCompressionType(dataView);
            const binarySpan = document.createElement('span');
            binarySpan.style.color = '#888';
            binarySpan.style.fontStyle = 'italic';
            binarySpan.textContent = `[Binary data \u2014 ${dataView.byteLength} bytes, likely ${type}. Cannot display compressed content.]`;
            const toolbar = createBodyPrettifyToolbar('response', false, true, false);
            const tr = document.createElement('tr');
            tr.style.whiteSpace = 'pre-wrap';
            tr.style.wordBreak = 'break-all';
            const td = document.createElement('td');
            td.colSpan = 2;
            td.appendChild(toolbar);
            td.appendChild(binarySpan);
            tr.appendChild(td);
            rows.push(tr);
          } else {
            const tr = document.createElement('tr');
            tr.style.whiteSpace = 'pre-wrap';
            tr.style.wordBreak = 'break-all';
            const td = document.createElement('td');
            td.colSpan = 2;
            const toolbar = createBodyPrettifyToolbar('response', isPrettified, false, true);
            td.appendChild(toolbar);
            const displayText = isPrettified && typeof prettifyContent === 'function' ?
              prettifyContent(decodedString, contentType) :
              decodedString;
            appendMarkedText(td, displayText, compiledFindPattern);
            tr.appendChild(td);
            rows.push(tr);
          }
        }
      } else if (typeof webEventIdResponseBody === 'string') {
        rows.push(renderBannerRow('Body (response data)'));
        const isBinary = isBinaryData(webEventIdResponseBody) || (typeof isBinaryContentType === 'function' && isBinaryContentType(contentType));
        const tr = document.createElement('tr');
        tr.style.whiteSpace = 'pre-wrap';
        tr.style.wordBreak = 'break-all';
        const td = document.createElement('td');
        td.colSpan = 2;
        const toolbar = createBodyPrettifyToolbar('response', isPrettified, isBinary, !isBinary);
        td.appendChild(toolbar);
        const displayText = isPrettified && typeof prettifyContent === 'function' ?
          prettifyContent(webEventIdResponseBody, contentType) :
          webEventIdResponseBody;
        appendMarkedText(td, displayText, compiledFindPattern);
        tr.appendChild(td);
        rows.push(tr);
      } else if (typeof webEventIdResponseBody.body === 'string') {
        rows.push(renderBannerRow('Body (response data)'));
        const isBinary = isBinaryData(webEventIdResponseBody.body) || (typeof isBinaryContentType === 'function' && isBinaryContentType(contentType));
        const tr = document.createElement('tr');
        tr.style.whiteSpace = 'pre-wrap';
        tr.style.wordBreak = 'break-all';
        const td = document.createElement('td');
        td.colSpan = 2;
        const toolbar = createBodyPrettifyToolbar('response', isPrettified, isBinary, !isBinary);
        td.appendChild(toolbar);
        const displayText = isPrettified && typeof prettifyContent === 'function' ?
          prettifyContent(webEventIdResponseBody.body, contentType) :
          webEventIdResponseBody.body;
        appendMarkedText(td, displayText, compiledFindPattern);
        tr.appendChild(td);
        rows.push(tr);
      } else if (typeof webEventIdResponseBody === 'object' && !webEventIdResponseBody.error) {
        rows.push(renderBannerRow('Body (response data)'));
        if (isPrettified) {
          const tr = document.createElement('tr');
          tr.style.whiteSpace = 'pre-wrap';
          tr.style.wordBreak = 'break-all';
          const td = document.createElement('td');
          td.colSpan = 2;
          const toolbar = createBodyPrettifyToolbar('response', true, false, true);
          td.appendChild(toolbar);
          appendMarkedText(td, JSON.stringify(webEventIdResponseBody, null, 2), compiledFindPattern);
          tr.appendChild(td);
          rows.push(tr);
        } else {
          Object.entries(webEventIdResponseBody).forEach(([key, value]) => {
            const valStr = typeof value === 'object' ? JSON.stringify(value) : value;
            rows.push(renderKeyValueRow(key, valStr, maskPatterns, isMaskEnabled, compiledFindPattern));
          });
        }
      } else if (webEventIdResponseBody.error) {
        rows.push(renderBannerRow('Body (response data)'));
        const errorSpan = document.createElement('span');
        errorSpan.className = 'web_event_style_warning';
        errorSpan.textContent = `[⚠️ Response body unavailable: ${webEventIdResponseBody.error}]`;
        rows.push(renderMessageRow(errorSpan, 'center'));
      }
    }
    return rows;
  }

  function generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const generalHeaderRows = [];
    let bannerTitle = 'Cookies (sorted: symbols, 0-9, Aa-Zz)'; // request cookies
    const cookieRows = [];
    const optimizedCookiesMap = new Map();
    headers.forEach((header) => {
      // request cookies
      if (header.name === HEADER_NAME_COOKIE) {
        cookieRows.push(...generateRequestCookieDetails(header.value, DELIMITER_REQUEST_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
      // response cookies
      else if (header.name.toLowerCase() === HEADER_NAME_SET_COOKIE) {
        if (!optimizeResponseCookies) {
          bannerTitle = 'Cookies (unoptimized)';
          cookieRows.push(...generateResponseCookieDetails(header.value, DELIMITER_RESPONSE_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern));
        } else {
          bannerTitle = 'Cookies (optimized)';
          buildOptimizedCookiesMap(header.value, DELIMITER_RESPONSE_COOKIE, optimizedCookiesMap);
        }
      }
      // other headers
      else {
        generalHeaderRows.push(renderKeyValueRow(header.name, header.value, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
    });
    if (optimizeResponseCookies) {
      sortMapByKey(optimizedCookiesMap).forEach((value, key) => {
        cookieRows.push(renderKeyValueRow(key.split(':', 1)[0], value.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern));
      });
    }
    if (cookieRows.length > 0) {
      return [...generalHeaderRows, renderBannerRow(bannerTitle), ...cookieRows];
    }
    return generalHeaderRows;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim).sort(sortArray);
    const rows = [];
    const cookieMap = new Map();
    cookieList.forEach((cookie) => {
      if (cookie) {
        const { cookieName, cookieValue: val } = getCookieNameValue(cookie);
        cookieMap.set(cookieName || cookie, val ?? '');
      }
    });
    cookieMap.forEach((value, key) => {
      rows.push(renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern));
    });
    return rows;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim);
    const rows = [];
    cookieList.forEach((cookie) => {
      if (cookie) {
        const cookieDetails = getCookieNameValue(cookie);
        rows.push(renderKeyValueRow(cookieDetails.cookieName, cookieDetails.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
    });
    return rows;
  }

  function buildOptimizedCookiesMap(cookieValue, cookieDelim, optimizedCookiesMap) {
    const cookieList = cookieValue.split(cookieDelim);
    cookieList.forEach((cookie) => {
      if (cookie) {
        let key = '';
        const cookieDetails = getCookieNameValue(cookie);
        const name = cookieDetails.cookieName?.trim() ?? '';
        const cleanDomain = cookieDetails.domain ? cookieDetails.domain.replace(/^\./, '').toLowerCase() : '';
        const path = cookieDetails.path ?? '';
        if (name && cleanDomain && path) {
          key = `${name}:${cleanDomain}:${path}`;
        } else if (name && cleanDomain) {
          key = `${name}:${cleanDomain}`;
        } else {
          key = `${name}`;
        }
        optimizedCookiesMap.set(key, cookieDetails);
      }
    });
  }

  function deleteCookiesForSelectedDomain() {
    const rawInput = getById('delete_cookies')?.value.trim();
    if (!rawInput) {
      return;
    }
    const domain = rawInput.replace(/^https?:\/\//i, '').split('/')[0];
    const btn = getById('delete_cookies_button');
    const getAllDetails = { domain };
    if (httpTracker.isFF) {
      getAllDetails.firstPartyDomain = null;
    } else {
      getAllDetails.partitionKey = {};
    }
    httpTracker.browser.cookies.getAll(getAllDetails).then((cookies) => {
      removeCookies(cookies);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Deleted!';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
          }
        }, 1200);
      }
    }).catch(onError);
  }

  function togglePrettifyRequestBody() {
    isRequestPrettified = !isRequestPrettified;
    return isRequestPrettified;
  }

  function togglePrettifyResponseBody() {
    isResponsePrettified = !isResponsePrettified;
    return isResponsePrettified;
  }

  function isRequestBodyPrettified() {
    return isRequestPrettified;
  }

  function isResponseBodyPrettified() {
    return isResponsePrettified;
  }

  function setRequestBodyPrettified(val) {
    isRequestPrettified = Boolean(val);
  }

  function setResponseBodyPrettified(val) {
    isResponsePrettified = Boolean(val);
  }

  return {
    renderSelectedEventDetails,
    clearDetailsView,
    deleteCookiesForSelectedDomain,
    buildResponseBodyRows,
    buildRequestFormRows,
    togglePrettifyRequestBody,
    togglePrettifyResponseBody,
    isRequestBodyPrettified,
    isResponseBodyPrettified,
    setRequestBodyPrettified,
    setResponseBodyPrettified,
  };
})();
