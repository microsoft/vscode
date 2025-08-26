from typing import Any, List, Iterable, Optional

from django.core.checks.messages import Error

from django.apps.config import AppConfig

E001: Any
E002: Any

def check_setting_app_dirs_loaders(app_configs: Optional[Iterable[AppConfig]], **kwargs: Any) -> List[Error]: ...
def check_string_if_invalid_is_string(app_configs: Optional[Iterable[AppConfig]], **kwargs: Any) -> List[Error]: ...
