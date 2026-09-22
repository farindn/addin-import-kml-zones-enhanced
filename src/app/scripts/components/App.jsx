import React, { Component, useMemo } from 'react';
import { FeedbackProvider, LanguageProvider } from '@geotab/zenith';
import GeotabContext from '../contexts/Geotab';
import createLogger from '../utils/logger';
import ImportPage from './ImportPage';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Import KML Zones] React render failure', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="importKmlZones-boot-error" role="alert">
        <strong>Import KML Zones could not render.</strong>
        <pre>{this.state.error.message || String(this.state.error)}</pre>
      </div>
    );
  }
}

const App = ({ geotabApi, geotabState, focusVersion }) => {
  const logger = useMemo(() => createLogger('importKmlZones'), []);
  const context = useMemo(
    () => ({ geotabApi, geotabState, focusVersion, logger }),
    [geotabApi, geotabState, focusVersion, logger]
  );

  return (
    <AppErrorBoundary>
      <LanguageProvider language="en">
        <FeedbackProvider>
          <GeotabContext.Provider value={context}>
            <ImportPage />
          </GeotabContext.Provider>
        </FeedbackProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  );
};

export default App;
