import sys

from ._base import (
    ALL_COMPLETED as ALL_COMPLETED,
    FIRST_COMPLETED as FIRST_COMPLETED,
    FIRST_EXCEPTION as FIRST_EXCEPTION,
    CancelledError as CancelledError,
    Executor as Executor,
    Future as Future,
    TimeoutError as TimeoutError,
    as_completed as as_completed,
    wait as wait,
)
from .process import ProcessPoolExecutor as ProcessPoolExecutor
from .thread import ThreadPoolExecutor as ThreadPoolExecutor

if sys.version_info >= (3, 8):
    from ._base import InvalidStateError as InvalidStateError
if sys.version_info >= (3, 7):
    from ._base import BrokenExecutor as BrokenExecutor
