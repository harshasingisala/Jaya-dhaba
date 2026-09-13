"""Compatibility shim for libraries expecting pkg_resources after Setuptools 82+."""
import importlib.metadata

class DistributionNotFound(Exception):
    pass

class _Distribution:
    def __init__(self, name: str):
        try:
            self.version = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            raise DistributionNotFound(name)

def require(name: str):
    return [_Distribution(name)]
