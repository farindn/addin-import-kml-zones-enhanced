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
}, 5000);

if (typeof geotab === 'undefined' || !geotab.addin) {
  showBootMessage('MyGeotab did not provide the Add-In SDK host before the bundle loaded.');
} else {
  geotab.addin[appName] = function addinLifecycle() {
  window.__importKmlZonesLifecycleStarted = true;
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
}
