import { Suspense, lazy } from "react";
import ProtectedRoute from "../components/ProtectedRoute";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";

const Admin = lazy(() => import("./Admin"));

export default function AdminRoute() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ProtectedRoute allowedRoles={["admin", "owner", "staff", "manager"]}>
          <Suspense fallback={null}>
            <Admin />
          </Suspense>
        </ProtectedRoute>
      </ToastProvider>
    </AuthProvider>
  );
}
