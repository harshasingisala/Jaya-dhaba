import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { HelmetProvider } from "./vendor/react-helmet-async";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ErrorBoundary } from "react-error-boundary";
import GlobalErrorBoundary from "./components/GlobalErrorBoundary";
import "./index.css";

const AdminLogin = lazy(() => import("./pages/Admin/Login"));

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => registrations.forEach((registration) => registration.unregister()))
    .catch(() => {});
}

function RootShell() {
  const location = useLocation();

  if (location.pathname === "/admin/login") {
    return (
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={null}>
            <AdminLogin />
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    );
  }

  return (
    <AppProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ErrorBoundary FallbackComponent={GlobalErrorBoundary} onReset={() => window.location.reload()}>
          <RootShell />
        </ErrorBoundary>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
