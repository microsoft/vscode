from typing import Any

from django.apps import AppConfig

class StaticFilesConfig(AppConfig):
    ignore_patterns: Any = ...
