from typing import Any

from django.apps.config import AppConfig
from django.apps.registry import Apps

def create_permissions(
    app_config: AppConfig,
    verbosity: int = ...,
    interactive: bool = ...,
    using: str = ...,
    apps: Apps = ...,
    **kwargs: Any
) -> None: ...
def get_system_username() -> str: ...
def get_default_username(check_db: bool = ...) -> str: ...
