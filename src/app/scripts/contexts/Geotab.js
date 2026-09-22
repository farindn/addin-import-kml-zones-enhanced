import { createContext } from 'react';

const GeotabContext = createContext({
  geotabApi: null,
  geotabState: null,
  focusVersion: 0
});

export default GeotabContext;
