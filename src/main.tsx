import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { ToastProvider } from "./components/Toast";
import { LogProvider } from "./components/LogContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LogProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LogProvider>
  </React.StrictMode>,
);
