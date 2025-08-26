import os
import time
from contextlib import contextmanager
from typing import Callable, Optional

_inited = False


def _lazy_colorama_init():
    """
    Lazily init colorama if necessary, not to screw up stdout if debugging is
    not enabled.

    This version of the function does nothing.
    """


try:
    if os.name == 'nt':
        # Does not work on Windows, as pyreadline and colorama interfere
        raise ImportError
    else:
        # Use colorama for nicer console output.
        from colorama import Fore, init  # type: ignore[import]
        from colorama import initialise

        def _lazy_colorama_init():  # noqa: F811
            """
            Lazily init colorama if necessary, not to screw up stdout is
            debug not enabled.

            This version of the function does init colorama.
            """
            global _inited
            if not _inited:
                # pytest resets the stream at the end - causes troubles. Since
                # after every output the stream is reset automatically we don't
                # need this.
                initialise.atexit_done = True
                try:
                    init(strip=False)
                except Exception:
                    # Colorama fails with initializing under vim and is buggy in
                    # version 0.3.6.
                    pass
            _inited = True

except ImportError:
    class Fore:  # type: ignore[no-redef]
        RED = ''
        GREEN = ''
        YELLOW = ''
        MAGENTA = ''
        RESET = ''
        BLUE = ''

NOTICE = object()
WARNING = object()
SPEED = object()

enable_speed = False
enable_warning = False
enable_notice = False

# callback, interface: level, str
debug_function: Optional[Callable[[str, str], None]] = None
_debug_indent = 0
_start_time = time.time()


def reset_time():
    global _start_time, _debug_indent
    _start_time = time.time()
    _debug_indent = 0


def increase_indent(func):
    """Decorator for makin """
    def wrapper(*args, **kwargs):
        with increase_indent_cm():
            return func(*args, **kwargs)
    return wrapper


@contextmanager
def increase_indent_cm(title=None, color='MAGENTA'):
    global _debug_indent
    if title:
        dbg('Start: ' + title, color=color)
    _debug_indent += 1
    try:
        yield
    finally:
        _debug_indent -= 1
        if title:
            dbg('End: ' + title, color=color)


def dbg(message, *args, color='GREEN'):
    """ Looks at the stack, to see if a debug message should be printed. """
    assert color

    if debug_function and enable_notice:
        i = ' ' * _debug_indent
        _lazy_colorama_init()
        debug_function(color, i + 'dbg: ' + message % tuple(repr(a) for a in args))


def warning(message, *args, format=True):
    if debug_function and enable_warning:
        i = ' ' * _debug_indent
        if format:
            message = message % tuple(repr(a) for a in args)
        debug_function('RED', i + 'warning: ' + message)


def speed(name):
    if debug_function and enable_speed:
        now = time.time()
        i = ' ' * _debug_indent
        debug_function('YELLOW', i + 'speed: ' + '%s %s' % (name, now - _start_time))


def print_to_stdout(color, str_out):
    """
    The default debug function that prints to standard out.

    :param str color: A string that is an attribute of ``colorama.Fore``.
    """
    col = getattr(Fore, color)
    _lazy_colorama_init()
    print(col + str_out + Fore.RESET)
