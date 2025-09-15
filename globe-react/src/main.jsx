// globe-react/src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import InteractiveGlobe from './InteractiveGlobe.jsx';

const root = createRoot(document.getElementById('root'));
root.render(<InteractiveGlobe />);
