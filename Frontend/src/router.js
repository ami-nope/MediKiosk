/**
 * MediKIOSK — Hash Router
 *
 * Simple hash-based SPA router. Routes map to render functions that
 * return DOM content for the page container.
 */

const routes = new Map();
let currentCleanup = null;

/**
 * Register a route.
 * @param {string} hash - e.g. '#/kiosk' or '#/dashboard'
 * @param {Function} handler - (params) => { render, cleanup? }
 */
export function route(hash, handler) {
  routes.set(hash, handler);
}

/**
 * Navigate to a hash route.
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Get the current hash route.
 */
export function currentRoute() {
  return window.location.hash || '#/kiosk';
}

/**
 * Initialize the router — listen for hash changes.
 */
export function initRouter(container) {
  function handleRoute() {
    // Clean up previous view
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    const hash = currentRoute();

    // Find the matching route
    let handler = routes.get(hash);

    // Try prefix matching for parameterized routes
    if (!handler) {
      for (const [pattern, h] of routes) {
        if (hash.startsWith(pattern.replace(/\/:[^/]+/g, ''))) {
          handler = h;
          break;
        }
      }
    }

    if (!handler) {
      handler = routes.get('#/kiosk') || routes.values().next().value;
    }

    if (handler) {
      const result = handler(hash);
      if (result) {
        container.innerHTML = '';
        if (typeof result.render === 'string') {
          container.innerHTML = result.render;
        } else if (result.render instanceof HTMLElement) {
          container.appendChild(result.render);
        }
        // Call mount callback after DOM is ready
        if (result.mount) {
          requestAnimationFrame(() => result.mount());
        }
        currentCleanup = result.cleanup || null;
      }
    }
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  return () => window.removeEventListener('hashchange', handleRoute);
}
