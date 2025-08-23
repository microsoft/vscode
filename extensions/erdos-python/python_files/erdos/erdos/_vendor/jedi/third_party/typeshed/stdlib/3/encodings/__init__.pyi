import codecs
from typing import Any

def search_function(encoding: str) -> codecs.CodecInfo: ...

# Explicitly mark this package as incomplete.
def __getattr__(name: str) -> Any: ...
