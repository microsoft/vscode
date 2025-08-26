from typing import Any, Callable, List

from django.urls.resolvers import URLPattern

def static(prefix: str, view: Callable = ..., **kwargs: Any) -> List[URLPattern]: ...
