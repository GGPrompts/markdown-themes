import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppStoreProvider } from "./context/AppStoreContext";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppStoreProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </AppStoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
