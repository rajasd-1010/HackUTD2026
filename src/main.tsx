import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/permanent-marker/400.css';
import './app/app.css';
import { AppProvider } from './app/state';
import { Shell, useRoute } from './app/Shell';
import { Home } from './app/pages/Home';
import { MyCar } from './app/pages/MyCar';
import { Call } from './app/pages/Call';
import { Plan } from './app/pages/Plan';
import { Learn } from './app/pages/Learn';
import { Help } from './app/pages/Help';
import { Staff } from './app/pages/Staff';

function App() {
  const [route] = useRoute();
  const page = {
    home: <Home />, car: <MyCar />, call: <Call />, plan: <Plan />, learn: <Learn />, help: <Help />, staff: <Staff />,
  }[route];
  return <Shell route={route}>{page}</Shell>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <App />
      </AppProvider>
    </MotionConfig>
  </React.StrictMode>,
);
