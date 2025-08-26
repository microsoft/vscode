from typing import Any

# Explicitly mark this package as incomplete.
def __getattr__(name: str) -> Any: ...
