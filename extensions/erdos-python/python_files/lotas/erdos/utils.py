#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import asyncio
import concurrent.futures
import functools
import inspect
import logging
import sys
import threading
import uuid
from pathlib import Path
from typing import (
    Any,
    Callable,
    Coroutine,
    Dict,
    List,
    Optional,
    Set,
    TypeVar,
    Union,
    cast,
)
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)

JsonData = Union[Dict[str, "JsonData"], List["JsonData"], str, int, float, bool, None]
JsonRecord = Dict[str, JsonData]


T = TypeVar("T")


TESTING = False


def get_qualname(value: Any) -> str:
    """Utility to manually construct a qualified type name as __qualname__ does not work for all types."""
    if (
        isinstance(value, type)
        or inspect.ismodule(value)
        or callable(value)
        or inspect.isgetsetdescriptor(value)
    ):
        named_obj = value
    elif isinstance(value, property):
        assert value.fget is not None
        named_obj = value.fget
    else:
        named_obj = type(value)

    qualname = getattr(named_obj, "__qualname__", None)
    if qualname is None:
        qualname = getattr(named_obj, "__name__", None)

    if qualname is None:
        class_obj = getattr(named_obj, "__class__", None)
        qualname = getattr(class_obj, "__name__", None)

    if qualname is None:
        qualname = getattr(type(value), "__name__", "object")

    if not isinstance(qualname, str):
        qualname = getattr(type(value), "__name__", "object")

    qualname = cast("str", qualname)

    if not inspect.ismodule(value):
        module = get_module_name(named_obj)
        if module is not None and module not in {"builtins", "__main__"}:
            qualname = f"{module}.{qualname}"

    return qualname


def get_module_name(value: Any) -> Optional[str]:
    """Get the name of the module defining `value`."""
    if inspect.ismodule(value):
        return value.__name__

    module = getattr(value, "__module__", None)
    if module is not None:
        return module

    if is_numpy_ufunc(value):
        return "numpy"

    obj_class = getattr(value, "__objclass__", None)
    if obj_class is not None:
        return obj_class.__module__

    return None


def is_numpy_ufunc(object_: Any) -> bool:
    object_type = type(object_)
    return object_type.__module__ == "numpy" and object_type.__name__ == "ufunc"


ISO8601 = "%Y-%m-%dT%H:%M:%S.%f"


def create_task(coro: Coroutine, pending_tasks: Set[asyncio.Task], **kwargs) -> asyncio.Task:
    """
    Create a strongly referenced task to avoid it being garbage collected.

    Note that the call should hold a strong reference to pending_tasks.

    See the asyncio docs for more info: https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task.
    """
    task = asyncio.create_task(coro, **kwargs)
    pending_tasks.add(task)
    task.add_done_callback(pending_tasks.remove)
    return task


async def cancel_tasks(tasks: Set[asyncio.Task]) -> None:
    """Cancel and await a set of tasks."""
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks)
    tasks.clear()


class BackgroundJobQueue:
    """Simple threadpool-based background job queue for pseudo-asynchronous request handling in kernel services."""

    def __init__(self, max_workers=None):
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        self.pending_futures = set()
        self.lock = threading.Lock()

    def submit(self, fn, *args, **kwargs):
        future = self.executor.submit(fn, *args, **kwargs)
        with self.lock:
            self.pending_futures.add(future)

        future.add_done_callback(self._remove_future)
        return future

    def _remove_future(self, future):
        with self.lock:
            self.pending_futures.discard(future)

    def wait_for_all(self):
        with self.lock:
            futures = list(self.pending_futures)

        for future in futures:
            future.result()

    def shutdown(self, *, wait=True):
        self.executor.shutdown(wait=wait)


def safe_isinstance(obj: Any, module: str, class_name: str, *attrs: str) -> bool:
    """
    Check if `obj` is an instance of module.class_name if loaded.

    Adapted from `IPython.core.completer._safe_isinstance`.
    """
    if module in sys.modules:
        m = sys.modules[module]
        for attr in [class_name, *attrs]:
            m = getattr(m, attr)
        if not isinstance(m, type):
            raise ValueError(f"{module}.{class_name}.{'.'.join(attrs)} is not a type")
        return isinstance(obj, m)
    return False


def not_none(value: Optional[T]) -> T:
    """Assert that a value is not None."""
    assert value is not None
    return value


def alias_home(path: Path) -> Path:
    """Alias the home directory to ~ in a path."""
    home_dir = Path.home()
    try:
        return Path("~") / path.relative_to(home_dir)
    except ValueError:
        return path


def guid():
    return str(uuid.uuid4())


def var_guid():
    """Generate a unique identifier for a variable."""
    return f"var_{uuid.uuid4().hex}"


