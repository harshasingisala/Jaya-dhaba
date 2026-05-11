/**
 * Handles Non-OK responses and Network failures automatically.
 */
import { notify } from "../context/ToastContext";

export const safeFetch = async (url, options = {}) => {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            // Alert the user via Toast
            notify(data.error || "The server encountered an issue.", "error");
            return { error: data.error || "API Failed", status: response.status };
        }

        return data;
    } catch (err) {
        if (import.meta.env.DEV) console.error("Network / Connection Failure:", err);
        notify("🚨 Connection Lost! Please check your internet or server status.", "error");
        return { error: "Network Failure", status: 503 };
    }
};
