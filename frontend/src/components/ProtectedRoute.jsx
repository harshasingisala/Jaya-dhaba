import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();
  const { user, accessToken, isRestoring, logout, sessionExpired } = useAuth();

  if (isRestoring) {
    return null;
  }

  if (!accessToken || sessionExpired) {
    if (sessionExpired) logout();
    return <Navigate to="/admin/login" state={{ from: location }} replace={true} />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/admin" replace={true} />;
  }

  return children;
}
