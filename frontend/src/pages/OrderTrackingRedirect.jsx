import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function OrderTrackingRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (id) {
      const params = new URLSearchParams(location.search);
      params.set("id", id);
      navigate(`/track?${params.toString()}`, { replace: true });
    } else {
      navigate("/track", { replace: true });
    }
  }, [id, location.search, navigate]);

  return null;
}
