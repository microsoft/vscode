__all__ = [
    "BaseExceptionGroup",
    "ExceptionGroup",
    "catch",
    "format_exception",
    "format_exception_only",
    "print_exception",
    "print_exc",
    "suppress",
]

import os
import sys

from ._catch import catch
from ._version import version as __version__  # noqa: F401

if sys.version_info < (3, 11):
    from ._exceptions import BaseExceptionGroup, ExceptionGroup
    from ._formatting import (
        format_exception,
        format_exception_only,
        print_exc,
        print_exception,
    )

    if os.getenv("EXCEPTIONGROUP_NO_PATCH") != "1":
        from . import _formatting  # noqa: F401

    BaseExceptionGroup.__module__ = __name__
    ExceptionGroup.__module__ = __name__
else:
    from traceback import (
        format_exception,
        format_exception_only,
        print_exc,
        print_exception,
    )

    BaseExceptionGroup = BaseExceptionGroup
    ExceptionGroup = ExceptionGroup

if sys.version_info < (3, 12, 1):
    from ._suppress import suppress
else:
    from contextlib import suppress
