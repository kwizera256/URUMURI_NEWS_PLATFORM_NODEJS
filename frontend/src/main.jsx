import 'core-js/stable';
import React from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import './index.css'; import App from './App.jsx';
(async () => { // CDN first, npm copy if the CDN failed to load
  if (!window.jQuery) { window.jQuery = window.$ = (await import('jquery')).default; }
  if (!window.videojs) { window.videojs = (await import('video.js')).default; await import('video.js/dist/video-js.css'); }
  createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
  const loader = document.getElementById('app-loader');
  if (loader) { loader.classList.add('hide'); setTimeout(() => loader.remove(), 400); }
})();
