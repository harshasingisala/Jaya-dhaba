import { Suspense, lazy } from "react";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";

const AdminLogin = lazy(() => import("./Admin/Login"));

export default function AdminLoginRoute() {
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