def erdos_ipykernel_usage():
    """

    Erdos Console Help.
    =========================================

    The Erdos Console offers a fully compatible replacement for the standard Python
    interpreter, with convenient shell features, special commands, command
    history mechanism and output results caching. It is an adapted version of an
    [IPython](https://ipython.readthedocs.io/en/stable/) kernel. For more information, check out the
    [Erdos documentation](https://erdos.lotas.co/).

    GETTING HELP
    ------------

    Within the Erdos Console you have various ways to get help:

      - `?`             -> Introduction and overview of IPython's features (this screen).
      - `object?`       -> View 'object' in Help pane.
      - `object??`      -> View source code for 'object'
      - `help(object)`  -> View 'object' in Help pane.
      - `%quickref`     -> Quick reference of all IPython specific syntax and magics.



    MAIN FEATURES
    -------------

    * View tabular data in the data explorer via the %view command.

    * Magic commands: type %magic for information on the magic subsystem.

    * System command aliases, via the %alias command or the configuration file(s).

    * Dynamic object information:

      Typing ?word or word? sends 'word' to the help pane.

      Typing ??word or word?? displays source code for 'word'.

      If you just want to see an object's docstring, type '%pdoc object' (without
      quotes, and without % if you have automagic on).

    * Tab completion in the local namespace:

      At any time, hitting tab will complete any available Python commands or
      variable names, and show you a list of the possible completions if there's
      no unambiguous one. It will also complete filenames in the current directory.

    * Search previous command history in multiple ways:

      - Use arrow keys up/down to navigate through the history of executed commands.
      - Hit Ctrl-r: opens a search prompt. Begin typing and the system searches
        your history for lines that match what you've typed so far, completing as
        much as it can.

      - %hist: search history by index.

    * Persistent command history across sessions.

    * System shell with !. Typing !ls will run 'ls' in the current directory.

    * Verbose and colored exception traceback printouts. See the magic xmode and
      xcolor functions for details (just type %magic).

    * Clickable links in exception traceback printouts.

    """


numpy_numeric_scalars = [
    "numpy.int8",
    "numpy.uint8",
    "numpy.int16",
    "numpy.uint16",
    "numpy.int32",
    "numpy.uint32",
    "numpy.int64",
    "numpy.uint64",
    "numpy.intp",
    "numpy.uintp",
    "numpy.float16",
    "numpy.float32",
    "numpy.float64",
    "numpy.float96",
    "numpy.complex64",
    "numpy.complex128",
    "numpy.short",
    "numpy.ushort",
    "numpy.intc",
    "numpy.uintc",
    "numpy.long",
    "numpy.ulong",
    "numpy.longlong",
    "numpy.ulonglong",
    "numpy.half",
    "numpy.single",
    "numpy.double",
    "numpy.longdouble",
    "numpy.csingle",
    "numpy.cdouble",
    "numpy.clongdouble",
]


def is_local_html_file(url: str) -> bool:
    """Check if a URL points to a local HTML file."""
    try:
        parsed_url = urlparse(unquote(url))

        if parsed_url.scheme not in ("file",):
            return False

        path = parsed_url.path or parsed_url.netloc

        ext = Path(path).suffix.lower()
        return ext in (".html", ".htm")

    except Exception:
        return False


_debounce_semaphore = threading.Semaphore(10)


def debounce(interval_s: int, keyed_by: Optional[str] = None):
    """
    Debounce calls to a function until `interval_s` seconds have passed.

    Adapted from https://github.com/python-lsp/python-lsp-server.
    """

    def wrapper(func: Callable):
        timers: Dict[Any, threading.Timer] = {}

        lock = threading.Lock()

        @functools.wraps(func)
        def debounced(*args, **kwargs) -> None:
            _debounce_semaphore.acquire()

            sig = inspect.signature(func)
            call_args = sig.bind(*args, **kwargs)
            key = call_args.arguments[keyed_by] if keyed_by else None

            def run() -> None:
                try:
                    with lock:
                        del timers[key]
                    func(*args, **kwargs)
                finally:
                    _debounce_semaphore.release()

            with lock:
                old_timer = timers.get(key)
                if old_timer:
                    old_timer.cancel()
                    _debounce_semaphore.release()

                timer = threading.Timer(debounced.interval_s, run)
                timers[key] = timer
                timer.start()

        debounced.interval_s = interval_s

        debounced.timers = timers

        return debounced

    return wrapper


def with_logging(func: Callable):
    """Decorator to log the execution of a function."""
    name = get_qualname(func)

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger.debug(f"Calling {name} with args: {args}, kwargs: {kwargs}")
        result = func(*args, **kwargs)
        logger.debug(f"{name} returned: {result}")
        return result

    return wrapper

