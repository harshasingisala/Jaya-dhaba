import { Navigate, useLocation } from "react-router-dom";
import { isTokenExpired } from "../api";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const location = useLocation();
  const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");

  let user = null;
  try {
    user = userStr ? JSON.parse(userStr) : null;
  } catch {
    user = null;
  }

  const token = user?.access_token || user?.token;
  const isExpired = Boolean(token && isTokenExpired(token));

  if (!token || isExpired) {
    if (isExpired) {
      localStorage.removeItem("user");
      sessionStorage.removeItem("user");
    }
    return <Navigate to="/admin/login" state={{ from: location }} replace={true} />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/admin" replace={true} />;
  }

  return children;
}
