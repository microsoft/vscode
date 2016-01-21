from jedi._compatibility import encoding, is_py3, u
import inspect
import os
import time

try:
    if os.name == 'nt':
        # does not work on Windows, as pyreadline and colorama interfere
        raise ImportError
    else:
        # Use colorama for nicer console output.
        from colorama import Fore, init
        from colorama import initialise
        # pytest resets the stream at the end - causes troubles. Since after
        # every output the stream is reset automatically we don't need this.
        initialise.atexit_done = True
        init()
except ImportError:
    class Fore(object):
        RED = ''
        GREEN = ''
        YELLOW = ''
        RESET = ''

NOTICE = object()
WARNING = object()
SPEED = object()

enable_speed = False
enable_warning = False
enable_notice = False

# callback, interface: level, str
debug_function = None
ignored_modules = ['jedi.evaluate.builtin', 'jedi.parser']
_debug_indent = -1
_start_time = time.time()


def reset_time():
    global _start_time, _debug_indent
    _start_time = time.time()
    _debug_indent = -1


def increase_indent(func):
    """Decorator for makin """
    def wrapper(*args, **kwargs):
        global _debug_indent
        _debug_indent += 1
        try:
            result = func(*args, **kwargs)
        finally:
            _debug_indent -= 1
        return result
    return wrapper


def dbg(message, *args):
    """ Looks at the stack, to see if a debug message should be printed. """
    if debug_function and enable_notice:
        frm = inspect.stack()[1]
        mod = inspect.getmodule(frm[0])
        if not (mod.__name__ in ignored_modules):
            i = ' ' * _debug_indent
            debug_function(NOTICE, i + 'dbg: ' + message % tuple(u(repr(a)) for a in args))


def warning(message, *args):
    if debug_function and enable_warning:
        i = ' ' * _debug_indent
        debug_function(WARNING, i + 'warning: ' + message % tuple(u(repr(a)) for a in args))


def speed(name):
    if debug_function and enable_speed:
        now = time.time()
        i = ' ' * _debug_indent
        debug_function(SPEED, i + 'speed: ' + '%s %s' % (name, now - _start_time))


def print_to_stdout(level, str_out):
    """ The default debug function """
    if level == NOTICE:
        col = Fore.GREEN
    elif level == WARNING:
        col = Fore.RED
    else:
        col = Fore.YELLOW
    if not is_py3:
        str_out = str_out.encode(encoding, 'replace')
    print(col + str_out + Fore.RESET)


# debug_function = print_to_stdout
