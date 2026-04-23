// Frame helpers for same-origin iframe annotations.

var VibeFrameUtils = (() => {
  const FRAME_EVENT_KEY = '__vibeFrameInspectionState';
  const TOP_MESSAGE_KEY = '__vibeAnnotationsFrameMessage';

  function isTopFrame() {
    return window.top === window.self;
  }

  function getCurrentFrameContext() {
    return getFrameContextForWindow(window) || null;
  }

  function getFrameContextForWindow(targetWindow) {
    try {
      if (!targetWindow || targetWindow.top === targetWindow.self) return null;
      const chain = [];
      let current = targetWindow;
      while (current && current.parent && current !== current.parent) {
        const iframe = findIframeElement(current.parent, current);
        if (!iframe) return null;
        chain.unshift(buildIframeDescriptor(iframe));
        current = current.parent;
      }
      return chain.length ? { path: chain } : null;
    } catch {
      return null;
    }
  }

  function resolveFrameContext(frameContext, rootDocument = document) {
    if (!frameContext || !Array.isArray(frameContext.path) || !frameContext.path.length) {
      return { window: rootDocument.defaultView || window, document: rootDocument, iframe: null };
    }
    let currentWindow = rootDocument.defaultView || window;
    let currentDocument = rootDocument;
    let iframeEl = null;
    for (const descriptor of frameContext.path) {
      iframeEl = resolveIframeDescriptor(currentDocument, descriptor);
      if (!iframeEl) return null;
      try {
        currentWindow = iframeEl.contentWindow;
        currentDocument = iframeEl.contentDocument;
      } catch {
        return null;
      }
      if (!currentWindow || !currentDocument) return null;
    }
    return { window: currentWindow, document: currentDocument, iframe: iframeEl };
  }

  function normalizeFrameContext(frameContext) {
    if (!frameContext || !Array.isArray(frameContext.path) || !frameContext.path.length) return null;
    return frameContext;
  }

  function isSameFrameContext(a, b) {
    const left = normalizeFrameContext(a);
    const right = normalizeFrameContext(b);
    if (!left || !right) return !left && !right;
    return JSON.stringify(left.path) === JSON.stringify(right.path);
  }

  function isAnnotationForCurrentFrame(annotation) {
    return isSameFrameContext(annotation?.frame_context || null, getCurrentFrameContext());
  }

  function buildIframeDescriptor(iframe) {
    const descriptor = {
      selector: buildIframeSelector(iframe),
      name: iframe.getAttribute('name') || null,
      id: iframe.id || null,
      src: iframe.getAttribute('src') || null
    };
    return descriptor;
  }

  function buildIframeSelector(iframe) {
    if (iframe.id) return `iframe#${CSS.escape(iframe.id)}`;
    const name = iframe.getAttribute('name');
    if (name) return `iframe[name="${CSS.escape(name)}"]`;
    const src = iframe.getAttribute('src');
    if (src) return `iframe[src="${CSS.escape(src)}"]`;
    let part = 'iframe';
    const parent = iframe.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName.toLowerCase() === 'iframe');
      if (siblings.length > 1) part = `iframe:nth-of-type(${siblings.indexOf(iframe) + 1})`;
    }
    return part;
  }

  function resolveIframeDescriptor(rootDocument, descriptor) {
    const selectors = [];
    if (descriptor?.selector) selectors.push(descriptor.selector);
    if (descriptor?.id) selectors.push(`iframe#${CSS.escape(descriptor.id)}`);
    if (descriptor?.name) selectors.push(`iframe[name="${CSS.escape(descriptor.name)}"]`);
    if (descriptor?.src) selectors.push(`iframe[src="${CSS.escape(descriptor.src)}"]`);
    for (const selector of selectors) {
      try {
        const hit = rootDocument.querySelector(selector);
        if (hit) return hit;
      } catch {}
    }
    return null;
  }

  function findIframeElement(parentWindow, childWindow) {
    try {
      for (const iframe of parentWindow.document.querySelectorAll('iframe')) {
        try {
          if (iframe.contentWindow === childWindow) return iframe;
        } catch {}
      }
    } catch {}
    return null;
  }

  function getFrameOffsetToTop(targetWindow = window) {
    let x = 0;
    let y = 0;
    try {
      let current = targetWindow;
      while (current && current.parent && current !== current.parent) {
        const iframe = findIframeElement(current.parent, current);
        if (!iframe) return null;
        const rect = iframe.getBoundingClientRect();
        x += rect.left;
        y += rect.top;
        current = current.parent;
      }
      return { x, y };
    } catch {
      return null;
    }
  }

  function translatePointToTop(clientX, clientY, targetWindow = window) {
    const offset = getFrameOffsetToTop(targetWindow);
    if (!offset) return { x: clientX, y: clientY };
    return { x: clientX + offset.x, y: clientY + offset.y };
  }

  function translateRectToTop(rect, targetWindow = window) {
    const offset = getFrameOffsetToTop(targetWindow);
    if (!offset) {
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height
      };
    }

    const top = rect.top + offset.y;
    const left = rect.left + offset.x;
    return {
      top,
      left,
      width: rect.width,
      height: rect.height,
      right: left + rect.width,
      bottom: top + rect.height
    };
  }

  function sendTopMessage(type, payload = {}) {
    const message = {
      key: TOP_MESSAGE_KEY,
      type,
      payload
    };

    if (isTopFrame()) {
      window.postMessage(message, '*');
      return;
    }

    try {
      window.top.postMessage(message, '*');
    } catch {}
  }

  function sendFrameMessage(frameContext, type, payload = {}) {
    const resolved = resolveFrameContext(frameContext);
    if (!resolved?.window) return false;
    try {
      resolved.window.postMessage({
        key: TOP_MESSAGE_KEY,
        type,
        payload
      }, '*');
      return true;
    } catch {
      return false;
    }
  }

  function onFrameMessage(type, cb) {
    const handler = (event) => {
      const data = event.data;
      if (!data || data.key !== TOP_MESSAGE_KEY || data.type !== type) return;
      cb(data.payload || {}, event);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  function onTopMessage(type, cb) {
    if (!isTopFrame()) return () => {};

    return onFrameMessage(type, cb);
  }

  function setInspectionState(active) {
    try {
      localStorage.setItem(FRAME_EVENT_KEY, JSON.stringify({ active, ts: Date.now() }));
    } catch {}
  }

  function onInspectionStateChange(cb) {
    window.addEventListener('storage', (e) => {
      if (e.key !== FRAME_EVENT_KEY || !e.newValue) return;
      try {
        const payload = JSON.parse(e.newValue);
        cb(!!payload.active);
      } catch {}
    });
  }

  return {
    isTopFrame,
    getCurrentFrameContext,
    getFrameContextForWindow,
    resolveFrameContext,
    isSameFrameContext,
    isAnnotationForCurrentFrame,
    getFrameOffsetToTop,
    translatePointToTop,
    translateRectToTop,
    sendTopMessage,
    sendFrameMessage,
    onFrameMessage,
    onTopMessage,
    setInspectionState,
    onInspectionStateChange
  };
})();
