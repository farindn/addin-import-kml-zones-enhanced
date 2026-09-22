/* global geotab */
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import App from './components/App';

const appName = 'importKmlZones';

const showBootMessage = (message, error) => {
  const loading = document.getElementById(`${appName}-loading`);
  const element = document.getElementById(appName);
  if (loading) {
    loading.textContent = message;
    loading.className = 'importKmlZones-boot-error';
  }
  if (element) element.classList.remove('hidden');
  if (error) console.error('[Import KML Zones] boot failure', error);
};

setTimeout(() => {
  if (!window.__importKmlZonesLifecycleStarted) {
    showBootMessage('MyGeotab did not start the Import KML Zones add-in lifecycle.');
  }
}, 15000);

let registrationTimer;
const addinLifecycle = function addinLifecycle() {
  window.__importKmlZonesLifecycleStarted = true;
  if (registrationTimer) window.clearInterval(registrationTimer);
  const element = document.getElementById(appName);
  let reactRoot;
  let focusVersion = 0;

  const render = (api, state) => {
    try {
      if (!element) throw new Error('The #importKmlZones mount element is missing.');
      if (!reactRoot) reactRoot = createRoot(element);
      const loading = document.getElementById(`${appName}-loading`);
      if (loading) loading.remove();
      element.classList.remove('hidden');
      reactRoot.render(createElement(App, { geotabApi: api, geotabState: state, focusVersion }));
    } catch (error) {
      showBootMessage(error.message || 'The add-in could not start.', error);
    }
  };

  return {
    initialize(api, state, callback) {
      render(api, state);
      callback();
    },
    focus(api, state) {
      focusVersion += 1;
      render(api, state);
    },
    blur() {
      // Keep the React tree mounted so an in-flight MyGeotab batch can finish.
    }
  };
};

const registerAddin = () => {
  const host = window.geotab;
  if (!host) return;
  host.addin = host.addin || {};
  host.addin[appName] = addinLifecycle;
};

registerAddin();
window.addEventListener('DOMContentLoaded', registerAddin);
window.addEventListener('load', registerAddin);
registrationTimer = window.setInterval(registerAddin, 100);
