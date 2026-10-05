import React from "react";
import ReactDOM from "react-dom/client";
import SiteApp from "./site/SiteApp.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>,
);

import { registerOfflineWorker } from './PwaPanel.jsx';
registerOfflineWorker().catch(error => console.warn('Offline shell unavailable:', error.message));
