from typing import Any, List, Iterable, Optional

from django.core.checks.messages import Error

from django.apps.config import AppConfig

def check_finders(app_configs: Optional[Iterable[AppConfig]] = ..., **kwargs: Any) -> List[Error]: ...
