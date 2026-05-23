import logging


security_logger = logging.getLogger("security")


def log_security_event(event, ip, detail=""):
    security_logger.warning(
        "[SECURITY] %s | IP: %s | Detail: %s",
        event,
        ip or "unknown",
        detail or "",
    )
