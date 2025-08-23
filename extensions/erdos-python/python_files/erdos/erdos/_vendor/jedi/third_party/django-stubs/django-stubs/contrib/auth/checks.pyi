from typing import Any, List, Iterable, Optional

from django.core.checks.messages import CheckMessage

from django.apps.config import AppConfig

def check_user_model(app_configs: Optional[Iterable[AppConfig]] = ..., **kwargs: Any) -> List[CheckMessage]: ...
def check_models_permissions(app_configs: Optional[Iterable[AppConfig]] = ..., **kwargs: Any) -> List[Any]: ...
