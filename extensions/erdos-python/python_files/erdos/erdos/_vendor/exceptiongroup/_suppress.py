from __future__ import annotations

import sys
from contextlib import AbstractContextManager
from types import TracebackType
from typing import TYPE_CHECKING, Optional, Type, cast

if sys.version_info < (3, 11):
    from ._exceptions import BaseExceptionGroup

if TYPE_CHECKING:
    # requires python 3.9
    BaseClass = AbstractContextManager[None]
else:
    BaseClass = AbstractContextManager


class suppress(BaseClass):
    """Backport of :class:`contextlib.suppress` from Python 3.12.1."""

    def __init__(self, *exceptions: type[BaseException]):
        self._exceptions = exceptions

    def __enter__(self) -> None:
        pass

    def __exit__(
        self,
        exctype: Optional[Type[BaseException]],
        excinst: Optional[BaseException],
        exctb: Optional[TracebackType],
    ) -> bool:
        # Unlike isinstance and issubclass, CPython exception handling
        # currently only looks at the concrete type hierarchy (ignoring
        # the instance and subclass checking hooks). While Guido considers
        # that a bug rather than a feature, it's a fairly hard one to fix
        # due to various internal implementation details. suppress provides
        # the simpler issubclass based semantics, rather than trying to
        # exactly reproduce the limitations of the CPython interpreter.
        #
        # See http://bugs.python.org/issue12029 for more details
        if exctype is None:
            return False

        if issubclass(exctype, self._exceptions):
            return True

        if issubclass(exctype, BaseExceptionGroup):
            match, rest = cast(BaseExceptionGroup, excinst).split(self._exceptions)
            if rest is None:
                return True

            raise rest

        return False
