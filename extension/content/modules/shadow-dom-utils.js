// Shadow DOM helpers for deep querying and parent traversal.
// Works with open shadow roots only.

var VibeShadowDOMUtils = (() => {
  function isElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE;
  }

  function isShadowRoot(node) {
    return node && node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !!node.host;
  }

  function querySelectorAllInRoot(root, selector) {
    if (!root || !selector) return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function collectElementsDeep(root, selector, out) {
    out.push(...querySelectorAllInRoot(root, selector));

    const rootElements = querySelectorAllInRoot(root, '*');
    for (const el of rootElements) {
      if (el.shadowRoot) {
        collectElementsDeep(el.shadowRoot, selector, out);
      }
    }
  }

  function querySelectorAllDeep(root, selector) {
    const results = [];
    collectElementsDeep(root || document, selector, results);
    return results;
  }

  function querySelectorDeep(root, selector) {
    const results = querySelectorAllDeep(root || document, selector);
    return results.length ? results[0] : null;
  }

  function getParentElement(node) {
    if (!node) return null;

    if (node.parentElement) return node.parentElement;

    const parentNode = node.parentNode;
    if (isShadowRoot(parentNode)) return parentNode.host;

    return null;
  }

  function isInShadowDOM(element) {
    if (!isElement(element)) return false;
    const root = element.getRootNode?.();
    return !!(root && isShadowRoot(root));
  }

  function getShadowPath(element) {
    const hosts = [];
    let current = element;

    while (current) {
      const root = current.getRootNode?.();
      if (!isShadowRoot(root)) break;
      hosts.unshift(root.host);
      current = root.host;
    }

    return hosts;
  }

  function findByShadowSelector(root, selector, separator = ' >> ') {
    if (!selector) return null;
    const parts = selector.split(separator).map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return null;

    let currentRoot = root || document;
    let currentEl = null;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (isLast) {
        return querySelectorDeep(currentRoot, part);
      }

      currentEl = querySelectorDeep(currentRoot, part);
      if (!currentEl || !currentEl.shadowRoot) return null;
      currentRoot = currentEl.shadowRoot;
    }

    return null;
  }

  return {
    querySelectorDeep,
    querySelectorAllDeep,
    getParentElement,
    isInShadowDOM,
    getShadowPath,
    findByShadowSelector
  };
})();
