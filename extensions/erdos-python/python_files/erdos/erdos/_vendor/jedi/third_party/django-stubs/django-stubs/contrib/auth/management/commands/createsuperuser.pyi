import getpass as getpass  # noqa: F401
from typing import Any

from django.core.management.base import BaseCommand

class NotRunningInTTYException(Exception): ...

class Command(BaseCommand):
    stdin: Any
