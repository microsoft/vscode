# Python Tools for Visual Studio
# Copyright(c) Microsoft Corporation
# All rights reserved.
# 
# Licensed under the Apache License, Version 2.0 (the License); you may not use
# this file except in compliance with the License. You may obtain a copy of the
# License at http://www.apache.org/licenses/LICENSE-2.0
# 
# THIS CODE IS PROVIDED ON AN  *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS
# OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY
# IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
# MERCHANTABLITY OR NON-INFRINGEMENT.
# 
# See the Apache Version 2.0 License for specific language governing
# permissions and limitations under the License.

from __future__ import with_statement

__author__ = "Microsoft Corporation <ptvshelp@microsoft.com>"
__version__ = "3.0.0.0"

# This module MUST NOT import threading in global scope. This is because in a direct (non-ptvsd)
# attach scenario, it is loaded on the injected debugger attach thread, and if threading module
# hasn't been loaded already, it will assume that the thread on which it is being loaded is the
# main thread. This will cause issues when the thread goes away after attach completes.
_threading = None

import sys
import ctypes
try:
    import thread
except ImportError:
    import _thread as thread
import socket
import struct
import weakref
import traceback
import types
import bisect
from os import path
import ntpath
import runpy
import datetime
from codecs import BOM_UTF8

try:
    # In the local attach scenario, visualstudio_py_util is injected into globals()
    # by PyDebugAttach before loading this module, and cannot be imported.
    _vspu = visualstudio_py_util
except:
    try:
        import visualstudio_py_util as _vspu
    except ImportError:
        import ptvsd.visualstudio_py_util as _vspu

to_bytes = _vspu.to_bytes
exec_file = _vspu.exec_file
exec_module = _vspu.exec_module
exec_code = _vspu.exec_code
read_bytes = _vspu.read_bytes
read_int = _vspu.read_int
read_string = _vspu.read_string
write_bytes = _vspu.write_bytes
write_int = _vspu.write_int
write_string = _vspu.write_string
safe_repr = _vspu.SafeRepr()

try:
    # In the local attach scenario, visualstudio_py_repl is injected into globals()
    # by PyDebugAttach before loading this module, and cannot be imported.
    _vspr = visualstudio_py_repl
except:
    try:
        import visualstudio_py_repl as _vspr
    except ImportError:
        import ptvsd.visualstudio_py_repl as _vspr

try:
    import stackless
except ImportError:
    stackless = None

try:
    xrange
except:
    xrange = range

if sys.platform == 'cli':
    import clr
    from System.Runtime.CompilerServices import ConditionalWeakTable
    IPY_SEEN_MODULES = ConditionalWeakTable[object, object]()

# Import encodings early to avoid import on the debugger thread, which may cause deadlock
from encodings import utf_8

# WARNING: Avoid imports beyond this point, specifically on the debugger thread, as this may cause
# deadlock where the debugger thread performs an import while a user thread has the import lock

# save start_new_thread so we can call it later, we'll intercept others calls to it.

debugger_dll_handle = None
DETACHED = True
def thread_creator(func, args, kwargs = {}, *extra_args):
    if not isinstance(args, tuple):
        # args is not a tuple. This may be because we have become bound to a
        # class, which has offset our arguments by one.
        if isinstance(kwargs, tuple):
            func, args = args, kwargs
            kwargs = extra_args[0] if len(extra_args) > 0 else {}

    return _start_new_thread(new_thread_wrapper, (func, args, kwargs))

_start_new_thread = thread.start_new_thread
THREADS = {}
THREADS_LOCK = thread.allocate_lock()
MODULES = []

BREAK_ON_SYSTEMEXIT_ZERO = False
DEBUG_STDLIB = False
DJANGO_DEBUG = False

# Py3k compat - alias unicode to str
try:
    unicode
except:
    unicode = str

# A value of a synthesized child. The string is passed through to the variable list, and type is not displayed at all.
class SynthesizedValue(object):
    def __init__(self, repr_value='', len_value=None):
        self.repr_value = repr_value
        self.len_value = len_value
    def __repr__(self):
        return self.repr_value
    def __len__(self):
        return self.len_value

# Specifies list of files not to debug. Can be extended by other modules
# (the REPL does this for $attach support and not stepping into the REPL).
DONT_DEBUG = [path.normcase(__file__), path.normcase(_vspu.__file__)]
if sys.version_info >= (3, 3):
    DONT_DEBUG.append(path.normcase('<frozen importlib._bootstrap>'))
if sys.version_info >= (3, 5):
    DONT_DEBUG.append(path.normcase('<frozen importlib._bootstrap_external>'))

# Contains information about all breakpoints in the process. Keys are line numbers on which
# there are breakpoints in any file, and values are dicts. For every line number, the
# corresponding dict contains all the breakpoints that fall on that line. The keys in that
# dict are tuples of the form (filename, breakpoint_id), each entry representing a single
# breakpoint, and values are BreakpointInfo objects.
#
# For example, given the following breakpoints:
#
#   1. In 'main.py' at line 10.
#   2. In 'main.py' at line 20.
#   3. In 'module.py' at line 10.
#
# the contents of BREAKPOINTS would be:
# {10: {('main.py', 1): ..., ('module.py', 3): ...}, 20: {('main.py', 2): ... }}
BREAKPOINTS = {}

# Contains information about all pending (i.e. not yet bound) breakpoints in the process.
# Elements are BreakpointInfo objects.
PENDING_BREAKPOINTS = set()

# Must be in sync with enum PythonBreakpointConditionKind in PythonBreakpoint.cs
BREAKPOINT_CONDITION_ALWAYS = 0
BREAKPOINT_CONDITION_WHEN_TRUE = 1
BREAKPOINT_CONDITION_WHEN_CHANGED = 2

# Must be in sync with enum PythonBreakpointPassCountKind in PythonBreakpoint.cs
BREAKPOINT_PASS_COUNT_ALWAYS = 0
BREAKPOINT_PASS_COUNT_EVERY = 1
BREAKPOINT_PASS_COUNT_WHEN_EQUAL = 2
BREAKPOINT_PASS_COUNT_WHEN_EQUAL_OR_GREATER = 3

class BreakpointInfo(object):
    __slots__ = [
        'breakpoint_id', 'filename', 'lineno', 'condition_kind', 'condition',
        'pass_count_kind', 'pass_count', 'is_bound', 'last_condition_value',
        'hit_count'
    ]

    # For "when changed" breakpoints, this is used as the initial value of last_condition_value,
    # such that it is guaranteed to not compare equal to any other value that it will get later.
    _DUMMY_LAST_VALUE = object()

    def __init__(self, breakpoint_id, filename, lineno, condition_kind, condition, pass_count_kind, pass_count):
        self.breakpoint_id = breakpoint_id
        self.filename = filename
        self.lineno = lineno
        self.condition_kind = condition_kind
        self.condition = condition
        self.pass_count_kind = pass_count_kind
        self.pass_count = pass_count
        self.is_bound = False
        self.last_condition_value = BreakpointInfo._DUMMY_LAST_VALUE
        self.hit_count = 0

    @staticmethod
    def find_by_id(breakpoint_id):
        for line, bp_dict in BREAKPOINTS.items():
            for (filename, bp_id), bp in bp_dict.items():
                if bp_id == breakpoint_id:
                    return bp
        return None

# lock for calling .send on the socket
send_lock = thread.allocate_lock()

class _SendLockContextManager(object):
    """context manager for send lock.  Handles both acquiring/releasing the 
       send lock as well as detaching the debugger if the remote process 
       is disconnected"""

    def __enter__(self):
        # mark that we're about to do socket I/O so we won't deliver
        # debug events when we're debugging the standard library
        cur_thread = get_thread_from_id(thread.get_ident())
        if cur_thread is not None:
            cur_thread.is_sending = True

        send_lock.acquire()

    def __exit__(self, exc_type, exc_value, tb):
        send_lock.release()
        
        # start sending debug events again
        cur_thread = get_thread_from_id(thread.get_ident())
        if cur_thread is not None:
            cur_thread.is_sending = False

        if exc_type is not None:
            detach_threads()
            detach_process()
            # swallow the exception, we're no longer debugging
            return True 
       
_SendLockCtx = _SendLockContextManager()

SEND_BREAK_COMPLETE = False

STEPPING_OUT = -1  # first value, we decrement below this
STEPPING_NONE = 0
STEPPING_BREAK = 1
STEPPING_LAUNCH_BREAK = 2
STEPPING_ATTACH_BREAK = 3
STEPPING_INTO = 4
STEPPING_OVER = 5     # last value, we increment past this.

USER_STEPPING = (STEPPING_OUT, STEPPING_INTO, STEPPING_OVER)

FRAME_KIND_NONE = 0
FRAME_KIND_PYTHON = 1
FRAME_KIND_DJANGO = 2

DJANGO_BUILTINS = {'True': True, 'False': False, 'None': None}

PYTHON_EVALUATION_RESULT_REPR_KIND_NORMAL = 0    # regular repr and hex repr (if applicable) for the evaluation result; length is len(result)
PYTHON_EVALUATION_RESULT_REPR_KIND_RAW = 1       # repr is raw representation of the value - see TYPES_WITH_RAW_REPR; length is len(repr)
PYTHON_EVALUATION_RESULT_REPR_KIND_RAWLEN = 2    # same as above, but only the length is reported, not the actual value

PYTHON_EVALUATION_RESULT_EXPANDABLE = 1
PYTHON_EVALUATION_RESULT_METHOD_CALL = 2
PYTHON_EVALUATION_RESULT_SIDE_EFFECTS = 4
PYTHON_EVALUATION_RESULT_RAW = 8
PYTHON_EVALUATION_RESULT_HAS_RAW_REPR = 16

# Don't show attributes of these types if they come from the class (assume they are methods).
METHOD_TYPES = (
    types.FunctionType,
    types.MethodType,
    types.BuiltinFunctionType,
    type("".__repr__), # method-wrapper
)

# repr() for these types can be used as input for eval() to get the original value.
# float is intentionally not included because it is not always round-trippable (e.g inf, nan).
TYPES_WITH_ROUND_TRIPPING_REPR = set((type(None), int, bool, str, unicode))
if sys.version[0] == '3':
    TYPES_WITH_ROUND_TRIPPING_REPR.add(bytes)
else:
    TYPES_WITH_ROUND_TRIPPING_REPR.add(long)

# repr() for these types can be used as input for eval() to get the original value, provided that the same is true for all their elements.
COLLECTION_TYPES_WITH_ROUND_TRIPPING_REPR = set((tuple, list, set, frozenset))

# eval(repr(x)), but optimized for common types for which it is known that result == x.
def eval_repr(x):
    def is_repr_round_tripping(x):
        # Do exact type checks here - subclasses can override __repr__.
        if type(x) in TYPES_WITH_ROUND_TRIPPING_REPR:
            return True
        elif type(x) in COLLECTION_TYPES_WITH_ROUND_TRIPPING_REPR:
            # All standard sequence types are round-trippable if their elements are.
            return all((is_repr_round_tripping(item) for item in x))
        else:
            return False
    if is_repr_round_tripping(x):
        return x
    else:
        return eval(repr(x), {})

# key is type, value is function producing the raw repr
TYPES_WITH_RAW_REPR = {
    unicode: (lambda s: s)
}

# bytearray is 2.6+
try:
    # getfilesystemencoding is used here because it effectively corresponds to the notion of "locale encoding":
    # current ANSI codepage on Windows, LC_CTYPE on Linux, UTF-8 on OS X - which is exactly what we want.
    TYPES_WITH_RAW_REPR[bytearray] = lambda b: b.decode(sys.getfilesystemencoding(), 'ignore') 
except:
    pass

if sys.version[0] == '3':
    TYPES_WITH_RAW_REPR[bytes] = TYPES_WITH_RAW_REPR[bytearray]
else:
    TYPES_WITH_RAW_REPR[str] = TYPES_WITH_RAW_REPR[unicode]

if sys.version[0] == '3':
  # work around a crashing bug on CPython 3.x where they take a hard stack overflow
  # we'll never see this exception but it'll allow us to keep our try/except handler
  # the same across all versions of Python
    class StackOverflowException(Exception): pass
else:
    StackOverflowException = RuntimeError
  
ASBR = to_bytes('ASBR')
SETL = to_bytes('SETL')
THRF = to_bytes('THRF')
DETC = to_bytes('DETC')
NEWT = to_bytes('NEWT')
EXTT = to_bytes('EXTT')
EXIT = to_bytes('EXIT')
EXCP = to_bytes('EXCP')
MODL = to_bytes('MODL')
STPD = to_bytes('STPD')
BRKS = to_bytes('BRKS')
BRKF = to_bytes('BRKF')
BRKH = to_bytes('BRKH')
BRKC = to_bytes('BRKC')
BKHC = to_bytes('BKHC')
LOAD = to_bytes('LOAD')
EXCE = to_bytes('EXCE')
EXCR = to_bytes('EXCR')
CHLD = to_bytes('CHLD')
OUTP = to_bytes('OUTP')
REQH = to_bytes('REQH')
LAST = to_bytes('LAST')

def get_thread_from_id(id):
    THREADS_LOCK.acquire()
    try:
        return THREADS.get(id)
    finally:
        THREADS_LOCK.release()

def should_send_frame(frame):
    return (frame is not None and
            frame.f_code not in DEBUG_ENTRYPOINTS and
            path.normcase(frame.f_code.co_filename) not in DONT_DEBUG)

KNOWN_DIRECTORIES = set((None, ''))
KNOWN_ZIPS = set()

def is_file_in_zip(filename):
    parent, name = path.split(path.abspath(filename))
    if parent in KNOWN_DIRECTORIES:
        return False
    elif parent in KNOWN_ZIPS:
        return True
    elif path.isdir(parent):
        KNOWN_DIRECTORIES.add(parent)
        return False
    else:
        KNOWN_ZIPS.add(parent)
        return True

def lookup_builtin(name, frame):
    try:
        return frame.f_builtins.get(bits)
    except:
        # http://ironpython.codeplex.com/workitem/30908
        builtins = frame.f_globals['__builtins__']
        if not isinstance(builtins, dict):
            builtins = builtins.__dict__
        return builtins.get(name)

def lookup_local(frame, name):
    bits = name.split('.')
    obj = frame.f_locals.get(bits[0]) or frame.f_globals.get(bits[0]) or lookup_builtin(bits[0], frame)
    bits.pop(0)
    while bits and obj is not None and type(obj) is types.ModuleType:
        obj = getattr(obj, bits.pop(0), None)
    return obj
        
if sys.version_info[0] >= 3:
    _EXCEPTIONS_MODULE = 'builtins'
else:
    _EXCEPTIONS_MODULE = 'exceptions'

def get_exception_name(exc_type):
    if exc_type.__module__ == _EXCEPTIONS_MODULE:
        return exc_type.__name__
    else:
        return exc_type.__module__ + '.' + exc_type.__name__

# These constants come from Visual Studio - enum_EXCEPTION_STATE
BREAK_MODE_NEVER = 0
BREAK_MODE_ALWAYS = 1
BREAK_MODE_UNHANDLED = 32

BREAK_TYPE_NONE = 0
BREAK_TYPE_UNHANDLED = 1
BREAK_TYPE_HANDLED = 2

class ExceptionBreakInfo(object):
    BUILT_IN_HANDLERS = {
        path.normcase('<frozen importlib._bootstrap>'): ((None, None, '*'),),
        path.normcase('build\\bdist.win32\\egg\\pkg_resources.py'): ((None, None, '*'),),
        path.normcase('build\\bdist.win-amd64\\egg\\pkg_resources.py'): ((None, None, '*'),),
    }

    def __init__(self):
        self.default_mode = BREAK_MODE_UNHANDLED
        self.break_on = { }
        self.handler_cache = dict(self.BUILT_IN_HANDLERS)
        self.handler_lock = thread.allocate_lock()
        self.add_exception('exceptions.IndexError', BREAK_MODE_NEVER)
        self.add_exception('builtins.IndexError', BREAK_MODE_NEVER)
        self.add_exception('exceptions.KeyError', BREAK_MODE_NEVER)
        self.add_exception('builtins.KeyError', BREAK_MODE_NEVER)
        self.add_exception('exceptions.AttributeError', BREAK_MODE_NEVER)
        self.add_exception('builtins.AttributeError', BREAK_MODE_NEVER)
        self.add_exception('exceptions.StopIteration', BREAK_MODE_NEVER)
        self.add_exception('builtins.StopIteration', BREAK_MODE_NEVER)
        self.add_exception('exceptions.GeneratorExit', BREAK_MODE_NEVER)
        self.add_exception('builtins.GeneratorExit', BREAK_MODE_NEVER)

    def clear(self):
        self.default_mode = BREAK_MODE_UNHANDLED
        self.break_on.clear()
        self.handler_cache = dict(self.BUILT_IN_HANDLERS)

    def should_break(self, thread, ex_type, ex_value, trace):
        probe_stack()
        name = get_exception_name(ex_type)
        mode = self.break_on.get(name, self.default_mode)
        break_type = BREAK_TYPE_NONE
        if mode & BREAK_MODE_ALWAYS:
            if self.is_handled(thread, ex_type, ex_value, trace):
                break_type = BREAK_TYPE_HANDLED
            else:
                break_type = BREAK_TYPE_UNHANDLED
        elif (mode & BREAK_MODE_UNHANDLED) and not self.is_handled(thread, ex_type, ex_value, trace):
            break_type = BREAK_TYPE_UNHANDLED

        if break_type:
            if issubclass(ex_type, SystemExit):
                if not BREAK_ON_SYSTEMEXIT_ZERO:
                    if not ex_value or (isinstance(ex_value, SystemExit) and not ex_value.code):
                        break_type = BREAK_TYPE_NONE

        return break_type
    
    def is_handled(self, thread, ex_type, ex_value, trace):
        if trace is None:
            # get out if we didn't get a traceback
            return False

        if trace.tb_next is not None:
          if should_send_frame(trace.tb_next.tb_frame) and should_debug_code(trace.tb_next.tb_frame.f_code):
            # don't break if this is not the top of the traceback,
            # unless the previous frame was not debuggable
            return True
            
        cur_frame = trace.tb_frame
        
        while should_send_frame(cur_frame) and cur_frame.f_code is not None and cur_frame.f_code.co_filename is not None:
            filename = path.normcase(cur_frame.f_code.co_filename)
            if is_file_in_zip(filename):
                # File is in a zip, so assume it handles exceptions
                return True

            if not is_same_py_file(filename, __file__):
                handlers = self.handler_cache.get(filename)
            
                if handlers is None:
                    # req handlers for this file from the debug engine
                    self.handler_lock.acquire()
                
                    with _SendLockCtx:
                        write_bytes(conn, REQH)
                        write_string(conn, filename)

                    # wait for the handler data to be received
                    self.handler_lock.acquire()
                    self.handler_lock.release()

                    handlers = self.handler_cache.get(filename)

                if handlers is None:
                    # no code available, so assume unhandled
                    return False

                line = cur_frame.f_lineno
                for line_start, line_end, expressions in handlers:
                    if line_start is None or line_start <= line < line_end:
                        if '*' in expressions:
                            return True

                        for text in expressions:
                            try:
                                res = lookup_local(cur_frame, text)
                                if res is not None and issubclass(ex_type, res):
                                    return True
                            except:
                                pass

            cur_frame = cur_frame.f_back

        return False
    
    def add_exception(self, name, mode=BREAK_MODE_UNHANDLED):
        if name.startswith(_EXCEPTIONS_MODULE + '.'):
            name = name[len(_EXCEPTIONS_MODULE) + 1:]
        self.break_on[name] = mode

BREAK_ON = ExceptionBreakInfo()

def probe_stack(depth = 10):
  """helper to make sure we have enough stack space to proceed w/o corrupting 
     debugger state."""
  if depth == 0:
      return
  probe_stack(depth - 1)

PREFIXES = [path.normcase(sys.prefix)]
# If we're running in a virtual env, DEBUG_STDLIB should respect this too.
if hasattr(sys, 'base_prefix'):
    PREFIXES.append(path.normcase(sys.base_prefix))
if hasattr(sys, 'real_prefix'):
    PREFIXES.append(path.normcase(sys.real_prefix))

def should_debug_code(code):
    if not code or not code.co_filename:
        return False

    filename = path.normcase(code.co_filename)
    if not DEBUG_STDLIB:
        for prefix in PREFIXES:
            if prefix != '' and filename.startswith(prefix):
                return False

    for dont_debug_file in DONT_DEBUG:
        if is_same_py_file(filename, dont_debug_file):
            return False

    if is_file_in_zip(filename):
        # file in inside an egg or zip, so we can't debug it
        return False

    return True

attach_lock = thread.allocate()
attach_sent_break = False

local_path_to_vs_path = {}

def breakpoint_path_match(vs_path, local_path):
    vs_path_norm = path.normcase(vs_path)
    local_path_norm = path.normcase(local_path)
    if local_path_to_vs_path.get(local_path_norm) == vs_path_norm:
        return True
    
    # Walk the local filesystem from local_path up, matching agains win_path component by component,
    # and stop when we no longer see an __init__.py. This should give a reasonably close approximation
    # of matching the package name.
    while True:
        local_path, local_name = path.split(local_path)
        vs_path, vs_name = ntpath.split(vs_path)
        # Match the last component in the path. If one or both components are unavailable, then
        # we have reached the root on the corresponding path without successfully matching.
        if not local_name or not vs_name or path.normcase(local_name) != path.normcase(vs_name):
            return False
        # If we have an __init__.py, this module was inside the package, and we still need to match
        # thatpackage, so walk up one level and keep matching. Otherwise, we've walked as far as we
        # needed to, and matched all names on our way, so this is a match.
        if not path.exists(path.join(local_path, '__init__.py')):
            break
    
    local_path_to_vs_path[local_path_norm] = vs_path_norm
    return True

def update_all_thread_stacks(blocking_thread = None, check_is_blocked = True):
    THREADS_LOCK.acquire()
    all_threads = list(THREADS.values())
    THREADS_LOCK.release()
    
    for cur_thread in all_threads:
        if cur_thread is blocking_thread:
            continue
            
        cur_thread._block_starting_lock.acquire()
        if not check_is_blocked or not cur_thread._is_blocked:
            # release the lock, we're going to run user code to evaluate the frames
            cur_thread._block_starting_lock.release()        
                            
            frames = cur_thread.get_frame_list()
    
            # re-acquire the lock and make sure we're still not blocked.  If so send
            # the frame list.
            cur_thread._block_starting_lock.acquire()
            if not check_is_blocked or not cur_thread._is_blocked:
                cur_thread.send_frame_list(frames)
    
        cur_thread._block_starting_lock.release()
        
DJANGO_BREAKPOINTS = {}

class DjangoBreakpointInfo(object):
    def __init__(self, filename):
        self._line_locations = None
        self.filename = filename
        self.breakpoints = {}
    
    def add_breakpoint(self, lineno, brkpt_id):
        self.breakpoints[lineno] = brkpt_id

    def remove_breakpoint(self, lineno):
        del self.breakpoints[lineno]
    
    @property
    def line_locations(self):
        if self._line_locations is None:
            # we need to calculate our line number offset information
            try:
                contents = open(self.filename, 'rb')
            except:
                # file not available, locked, etc...
                pass
            else:
                with contents:
                    line_info = []
                    file_len = 0
                    for line in contents:
                        line_len = len(line)
                        if not line_info and line.startswith(BOM_UTF8):
                            line_len -= len(BOM_UTF8) # Strip the BOM, Django seems to ignore this...
                        if line.endswith(to_bytes('\r\n')):
                            line_len -= 1 # Django normalizes newlines to \n
                        file_len += line_len
                        line_info.append(file_len)
                    contents.close()
                    self._line_locations = line_info

        return self._line_locations

    def get_line_range(self, start, end):
        line_locs = self.line_locations 
        if line_locs is not None:
            low_line = bisect.bisect_right(line_locs, start)
            hi_line = bisect.bisect_right(line_locs, end)

            return low_line, hi_line

        return (None, None)

    def should_break(self, start, end):
        low_line, hi_line = self.get_line_range(start, end)
        if low_line is not None and hi_line is not None:
            # low_line/hi_line is 0 based, self.breakpoints is 1 based
            for i in xrange(low_line+1, hi_line+2): 
                bkpt_id = self.breakpoints.get(i)
                if bkpt_id  is not None:
                    return True, bkpt_id 

        return False, 0

def get_django_frame_source(frame):
    if frame.f_code.co_name == 'render':
        self_obj = frame.f_locals.get('self', None)
        if self_obj is None:
            return None
        name = type(self_obj).__name__
        if name in ('Template', 'TextNode'):
            return None
        source_obj = getattr(self_obj, 'source', None)
        if source_obj and hasattr(source_obj, '__len__') and len(source_obj) == 2:
            return str(source_obj[0]), source_obj[1]

        token_obj = getattr(self_obj, 'token', None)
        if token_obj is None:
            return None
        template_obj = getattr(frame.f_locals.get('context', None), 'template', None)
        if template_obj is None:
            return None
        template_name = getattr(template_obj, 'origin', None)
        position = getattr(token_obj, 'position', None)
        if template_name and position:
            return str(template_name), position


    return None

class ModuleExitFrame(object):
    def __init__(self, real_frame):
        self.real_frame = real_frame
        self.f_lineno = real_frame.f_lineno + 1

    def __getattr__(self, name):
        return getattr(self.real_frame, name)

class Thread(object):
    def __init__(self, id = None):
        if id is not None:
            self.id = id 
        else:
            self.id = thread.get_ident()
        self._events = {'call' : self.handle_call, 
                        'line' : self.handle_line, 
                        'return' : self.handle_return, 
                        'exception' : self.handle_exception,
                        'c_call' : self.handle_c_call,
                        'c_return' : self.handle_c_return,
                        'c_exception' : self.handle_c_exception,
                       }
        self.cur_frame = None
        self.stepping = STEPPING_NONE
        self.unblock_work = None
        self._block_lock = thread.allocate_lock()
        self._block_lock.acquire()
        self._block_starting_lock = thread.allocate_lock()
        self._is_blocked = False
        self._is_working = False
        self.stopped_on_line = None
        self.detach = False
        self.trace_func = self.trace_func # replace self.trace_func w/ a bound method so we don't need to re-create these regularly
        self.prev_trace_func = None
        self.trace_func_stack = []
        self.reported_process_loaded = False
        self.django_stepping = None
        self.is_sending = False

        # stackless changes
        if stackless is not None:
            self._stackless_attach()

        if sys.platform == 'cli':
            self.frames = []

    if sys.platform == 'cli':
        # workaround an IronPython bug where we're sometimes missing the back frames
        # http://ironpython.codeplex.com/workitem/31437
        def push_frame(self, frame):
            self.cur_frame = frame
            self.frames.append(frame)

        def pop_frame(self):
            self.frames.pop()
            self.cur_frame = self.frames[-1]
    else:
        def push_frame(self, frame):
            self.cur_frame = frame

        def pop_frame(self):
            self.cur_frame = self.cur_frame.f_back

    def _stackless_attach(self):
        try:
            stackless.tasklet.trace_function
        except AttributeError:
            # the tasklets need to be traced on a case by case basis
            # sys.trace needs to be called within their calling context
            def __call__(tsk, *args, **kwargs):
                f = tsk.tempval
                def new_f(old_f, args, kwargs):
                    sys.settrace(self.trace_func)
                    try:
                        if old_f is not None:
                            return old_f(*args, **kwargs)
                    finally:
                        sys.settrace(None)

                tsk.tempval = new_f
                stackless.tasklet.setup(tsk, f, args, kwargs)
                return tsk
    
            def settrace(tsk, tb):
                if hasattr(tsk.frame, "f_trace"):
                    tsk.frame.f_trace = tb
                sys.settrace(tb)

            self.__oldstacklesscall__ = stackless.tasklet.__call__
            stackless.tasklet.settrace = settrace
            stackless.tasklet.__call__ = __call__
        if sys.platform == 'cli':
            self.frames = []
    
    if sys.platform == 'cli':
        # workaround an IronPython bug where we're sometimes missing the back frames
        # http://ironpython.codeplex.com/workitem/31437
        def push_frame(self, frame):
            self.cur_frame = frame
            self.frames.append(frame)
    
        def pop_frame(self):
            self.frames.pop()
            self.cur_frame = self.frames[-1]
    else:
        def push_frame(self, frame):
            self.cur_frame = frame

        def pop_frame(self):
            self.cur_frame = self.cur_frame.f_back

    def context_dispatcher(self, old, new):
        self.stepping = STEPPING_NONE
        # for those tasklets that started before we started tracing
        # we need to make sure that the trace is set by patching
        # it in the context switch
        if old and new:
            if hasattr(new.frame, "f_trace") and not new.frame.f_trace:
                sys.call_tracing(new.settrace,(self.trace_func,))

    def _stackless_schedule_cb(self, prev, next):
        current = stackless.getcurrent()
        if not current:
            return
        current_tf = current.trace_function
        
        try:
            current.trace_function = None
            self.stepping = STEPPING_NONE
            
            # If the current frame has no trace function, we may need to get it
            # from the previous frame, depending on how we ended up in the
            # callback.
            if current_tf is None:
                f_back = current.frame.f_back
                if f_back is not None:
                    current_tf = f_back.f_trace

            if next is not None:
                # Assign our trace function to the current stack
                f = next.frame
                if next is current:
                    f = f.f_back
                while f:
                    if isinstance(f, types.FrameType):
                        f.f_trace = self.trace_func
                    f = f.f_back
                next.trace_function = self.trace_func
        finally:
            current.trace_function = current_tf

    def trace_func(self, frame, event, arg):
        # If we're so far into process shutdown that sys is already gone, just stop tracing.
        if sys is None:
            return None
        elif self.is_sending:
            # https://pytools.codeplex.com/workitem/1864 
            # we're currently doing I/O w/ the socket, we don't want to deliver
            # any breakpoints or async breaks because we'll deadlock.  Continue
            # to return the trace function so all of our frames remain
            # balanced.  A better way to deal with this might be to do
            # sys.settrace(None) when we take the send lock, but that's much
            # more difficult because our send context manager is used both
            # inside and outside of the trace function, and so is used when
            # tracing is enabled and disabled, and so it's very easy to get our
            # current frame tracking to be thrown off...
            return self.trace_func

        try:
            # if should_debug_code(frame.f_code) is not true during attach
            # the current frame is None and a pop_frame will cause an exception and 
            # break the debugger
            if self.cur_frame is None:
                # happens during attach, we need frame for blocking
                self.push_frame(frame)
            if self.stepping == STEPPING_BREAK and should_debug_code(frame.f_code):
                if self.detach:
                    if stackless is not None:
                        stackless.set_schedule_callback(None)
                        stackless.tasklet.__call__ = self.__oldstacklesscall__
                    sys.settrace(None)
                    return None

                self.async_break()

            return self._events[event](frame, arg)
        except (StackOverflowException, KeyboardInterrupt):
            # stack overflow, disable tracing
            return self.trace_func
    
    def handle_call(self, frame, arg):
        self.push_frame(frame)

        if DJANGO_BREAKPOINTS:
            source_obj = get_django_frame_source(frame)
            if source_obj is not None:
                origin, (start, end) = source_obj
                
                active_bps = DJANGO_BREAKPOINTS.get(origin.lower())
                should_break = False
                if active_bps is not None:
                    should_break, bkpt_id = active_bps.should_break(start, end)
                    if should_break:
                        probe_stack()
                        update_all_thread_stacks(self)
                        self.block(lambda: (report_breakpoint_hit(bkpt_id, self.id), mark_all_threads_for_break(skip_thread = self)))
                if not should_break and self.django_stepping:
                    self.django_stepping = None
                    self.stepping = STEPPING_OVER
                    self.block_maybe_attach()

        if frame.f_code.co_name == '<module>' and frame.f_code.co_filename not in ['<string>', '<stdin>']:
            probe_stack()
            code, module = new_module(frame)
            if not DETACHED:
                report_module_load(module)

                # see if this module causes new break points to be bound
                bound = set()
                for pending_bp in PENDING_BREAKPOINTS:
                    if try_bind_break_point(code.co_filename, module, pending_bp):
                        bound.add(pending_bp)
                PENDING_BREAKPOINTS.difference_update(bound)

        stepping = self.stepping
        if stepping is not STEPPING_NONE and should_debug_code(frame.f_code):
            if stepping == STEPPING_INTO:
                # block when we hit the 1st line, not when we're on the function def
                self.stepping = STEPPING_OVER
                # empty stopped_on_line so that we will break even if it is
                # the same line
                self.stopped_on_line = None
            elif stepping >= STEPPING_OVER:
                self.stepping += 1
            elif stepping <= STEPPING_OUT:
                self.stepping -= 1

        if (sys.platform == 'cli' and 
            frame.f_code.co_name == '<module>' and 
            not IPY_SEEN_MODULES.TryGetValue(frame.f_code)[0]):
            IPY_SEEN_MODULES.Add(frame.f_code, None)
            # work around IronPython bug - http://ironpython.codeplex.com/workitem/30127
            self.handle_line(frame, arg)

        # forward call to previous trace function, if any, saving old trace func for when we return
        old_trace_func = self.prev_trace_func
        if old_trace_func is not None:
            self.trace_func_stack.append(old_trace_func)
            self.prev_trace_func = None  # clear first incase old_trace_func stack overflows
            self.prev_trace_func = old_trace_func(frame, 'call', arg)

        return self.trace_func
        
    def should_block_on_frame(self, frame):
        if not should_debug_code(frame.f_code):
            return False
        # It is still possible that we're somewhere in standard library code, but that code was invoked by our
        # internal debugger machinery (e.g. socket.sendall or text encoding while tee'ing print output to VS).
        # We don't want to block on any of that, either, so walk the stack and see if we hit debugger frames
        # at some point below the non-debugger ones.
        while frame is not None:
            # There is usually going to be a debugger frame at the very bottom of the stack - the one that
            # invoked user code on this thread when starting debugging. If we reached that, then everything
            # above is user code, so we know that we do want to block here.
            if frame.f_code in DEBUG_ENTRYPOINTS:
                break
            # Otherwise, check if it's some other debugger code.
            filename = path.normcase(frame.f_code.co_filename)
            is_debugger_frame = False
            for debugger_file in DONT_DEBUG:
                if is_same_py_file(filename, debugger_file):
                    # If it is, then the frames above it on the stack that we have just walked through
                    # were for debugger internal purposes, and we do not want to block here.
                    return False
            frame = frame.f_back
        return True

    def handle_line(self, frame, arg):
        if not DETACHED:
            # resolve whether step_complete and/or handling_breakpoints
            step_complete = False
            handle_breakpoints = True
            stepping = self.stepping
            if stepping is not STEPPING_NONE:   # check for the common case of no stepping first...
                if ((stepping == STEPPING_OVER or stepping == STEPPING_INTO) and frame.f_lineno != self.stopped_on_line):
                    if self.should_block_on_frame(frame):   # don't step complete in our own debugger / non-user code
                        step_complete = True
                elif stepping == STEPPING_LAUNCH_BREAK or stepping == STEPPING_ATTACH_BREAK:
                    # If launching rather than attaching, don't break into initial Python code needed to set things up
                    if stepping == STEPPING_LAUNCH_BREAK and (not MODULES or not self.should_block_on_frame(frame)):
                        handle_breakpoints = False
                    else:
                        step_complete = True

            # handle breakpoints
            hit_bp_id = None
            if BREAKPOINTS and handle_breakpoints:
                bp = BREAKPOINTS.get(frame.f_lineno)
                if bp is not None:
                    for (filename, bp_id), bp in bp.items():
                        if filename != frame.f_code.co_filename:
                            # When the breakpoint is bound, the filename is updated to match co_filename of
                            # the module to which it was bound, so only exact matches are considered hits.
                            if bp.is_bound:
                                continue
                            # Otherwise, use relaxed path check that tries to handle differences between 
                            # local and remote filesystems for remote scenarios:
                            if not breakpoint_path_match(filename, frame.f_code.co_filename):
                                continue

                        # If we got here, filename and line number both match.

                        # Check condition to see if we actually hit this breakpoint.
                        if bp.condition_kind != BREAKPOINT_CONDITION_ALWAYS:
                            try:
                                res = eval(bp.condition, frame.f_globals, frame.f_locals)
                                if bp.condition_kind == BREAKPOINT_CONDITION_WHEN_CHANGED:
                                    last_val = bp.last_condition_value
                                    bp.last_condition_value = res
                                    if last_val == res:
                                        # Condition didn't change, breakpoint not hit.
                                        continue
                                else:
                                    if not res:
                                        # Condition isn't true, breakpoint not hit.
                                        continue
                            except:
                                # If anything goes wrong while evaluating condition, breakpoint is hit.
                                pass

                        # If we got here, then condition matched, and we need to update the hit count
                        # (even if we don't end up signaling the breakpoint because of pass count).
                        bp.hit_count += 1

                        # Check the new hit count against pass count.
                        if bp.pass_count_kind != BREAKPOINT_PASS_COUNT_ALWAYS:
                            pass_count_kind = bp.pass_count_kind
                            pass_count = bp.pass_count
                            hit_count = bp.hit_count
                            if pass_count_kind == BREAKPOINT_PASS_COUNT_EVERY:
                                if (hit_count % pass_count) != 0:
                                    continue
                            elif pass_count_kind == BREAKPOINT_PASS_COUNT_WHEN_EQUAL:
                                if hit_count != pass_count:
                                    continue
                            elif pass_count_kind == BREAKPOINT_PASS_COUNT_WHEN_EQUAL_OR_GREATER:
                                if hit_count < pass_count:
                                    continue

                        # If we got here, then condition and pass count both match, so we should notify VS.
                        hit_bp_id = bp_id

                        # There may be other breakpoints for the same file/line, and we need to update
                        # their hit counts, too, so keep looping. If more than one is hit, it's fine,
                        # we will just signal the last one.

            if hit_bp_id is not None:
                # handle case where both hitting a breakpoint and step complete by reporting the breakpoint
                # if the reported breakpoint is a tracepoint, report the step complete if/when the tracepoint is auto-resumed
                probe_stack()
                update_all_thread_stacks(self)
                self.block(lambda: (report_breakpoint_hit(hit_bp_id, self.id), mark_all_threads_for_break(skip_thread = self)), step_complete)

            elif step_complete:
                self.block_maybe_attach()

        # forward call to previous trace function, if any, updating trace function appropriately
        old_trace_func = self.prev_trace_func
        if old_trace_func is not None:
            self.prev_trace_func = None  # clear first incase old_trace_func stack overflows
            self.prev_trace_func = old_trace_func(frame, 'line', arg)

        return self.trace_func
    
    def handle_return(self, frame, arg):
        self.pop_frame()

        if not DETACHED:
            stepping = self.stepping
            # only update stepping state when this frame is debuggable (matching handle_call)
            if stepping is not STEPPING_NONE and should_debug_code(frame.f_code):
                if stepping > STEPPING_OVER:
                    self.stepping -= 1
                elif stepping < STEPPING_OUT:
                    self.stepping += 1
                elif stepping in USER_STEPPING:
                    if self.cur_frame is None or frame.f_code.co_name == "<module>" :
                        # only return to user code modules
                        if self.should_block_on_frame(frame):
                            # restore back the module frame for the step out of a module
                            self.push_frame(ModuleExitFrame(frame))
                            self.stepping = STEPPING_NONE
                            update_all_thread_stacks(self)
                            self.block(lambda: (report_step_finished(self.id), mark_all_threads_for_break(skip_thread = self)))
                            self.pop_frame()
                    elif self.should_block_on_frame(self.cur_frame):
                        # if we're returning into non-user code then don't block in the
                        # non-user code, wait until we hit user code again
                        self.stepping = STEPPING_NONE
                        update_all_thread_stacks(self)
                        self.block(lambda: (report_step_finished(self.id), mark_all_threads_for_break(skip_thread = self)))

        # forward call to previous trace function, if any
        old_trace_func = self.prev_trace_func
        if old_trace_func is not None:
            old_trace_func(frame, 'return', arg)

        # restore previous frames trace function if there is one
        if self.trace_func_stack:
            self.prev_trace_func = self.trace_func_stack.pop()
        
    def handle_exception(self, frame, arg):
        if self.stepping == STEPPING_ATTACH_BREAK:
            self.block_maybe_attach()

        if not DETACHED and should_debug_code(frame.f_code):
            break_type = BREAK_ON.should_break(self, *arg)
            if break_type:
                update_all_thread_stacks(self)
                self.block(lambda: report_exception(frame, arg, self.id, break_type))

        # forward call to previous trace function, if any, updating the current trace function
        # with a new one if available
        old_trace_func = self.prev_trace_func
        if old_trace_func is not None:
            self.prev_trace_func = old_trace_func(frame, 'exception', arg)

        return self.trace_func
        
    def handle_c_call(self, frame, arg):
        # break points?
        pass
        
    def handle_c_return(self, frame, arg):
        # step out of ?
        pass
        
    def handle_c_exception(self, frame, arg):
        pass

    def block_maybe_attach(self):
        will_block_now = True
        if self.stepping == STEPPING_ATTACH_BREAK:
            # only one thread should send the attach break in
            attach_lock.acquire()
            global attach_sent_break
            if attach_sent_break:
                will_block_now = False
            attach_sent_break = True
            attach_lock.release()
    
        probe_stack()
        stepping = self.stepping
        self.stepping = STEPPING_NONE
        def block_cond():
            if will_block_now:
                if stepping == STEPPING_OVER or stepping == STEPPING_INTO:
                    report_step_finished(self.id)
                    return mark_all_threads_for_break(skip_thread = self)
                else:
                    if not DETACHED:
                        if stepping == STEPPING_ATTACH_BREAK:
                            self.reported_process_loaded = True
                        return report_process_loaded(self.id)
        update_all_thread_stacks(self)
        self.block(block_cond)
    
    def async_break(self):
        def async_break_send():
            with _SendLockCtx:
                sent_break_complete = False
                global SEND_BREAK_COMPLETE
                if SEND_BREAK_COMPLETE == True or SEND_BREAK_COMPLETE == self.id:
                    # multiple threads could be sending this...
                    SEND_BREAK_COMPLETE = False
                    sent_break_complete = True
                    write_bytes(conn, ASBR)
                    write_int(conn, self.id)

            if sent_break_complete:
                # if we have threads which have not broken yet capture their frame list and 
                # send it now.  If they block we'll send an updated (and possibly more accurate - if
                # there are any thread locals) list of frames.
                update_all_thread_stacks(self)

        self.stepping = STEPPING_NONE
        self.block(async_break_send)

    def block(self, block_lambda, keep_stopped_on_line = False):
        """blocks the current thread until the debugger resumes it"""
        assert not self._is_blocked
        #assert self.id == thread.get_ident(), 'wrong thread identity' + str(self.id) + ' ' + str(thread.get_ident())    # we should only ever block ourselves
        
        # send thread frames before we block
        self.enum_thread_frames_locally()
        
        if not keep_stopped_on_line:
            self.stopped_on_line = self.cur_frame.f_lineno

        # need to synchronize w/ sending the reason we're blocking
        self._block_starting_lock.acquire()
        self._is_blocked = True
        block_lambda()
        self._block_starting_lock.release()

        while not DETACHED:
            self._block_lock.acquire()
            if self.unblock_work is None:
                break

            # the debugger wants us to do something, do it, and then block again
            self._is_working = True
            self.unblock_work()
            self.unblock_work = None
            self._is_working = False
                
        self._block_starting_lock.acquire()
        assert self._is_blocked
        self._is_blocked = False
        self._block_starting_lock.release()

    def unblock(self):
        """unblocks the current thread allowing it to continue to run"""
        assert self._is_blocked 
        assert self.id != thread.get_ident()    # only someone else should unblock us
        
        self._block_lock.release()

    def schedule_work(self, work):
        self.unblock_work = work
        self.unblock()

    def run_on_thread(self, text, cur_frame, execution_id, frame_kind, repr_kind = PYTHON_EVALUATION_RESULT_REPR_KIND_NORMAL):
        self._block_starting_lock.acquire()
        
        if not self._is_blocked:
            report_execution_error('<expression cannot be evaluated at this time>', execution_id)
        elif not self._is_working:
            self.schedule_work(lambda : self.run_locally(text, cur_frame, execution_id, frame_kind, repr_kind))
        else:
            report_execution_error('<error: previous evaluation has not completed>', execution_id)
        
        self._block_starting_lock.release()

    def run_on_thread_no_report(self, text, cur_frame, frame_kind):
        self._block_starting_lock.acquire()
        
        if not self._is_blocked:
            pass
        elif not self._is_working:
            self.schedule_work(lambda : self.run_locally_no_report(text, cur_frame, frame_kind))
        else:
            pass
        
        self._block_starting_lock.release()

    def enum_child_on_thread(self, text, cur_frame, execution_id, frame_kind):
        self._block_starting_lock.acquire()
        if not self._is_working and self._is_blocked:
            self.schedule_work(lambda : self.enum_child_locally(text, cur_frame, execution_id, frame_kind))
            self._block_starting_lock.release()
        else:
            self._block_starting_lock.release()
            report_children(execution_id, [])

    def get_locals(self, cur_frame, frame_kind):
        if frame_kind == FRAME_KIND_DJANGO:
            locs = {}
            # iterate going forward, so later items replace earlier items
            for d in cur_frame.f_locals['context'].dicts:
                # hasattr check to defend against someone passing a bad dictionary value
                # and us breaking the app.
                if hasattr(d, 'keys') and d != DJANGO_BUILTINS:
                    for key in d.keys():
                        locs[key] = d[key]
        else:
            locs = cur_frame.f_locals
        return locs

    def locals_to_fast(self, frame):
        try:
            ltf = ctypes.pythonapi.PyFrame_LocalsToFast
            ltf.argtypes = [ctypes.py_object, ctypes.c_int]
            ltf(frame, 1)
        except:
            pass

    def compile(self, text, cur_frame):
        try:
            code = compile(text, '<debug input>', 'eval')
        except:
            code = compile(text, '<debug input>', 'exec')
        return code

    def run_locally(self, text, cur_frame, execution_id, frame_kind, repr_kind = PYTHON_EVALUATION_RESULT_REPR_KIND_NORMAL):
        try:
            code = self.compile(text, cur_frame)
            res = eval(code, cur_frame.f_globals, self.get_locals(cur_frame, frame_kind))
            self.locals_to_fast(cur_frame)
            # Report any updated variable values first
            self.enum_thread_frames_locally()
            report_execution_result(execution_id, res, repr_kind)
        except:
            # Report any updated variable values first
            self.enum_thread_frames_locally()
            report_execution_exception(execution_id, sys.exc_info())

    def run_locally_no_report(self, text, cur_frame, frame_kind):
        code = self.compile(text, cur_frame)
        res = eval(code, cur_frame.f_globals, self.get_locals(cur_frame, frame_kind))
        self.locals_to_fast(cur_frame)
        sys.displayhook(res)

    def enum_child_locally(self, expr, cur_frame, execution_id, frame_kind):
        try:
            code = compile(expr, cur_frame.f_code.co_name, 'eval')
            res = eval(code, cur_frame.f_globals, self.get_locals(cur_frame, frame_kind))

            children = [] # [(name, expression, value, flags)]

            # Process attributes.

            cls_dir = set(dir(type(res)))
            res_dict = getattr(res, '__dict__', {})
            res_slots = set(getattr(res, '__slots__', ()))

            for attr_name in dir(res):
                try:
                    # Skip special attributes.
                    if attr_name.startswith('__') and attr_name.endswith('__'):
                        continue
                    attr_value = getattr(res, attr_name)
                    # If it comes from the class and is not shadowed by any instance attribute, filter it out if it looks like a method.
                    if attr_name in cls_dir and attr_name not in res_dict and attr_name not in res_slots:
                        if isinstance(attr_value, METHOD_TYPES):
                            continue
                    children.append((attr_name, expr + '.' + attr_name, attr_value, 0))
                except:
                    # Skip this attribute if we can't process it.
                    pass

            # Process items, if this is a collection.

            try:
                if hasattr(res, '__iter__') and iter(res) is res:
                    # An iterable object that is its own iterator - iterators, generators, enumerate() etc. These can only be iterated once, so
                    # don't try to iterate them immediately. Instead, provide a child item that will do so when expanded, to give user full control.
                    children.append(('Results View', 'tuple(' + expr + ')', SynthesizedValue('Expanding the Results View will run the iterator'), PYTHON_EVALUATION_RESULT_METHOD_CALL | PYTHON_EVALUATION_RESULT_SIDE_EFFECTS))
                    enum = ()
                elif isinstance(res, dict) or (hasattr(res, 'items') and hasattr(res, 'has_key')):
                    # Dictionary-like object.
                    try:
                        enum = res.viewitems()
                        enum_expr = expr + '.viewitems()'
                        children.append(('viewitems()', enum_expr, SynthesizedValue(), PYTHON_EVALUATION_RESULT_METHOD_CALL))
                    except:
                        enum = res.items()
                        enum_expr = expr + '.items()'
                        children.append(('items()', enum_expr, SynthesizedValue(), PYTHON_EVALUATION_RESULT_METHOD_CALL))
                    enum_var = '(k, v)'
                    enum = enumerate(enum)
                else:
                    # Indexable or enumerable object.
                    enum = enumerate(enumerate(res))
                    enum_expr = expr
                    enum_var = 'v'
            except:
                enum = ()

            for index, (key, item) in enum:
                try:
                    if len(children) > 10000:
                        # Report at most 10000 items.
                        children.append(('[...]', None, 'Evaluation halted because sequence has too many items', 0))
                        break

                    key_repr = safe_repr(key)
                        
                    # Some objects are enumerable but not indexable, or repr(key) is not a valid Python expression. For those, we
                    # cannot use obj[key] to get the item by its key, and have to retrieve it by index from enumerate() instead.
                    try:
                        item_by_key = res[eval_repr(key)]
                        use_index = item is not item_by_key
                    except:
                        use_index = True
                    else:
                        use_index = False

                    item_name = '[' + key_repr + ']'
                    if use_index:
                        item_expr = 'next((v for i, %s in enumerate(%s) if i == %s))' % (enum_var, enum_expr, index)
                    else:
                        item_expr = expr + item_name

                    children.append((item_name, item_expr, item, 0))

                except:
                    # Skip this item if we can't process it.
                    pass

            report_children(execution_id, children)

        except:
            report_children(execution_id, [])

    def get_frame_list(self):
        frames = []
        cur_frame = self.cur_frame
        
        while should_send_frame(cur_frame):
            # calculate the ending line number
            lineno = cur_frame.f_code.co_firstlineno
            try:
                linetable = cur_frame.f_code.co_lnotab
            except:
                try:
                    lineno = cur_frame.f_code.Span.End.Line
                except:
                    lineno = -1
            else:
                for line_incr in linetable[1::2]:
                    if sys.version >= '3':
                        lineno += line_incr
                    else:
                        lineno += ord(line_incr)

            frame_locals = cur_frame.f_locals
            var_names = cur_frame.f_code.co_varnames

            source_obj = None
            if DJANGO_DEBUG:
                source_obj = get_django_frame_source(cur_frame)
                if source_obj is not None:
                    frame_locals = self.get_locals(cur_frame, FRAME_KIND_DJANGO)
                    var_names = frame_locals

            if source_obj is not None:
                process_globals_in_functions = False
            elif frame_locals is cur_frame.f_globals:
                var_names = frame_locals
                process_globals_in_functions = False
            else:
                process_globals_in_functions = True

            # collect frame locals
            vars = []
            treated = set()
            self.collect_variables(vars, frame_locals, var_names, treated)
            if process_globals_in_functions:
                # collect closed over variables used locally (frame_locals not already treated based on var_names)
                self.collect_variables(vars, frame_locals, frame_locals, treated)
                # collect globals used locally, skipping undefined found in builtins
                f_globals = cur_frame.f_globals
                if f_globals: # ensure globals to work with (IPy may have None for cur_frame.f_globals for frames within stdlib)
                    self.collect_variables(vars, f_globals, cur_frame.f_code.co_names, treated, skip_unknown = True)
            
            frame_info = None

            if source_obj is not None:
                origin, (start, end) = source_obj

                filename = str(origin)
                bp_info = DJANGO_BREAKPOINTS.get(filename.lower())
                if bp_info is None:
                    DJANGO_BREAKPOINTS[filename.lower()] = bp_info = DjangoBreakpointInfo(filename)

                low_line, hi_line = bp_info.get_line_range(start, end)
                if low_line is not None and hi_line is not None:
                    frame_kind = FRAME_KIND_DJANGO
                    frame_info = (
                        low_line + 1,
                        hi_line + 1, 
                        low_line + 1, 
                        cur_frame.f_code.co_name,
                        str(origin),
                        0,
                        vars,
                        FRAME_KIND_DJANGO,
                        get_code_filename(cur_frame.f_code),
                        cur_frame.f_lineno
                    )

            if frame_info is None:
                frame_info = (
                    cur_frame.f_code.co_firstlineno,
                    lineno, 
                    cur_frame.f_lineno, 
                    cur_frame.f_code.co_name,
                    get_code_filename(cur_frame.f_code),
                    cur_frame.f_code.co_argcount,
                    vars,
                    FRAME_KIND_PYTHON,
                    None,
                    None
                )

            frames.append(frame_info)
        
            cur_frame = cur_frame.f_back
                        
        return frames

    def collect_variables(self, vars, objects, names, treated, skip_unknown = False):
        for name in names:
            if name not in treated:
                try:
                    obj = objects[name]
                    try:
                        if sys.version[0] == '2' and type(obj) is types.InstanceType:
                            type_name = "instance (" + obj.__class__.__name__ + ")"
                        else:
                            type_name = type(obj).__name__
                    except:
                        type_name = 'unknown'
                except:
                    if skip_unknown:
                        continue
                    obj = SynthesizedValue('<undefined>', len_value=0)
                    type_name = 'unknown'
                vars.append((name, type(obj), safe_repr(obj), safe_hex_repr(obj), type_name, get_object_len(obj)))
                treated.add(name)

    def send_frame_list(self, frames, thread_name = None):
        with _SendLockCtx:
            write_bytes(conn, THRF)
            write_int(conn, self.id)
            write_string(conn, thread_name)
        
            # send the frame count
            write_int(conn, len(frames))
            for firstlineno, lineno, curlineno, name, filename, argcount, variables, frameKind, sourceFile, sourceLine in frames:
                # send each frame    
                write_int(conn, firstlineno)
                write_int(conn, lineno)
                write_int(conn, curlineno)
        
                write_string(conn, name)
                write_string(conn, filename)
                write_int(conn, argcount)
                
                write_int(conn, frameKind)
                if frameKind == FRAME_KIND_DJANGO:
                    write_string(conn, sourceFile)
                    write_int(conn, sourceLine)
                
                write_int(conn, len(variables))
                for name, type_obj, safe_repr_obj, hex_repr_obj, type_name, obj_len in variables:
                    write_string(conn, name)
                    write_object(conn, type_obj, safe_repr_obj, hex_repr_obj, type_name, obj_len)

    def enum_thread_frames_locally(self):
        global _threading
        if _threading is None:
            import threading
            _threading = threading
        self.send_frame_list(self.get_frame_list(), getattr(_threading.currentThread(), 'name', 'Python Thread'))

class Module(object):
    """tracks information about a loaded module"""

    CurrentLoadIndex = 0

    def __init__(self, filename):
        # TODO: Module.CurrentLoadIndex thread safety
        self.module_id = Module.CurrentLoadIndex
        Module.CurrentLoadIndex += 1
        self.filename = filename

def get_code(func):
    return getattr(func, 'func_code', None) or getattr(func, '__code__', None)

class DebuggerExitException(Exception): pass

def add_break_point(bp):
    cur_bp = BREAKPOINTS.get(bp.lineno)
    if cur_bp is None:
        cur_bp = BREAKPOINTS[bp.lineno] = dict()
    cur_bp[(bp.filename, bp.breakpoint_id)] = bp

def try_bind_break_point(mod_filename, module, bp):
    if module.filename.lower() == path.abspath(bp.filename).lower():
        bp.filename = mod_filename
        bp.is_bound = True
        add_break_point(bp)
        report_breakpoint_bound(bp.breakpoint_id)
        return True
    return False

def mark_all_threads_for_break(stepping = STEPPING_BREAK, skip_thread = None):
    THREADS_LOCK.acquire()
    for thread in THREADS.values():
        if thread is skip_thread:
            continue
        thread.stepping = stepping
    THREADS_LOCK.release()

class DebuggerLoop(object):

    instance = None

    def __init__(self, conn):
        DebuggerLoop.instance = self
        self.conn = conn
        self.repl_backend = None
        self.command_table = {
            to_bytes('stpi') : self.command_step_into,
            to_bytes('stpo') : self.command_step_out,
            to_bytes('stpv') : self.command_step_over,
            to_bytes('brkp') : self.command_set_breakpoint,
            to_bytes('brkc') : self.command_set_breakpoint_condition,
            to_bytes('bkpc') : self.command_set_breakpoint_pass_count,
            to_bytes('bkgh') : self.command_get_breakpoint_hit_count,
            to_bytes('bksh') : self.command_set_breakpoint_hit_count,
            to_bytes('brkr') : self.command_remove_breakpoint,
            to_bytes('brka') : self.command_break_all,
            to_bytes('resa') : self.command_resume_all,
            to_bytes('rest') : self.command_resume_thread,
            to_bytes('ares') : self.command_auto_resume,
            to_bytes('exec') : self.command_execute_code,
            to_bytes('chld') : self.command_enum_children,
            to_bytes('setl') : self.command_set_lineno,
            to_bytes('detc') : self.command_detach,
            to_bytes('clst') : self.command_clear_stepping,
            to_bytes('sexi') : self.command_set_exception_info,
            to_bytes('sehi') : self.command_set_exception_handler_info,
            to_bytes('bkdr') : self.command_remove_django_breakpoint,
            to_bytes('bkda') : self.command_add_django_breakpoint,
            to_bytes('crep') : self.command_connect_repl,
            to_bytes('drep') : self.command_disconnect_repl,
            to_bytes('lack') : self.command_last_ack,
        }

    def loop(self):
        try:
            while True:
                inp = read_bytes(conn, 4)
                cmd = self.command_table.get(inp)
                if cmd is not None:
                    cmd()
                else:
                    if inp:
                        print ('unknown command', inp)
                    break
        except DebuggerExitException:
            pass
        except socket.error:
            pass
        except:
            traceback.print_exc()
            
    def command_step_into(self):
        tid = read_int(self.conn)
        thread = get_thread_from_id(tid)
        if thread is not None:
            assert thread._is_blocked
            thread.stepping = STEPPING_INTO
            self.command_resume_all()

    def command_step_out(self):
        tid = read_int(self.conn)
        thread = get_thread_from_id(tid)
        if thread is not None:
            assert thread._is_blocked
            thread.stepping = STEPPING_OUT
            self.command_resume_all()
    
    def command_step_over(self):
        # set step over
        tid = read_int(self.conn)
        thread = get_thread_from_id(tid)
        if thread is not None:
            assert thread._is_blocked
            if DJANGO_DEBUG:
                source_obj = get_django_frame_source(thread.cur_frame)
                if source_obj is not None:
                    thread.django_stepping = True
                    self.command_resume_all()
                    return

            thread.stepping = STEPPING_OVER
            self.command_resume_all()

    def command_set_breakpoint(self):
        breakpoint_id = read_int(self.conn)
        lineno = read_int(self.conn)
        filename = read_string(self.conn)
        condition_kind = read_int(self.conn)
        condition = read_string(self.conn)
        pass_count_kind = read_int(self.conn)
        pass_count = read_int(self.conn)
        bp = BreakpointInfo(breakpoint_id, filename, lineno, condition_kind, condition, pass_count_kind, pass_count)

        for mod_filename, module in MODULES:
            if try_bind_break_point(mod_filename, module, bp):
                break
        else:
            # Failed to bind break point (e.g. module is not loaded yet); report as pending.
            add_break_point(bp)
            PENDING_BREAKPOINTS.add(bp)
            report_breakpoint_failed(breakpoint_id)

    def command_set_breakpoint_condition(self):
        breakpoint_id = read_int(self.conn)
        kind = read_int(self.conn)
        condition = read_string(self.conn)
        
        bp = BreakpointInfo.find_by_id(breakpoint_id)
        if bp is not None:
            bp.condition_kind = kind
            bp.condition = condition

    def command_set_breakpoint_pass_count(self):
        breakpoint_id = read_int(self.conn)
        kind = read_int(self.conn)
        count = read_int(self.conn)

        bp = BreakpointInfo.find_by_id(breakpoint_id)
        if bp is not None:
            bp.pass_count_kind = kind
            bp.pass_count = count

    def command_set_breakpoint_hit_count(self):
        breakpoint_id = read_int(self.conn)
        count = read_int(self.conn)
        
        bp = BreakpointInfo.find_by_id(breakpoint_id)
        if bp is not None:
            bp.hit_count = count

    def command_get_breakpoint_hit_count(self):
        req_id = read_int(self.conn)
        breakpoint_id = read_int(self.conn)
        
        bp = BreakpointInfo.find_by_id(breakpoint_id)
        count = 0
        if bp is not None:
            count = bp.hit_count

        with _SendLockCtx:
            write_bytes(conn, BKHC)
            write_int(conn, req_id)
            write_int(conn, count)

    def command_remove_breakpoint(self):
        line_no = read_int(self.conn)
        brkpt_id = read_int(self.conn)
        cur_bp = BREAKPOINTS.get(line_no)
        if cur_bp is not None:
            for file, id in cur_bp:
                if id == brkpt_id:
                    del cur_bp[file, id]
                    if not cur_bp:
                        del BREAKPOINTS[line_no]
                    break

    def command_remove_django_breakpoint(self):
        line_no = read_int(self.conn)
        brkpt_id = read_int(self.conn)
        filename = read_string(self.conn)

        bp_info = DJANGO_BREAKPOINTS.get(filename.lower())
        if bp_info is not None:
            bp_info.remove_breakpoint(line_no)

    def command_add_django_breakpoint(self):
        brkpt_id = read_int(self.conn)
        line_no = read_int(self.conn)
        filename = read_string(self.conn)
        bp_info = DJANGO_BREAKPOINTS.get(filename.lower())
        if bp_info is None:
            DJANGO_BREAKPOINTS[filename.lower()] = bp_info = DjangoBreakpointInfo(filename)

        bp_info.add_breakpoint(line_no, brkpt_id)

    def command_connect_repl(self):
        port_num = read_int(self.conn)
        _start_new_thread(self.connect_to_repl_backend, (port_num,))

    def connect_to_repl_backend(self, port_num):
        DONT_DEBUG.append(path.normcase(_vspr.__file__))
        self.repl_backend = _vspr.DebugReplBackend(self)
        self.repl_backend.connect_from_debugger(port_num)
        self.repl_backend.execution_loop()

    def connect_to_repl_backend_using_socket(self, sock):
        DONT_DEBUG.append(path.normcase(_vspr.__file__))
        self.repl_backend = _vspr.DebugReplBackend(self)
        self.repl_backend.connect_from_debugger_using_socket(sock)
        self.repl_backend.execution_loop()

    def command_disconnect_repl(self):
        if self.repl_backend is not None:
            self.repl_backend.disconnect_from_debugger()
            self.repl_backend = None

    def command_break_all(self):
        global SEND_BREAK_COMPLETE
        SEND_BREAK_COMPLETE = True
        mark_all_threads_for_break()

    def command_resume_all(self):
        # resume all
        THREADS_LOCK.acquire()
        all_threads = list(THREADS.values())
        THREADS_LOCK.release()
        for thread in all_threads:
            thread._block_starting_lock.acquire()
            if thread.stepping == STEPPING_BREAK or thread.stepping == STEPPING_ATTACH_BREAK:
                thread.stepping = STEPPING_NONE
            if thread._is_blocked:
                thread.unblock()
            thread._block_starting_lock.release()
    
    def command_resume_thread(self):
        tid = read_int(self.conn)
        THREADS_LOCK.acquire()
        thread = THREADS[tid]
        THREADS_LOCK.release()

        if thread.reported_process_loaded:
            thread.reported_process_loaded = False
            self.command_resume_all()
        else:
            thread.unblock()

    def command_auto_resume(self):
        tid = read_int(self.conn)
        THREADS_LOCK.acquire()
        thread = THREADS[tid]
        THREADS_LOCK.release()

        stepping = thread.stepping
        if ((stepping == STEPPING_OVER or stepping == STEPPING_INTO) and thread.cur_frame.f_lineno != thread.stopped_on_line): 
            report_step_finished(tid)
        else:
            self.command_resume_all()

    def command_set_exception_info(self):
        BREAK_ON.clear()
        BREAK_ON.default_mode = read_int(self.conn)

        break_on_count = read_int(self.conn)
        for i in xrange(break_on_count):
            mode = read_int(self.conn)
            name = read_string(self.conn)
            BREAK_ON.add_exception(name, mode)

    def command_set_exception_handler_info(self):
        try:
            filename = read_string(self.conn)

            statement_count = read_int(self.conn)
            handlers = []
            for _ in xrange(statement_count):
                line_start, line_end = read_int(self.conn), read_int(self.conn)

                expressions = set()
                text = read_string(self.conn).strip()
                while text != '-':
                    expressions.add(text)
                    text = read_string(self.conn)

                if not expressions:
                    expressions = set('*')

                handlers.append((line_start, line_end, expressions))

            BREAK_ON.handler_cache[filename] = handlers
        finally:
            BREAK_ON.handler_lock.release()

    def command_clear_stepping(self):
        tid = read_int(self.conn)

        thread = get_thread_from_id(tid)
        if thread is not None:
            thread.stepping = STEPPING_NONE

    def command_set_lineno(self):
        tid = read_int(self.conn)
        fid = read_int(self.conn)
        lineno = read_int(self.conn)
        try:
            THREADS_LOCK.acquire()
            THREADS[tid].cur_frame.f_lineno = lineno
            newline = THREADS[tid].cur_frame.f_lineno
            THREADS_LOCK.release()
            with _SendLockCtx:
                write_bytes(self.conn, SETL)
                write_int(self.conn, 1)
                write_int(self.conn, tid)
                write_int(self.conn, newline)
        except:
            with _SendLockCtx:
                write_bytes(self.conn, SETL)
                write_int(self.conn, 0)
                write_int(self.conn, tid)
                write_int(self.conn, 0)

    def command_execute_code(self):
        # execute given text in specified frame
        text = read_string(self.conn)
        tid = read_int(self.conn) # thread id
        fid = read_int(self.conn) # frame id
        eid = read_int(self.conn) # execution id
        frame_kind = read_int(self.conn)
        repr_kind = read_int(self.conn)

        thread, cur_frame = self.get_thread_and_frame(tid, fid, frame_kind)
        if thread is not None and cur_frame is not None:
            thread.run_on_thread(text, cur_frame, eid, frame_kind, repr_kind)

    def execute_code_no_report(self, text, tid, fid, frame_kind):
        # execute given text in specified frame, without sending back the results
        thread, cur_frame = self.get_thread_and_frame(tid, fid, frame_kind)
        if thread is not None and cur_frame is not None:
            thread.run_locally_no_report(text, cur_frame, frame_kind)

    def command_enum_children(self):
        # execute given text in specified frame
        text = read_string(self.conn)
        tid = read_int(self.conn) # thread id
        fid = read_int(self.conn) # frame id
        eid = read_int(self.conn) # execution id
        frame_kind = read_int(self.conn) # frame kind
                
        thread, cur_frame = self.get_thread_and_frame(tid, fid, frame_kind)
        if thread is not None and cur_frame is not None:
            thread.enum_child_on_thread(text, cur_frame, eid, frame_kind)
    
    def get_thread_and_frame(self, tid, fid, frame_kind):
        thread = get_thread_from_id(tid)
        cur_frame = None

        if thread is not None:
            cur_frame = thread.cur_frame
            for i in xrange(fid):
                cur_frame = cur_frame.f_back

        return thread, cur_frame

    def command_detach(self):
        detach_threads()

        # unload debugger DLL
        global debugger_dll_handle
        if debugger_dll_handle is not None:
            k32 = ctypes.WinDLL('kernel32')
            k32.FreeLibrary.argtypes = [ctypes.c_void_p]
            k32.FreeLibrary(debugger_dll_handle)
            debugger_dll_handle = None

        with _SendLockCtx:
            write_bytes(conn, DETC)
            detach_process()        

        for callback in DETACH_CALLBACKS:
            callback()
        
        raise DebuggerExitException()

    def command_last_ack(self):
        last_ack_event.set()

DETACH_CALLBACKS = []

def new_thread_wrapper(func, posargs, kwargs):
    cur_thread = new_thread()
    try:
        sys.settrace(cur_thread.trace_func)
        func(*posargs, **kwargs)
    finally:
        THREADS_LOCK.acquire()
        if not cur_thread.detach:
            del THREADS[cur_thread.id]
        THREADS_LOCK.release()

        if not DETACHED:
            report_thread_exit(cur_thread)

def report_new_thread(new_thread):
    ident = new_thread.id
    with _SendLockCtx:
        write_bytes(conn, NEWT)
        write_int(conn, ident)

def report_all_threads():
    THREADS_LOCK.acquire()
    all_threads = list(THREADS.values())
    THREADS_LOCK.release()
    for cur_thread in all_threads:
        report_new_thread(cur_thread)

def report_thread_exit(old_thread):
    ident = old_thread.id
    with _SendLockCtx:
        write_bytes(conn, EXTT)
        write_int(conn, ident)

def report_exception(frame, exc_info, tid, break_type):
    exc_type = exc_info[0]
    exc_name = get_exception_name(exc_type)
    exc_value = exc_info[1]
    tb_value = exc_info[2]
    
    if type(exc_value) is tuple:
        # exception object hasn't been created yet, create it now 
        # so we can get the correct msg.
        exc_value = exc_type(*exc_value)
    
    excp_text = str(exc_value)

    with _SendLockCtx:
        write_bytes(conn, EXCP)
        write_string(conn, exc_name)
        write_int(conn, tid)
        write_int(conn, break_type)
        write_string(conn, excp_text)

def new_module(frame):
    mod = Module(get_code_filename(frame.f_code))
    MODULES.append((frame.f_code.co_filename, mod))

    return frame.f_code, mod

def report_module_load(mod):
    with _SendLockCtx:
        write_bytes(conn, MODL)
        write_int(conn, mod.module_id)
        write_string(conn, mod.filename)

def report_step_finished(tid):
    with _SendLockCtx:
        write_bytes(conn, STPD)
        write_int(conn, tid)

def report_breakpoint_bound(id):
    with _SendLockCtx:
        write_bytes(conn, BRKS)
        write_int(conn, id)

def report_breakpoint_failed(id):
    with _SendLockCtx:
        write_bytes(conn, BRKF)
        write_int(conn, id)

def report_breakpoint_hit(id, tid):    
    with _SendLockCtx:
        write_bytes(conn, BRKH)
        write_int(conn, id)
        write_int(conn, tid)

def report_process_loaded(tid):
    with _SendLockCtx:
        write_bytes(conn, LOAD)
        write_int(conn, tid)

def report_execution_error(exc_text, execution_id):
    with _SendLockCtx:
        write_bytes(conn, EXCE)
        write_int(conn, execution_id)
        write_string(conn, exc_text)

def report_execution_exception(execution_id, exc_info):
    try:
        exc_text = str(exc_info[1])
    except:
        exc_text = 'An exception was thrown'

    report_execution_error(exc_text, execution_id)

def safe_hex_repr(obj):
    try:
        return hex(obj)
    except:
        return None

def get_object_len(obj):
    try:
        return len(obj)
    except:
        return None

def report_execution_result(execution_id, result, repr_kind = PYTHON_EVALUATION_RESULT_REPR_KIND_NORMAL):
    if repr_kind == PYTHON_EVALUATION_RESULT_REPR_KIND_NORMAL:
        flags = 0
        obj_repr = safe_repr(result)
        obj_len = get_object_len(result)
        hex_repr = safe_hex_repr(result)
    else:
        flags = PYTHON_EVALUATION_RESULT_RAW
        hex_repr = None                
        for cls, raw_repr in TYPES_WITH_RAW_REPR.items():
            if isinstance(result, cls):
                try:
                    obj_repr = raw_repr(result)
                except:
                    obj_repr = None
                break
        obj_len = get_object_len(obj_repr)
        if repr_kind == PYTHON_EVALUATION_RESULT_REPR_KIND_RAWLEN:
            obj_repr = None

    res_type = type(result)
    type_name = type(result).__name__

    with _SendLockCtx:
        write_bytes(conn, EXCR)
        write_int(conn, execution_id)
        write_object(conn, res_type, obj_repr, hex_repr, type_name, obj_len, flags)

def report_children(execution_id, children):
    children = [(name, expression, flags, safe_repr(result), safe_hex_repr(result), type(result), type(result).__name__, get_object_len(result)) for name, expression, result, flags in children]
    with _SendLockCtx:
        write_bytes(conn, CHLD)
        write_int(conn, execution_id)
        write_int(conn, len(children))
        for name, expression, flags, obj_repr, hex_repr, res_type, type_name, obj_len in children:
            write_string(conn, name)
            write_string(conn, expression)
            write_object(conn, res_type, obj_repr, hex_repr, type_name, obj_len, flags)

def get_code_filename(code):
    return path.abspath(code.co_filename)

NONEXPANDABLE_TYPES = [int, str, bool, float, object, type(None), unicode]
try:
    NONEXPANDABLE_TYPES.append(long)
except NameError: pass

def write_object(conn, obj_type, obj_repr, hex_repr, type_name, obj_len, flags = 0):
    write_string(conn, obj_repr)
    write_string(conn, hex_repr)
    if obj_type is SynthesizedValue:
        write_string(conn, '')
    else:
        write_string(conn, type_name)
    if obj_type not in NONEXPANDABLE_TYPES and obj_len != 0:
        flags |= PYTHON_EVALUATION_RESULT_EXPANDABLE
    try:
        for cls in TYPES_WITH_RAW_REPR:
            if issubclass(obj_type, cls):
                flags |= PYTHON_EVALUATION_RESULT_HAS_RAW_REPR
                break
    except: # guard against broken issubclass for types which aren't actually types, like vtkclass
        pass
    write_int(conn, obj_len or 0)
    write_int(conn, flags)

debugger_thread_id = -1
_INTERCEPTING_FOR_ATTACH = False

def intercept_threads(for_attach = False):
    thread.start_new_thread = thread_creator
    thread.start_new = thread_creator

    # If threading has already been imported (i.e. we're attaching), we must hot-patch threading._start_new_thread
    # so that new threads started using it will be intercepted by our code.
    #
    # On the other hand, if threading has not been imported, we must not import it ourselves, because it will then
    # treat the current thread as the main thread, which is incorrect when attaching because this code is executing
    # on an ephemeral debugger attach thread that will go away shortly. We don't need to hot-patch it in that case
    # anyway, because it will pick up the new thread.start_new_thread that we have set above when it's imported.
    global _threading
    if _threading is None and 'threading' in sys.modules:
        import threading
        _threading = threading
        _threading._start_new_thread = thread_creator

    global _INTERCEPTING_FOR_ATTACH
    _INTERCEPTING_FOR_ATTACH = for_attach

## Modified parameters by Don Jayamanne
# Accept current Process id to pass back to debugger
def attach_process(port_num, debug_id, debug_options, currentPid, report = False, block = False):
    global conn
    for i in xrange(50):
        try:
            conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            conn.connect(('127.0.0.1', port_num))
            write_string(conn, debug_id)
            write_int(conn, 0)  # success
            ## Begin modification by Don Jayamanne
            # Pass current Process id to pass back to debugger
            write_int(conn, currentPid)  # success
            ## End Modification by Don Jayamanne
            break
        except:
            import time
            time.sleep(50./1000)
    else:
        raise Exception('failed to attach')
    attach_process_from_socket(conn, debug_options, report, block)

def attach_process_from_socket(sock, debug_options, report = False, block = False):
    global conn, attach_sent_break, DETACHED, DEBUG_STDLIB, BREAK_ON_SYSTEMEXIT_ZERO, DJANGO_DEBUG

    BREAK_ON_SYSTEMEXIT_ZERO = 'BreakOnSystemExitZero' in debug_options
    DJANGO_DEBUG = 'DjangoDebugging' in debug_options

    if '' in PREFIXES:
        # If one or more of the prefixes are empty, we can't reliably distinguish stdlib
        # from user code, so override stdlib-only mode and allow to debug everything.
        DEBUG_STDLIB = True
    else:
        DEBUG_STDLIB = 'DebugStdLib' in debug_options

    wait_on_normal_exit = 'WaitOnNormalExit' in debug_options
    wait_on_abnormal_exit = 'WaitOnAbnormalExit' in debug_options

    def _excepthook(exc_type, exc_value, exc_tb):
        # Display the exception and wait on exit
        if exc_type is SystemExit:
            if (wait_on_abnormal_exit and exc_value.code) or (wait_on_normal_exit and not exc_value.code):
                print_exception(exc_type, exc_value, exc_tb)
                do_wait()
        else:
            print_exception(exc_type, exc_value, exc_tb)
            if wait_on_abnormal_exit:
                do_wait()
    sys.excepthook = sys.__excepthook__ = _excepthook

    conn = sock
    attach_sent_break = False

    # start the debugging loop
    global debugger_thread_id
    debugger_thread_id = _start_new_thread(DebuggerLoop(conn).loop, ())

    for mod_name, mod_value in sys.modules.items():
        try:
            filename = getattr(mod_value, '__file__', None)
            if filename is not None:
                try:
                    fullpath = path.abspath(filename)
                except:
                    pass
                else:
                    MODULES.append((filename, Module(fullpath)))
        except:
            traceback.print_exc()   

    if report:
        THREADS_LOCK.acquire()
        all_threads = list(THREADS.values())
        if block:
            main_thread = THREADS[thread.get_ident()]
        THREADS_LOCK.release()
        for cur_thread in all_threads:
            report_new_thread(cur_thread)
        for filename, module in MODULES:
            report_module_load(module)
    DETACHED = False

    if block:
        main_thread.block(lambda: report_process_loaded(thread.get_ident()))

    # intercept all new thread requests
    if not _INTERCEPTING_FOR_ATTACH:
        intercept_threads()

    if 'RedirectOutput' in debug_options:
        enable_output_redirection()

# Try to detach cooperatively, notifying the debugger as we do so.
def detach_process_and_notify_debugger():
    if DebuggerLoop.instance:
        try:
            DebuggerLoop.instance.command_detach()
        except DebuggerExitException: # successfully detached
            return
        except: # swallow anything else, and forcibly detach below
            pass
    detach_process()

def detach_process():
    global DETACHED
    DETACHED = True
    if not _INTERCEPTING_FOR_ATTACH:
        if isinstance(sys.stdout, _DebuggerOutput): 
            sys.stdout = sys.stdout.old_out
        if isinstance(sys.stderr, _DebuggerOutput):
            sys.stderr = sys.stderr.old_out

    if not _INTERCEPTING_FOR_ATTACH:
        thread.start_new_thread = _start_new_thread
        thread.start_new = _start_new_thread

def detach_threads():
    # tell all threads to stop tracing...
    THREADS_LOCK.acquire()
    all_threads = list(THREADS.items())
    THREADS_LOCK.release()

    for tid, pyThread in all_threads:
        if not _INTERCEPTING_FOR_ATTACH:
            pyThread.detach = True
            pyThread.stepping = STEPPING_BREAK

        if pyThread._is_blocked:
            pyThread.unblock()

    if not _INTERCEPTING_FOR_ATTACH:
        THREADS_LOCK.acquire()
        THREADS.clear()
        THREADS_LOCK.release()
        
    BREAKPOINTS.clear()

def new_thread(tid = None, set_break = False, frame = None):
    # called during attach w/ a thread ID provided.
    if tid == debugger_thread_id:
        return None

    cur_thread = Thread(tid)    
    THREADS_LOCK.acquire()
    THREADS[cur_thread.id] = cur_thread
    THREADS_LOCK.release()
    cur_thread.push_frame(frame)
    if set_break:
        cur_thread.stepping = STEPPING_ATTACH_BREAK
    if not DETACHED:
        report_new_thread(cur_thread)
    return cur_thread

def new_external_thread():
    thread = new_thread()
    if not attach_sent_break:
        # we are still doing the attach, make this thread break.
        thread.stepping = STEPPING_ATTACH_BREAK
    elif SEND_BREAK_COMPLETE:
        # user requested break all, make this thread break
        thread.stepping = STEPPING_BREAK

    sys.settrace(thread.trace_func)

def do_wait():
    try:
        import msvcrt
    except ImportError:
        sys.__stdout__.write('Press Enter to continue . . . ')
        sys.__stdout__.flush()
        sys.__stdin__.read(1)
    else:
        sys.__stdout__.write('Press any key to continue . . . ')
        sys.__stdout__.flush()
        msvcrt.getch()

def enable_output_redirection():
    sys.stdout = _DebuggerOutput(sys.stdout, is_stdout = True)
    sys.stderr = _DebuggerOutput(sys.stderr, is_stdout = False)

def connect_repl_using_socket(sock):
    _start_new_thread(DebuggerLoop.instance.connect_to_repl_backend_using_socket, (sock,))

class _DebuggerOutput(object):
    """file like object which redirects output to the repl window."""
    errors = 'strict'

    def __init__(self, old_out, is_stdout):
        self.is_stdout = is_stdout
        self.old_out = old_out
        if sys.version >= '3.' and hasattr(old_out, 'buffer'):
            self.buffer = DebuggerBuffer(old_out.buffer)

    def flush(self):
        if self.old_out:
            self.old_out.flush()
    
    def writelines(self, lines):
        for line in lines:
            self.write(line)
    
    @property
    def encoding(self):
        return 'utf8'

    def write(self, value):
        if not DETACHED:
            probe_stack(3)
            with _SendLockCtx:
                write_bytes(conn, OUTP)
                write_int(conn, thread.get_ident())
                write_string(conn, value)
        if self.old_out:
            self.old_out.write(value)
    
    def isatty(self):
        return True

    def next(self):
        pass
    
    @property
    def name(self):
        if self.is_stdout:
            return "<stdout>"
        else:
            return "<stderr>"

    def __getattr__(self, name):
        return getattr(self.old_out, name)

class DebuggerBuffer(object):
    def __init__(self, old_buffer):
        self.buffer = old_buffer

    def write(self, data):
        if not DETACHED:
            probe_stack(3)
            str_data = utf_8.decode(data)[0]
            with _SendLockCtx:
                write_bytes(conn, OUTP)
                write_int(conn, thread.get_ident())
                write_string(conn, str_data)
        self.buffer.write(data)

    def flush(self): 
        self.buffer.flush()

    def truncate(self, pos = None):
        return self.buffer.truncate(pos)

    def tell(self):
        return self.buffer.tell()

    def seek(self, pos, whence = 0):
        return self.buffer.seek(pos, whence)

def is_same_py_file(file1, file2):
    """compares 2 filenames accounting for .pyc files"""
    if file1.endswith('.pyc') or file1.endswith('.pyo'): 
        file1 = file1[:-1]
    if file2.endswith('.pyc') or file2.endswith('.pyo'): 
        file2 = file2[:-1]

    return file1 == file2

def print_exception(exc_type, exc_value, exc_tb):
    # remove debugger frames from the top and bottom of the traceback
    tb = traceback.extract_tb(exc_tb)
    for i in [0, -1]:
        while tb:
            frame_file = path.normcase(tb[i][0])
            if not any(is_same_py_file(frame_file, f) for f in DONT_DEBUG):
                break
            del tb[i]

    # print the traceback
    if tb:
        print('Traceback (most recent call last):')
        for out in traceback.format_list(tb):
            sys.stderr.write(out)
    
    # print the exception
    for out in traceback.format_exception_only(exc_type, exc_value):
        sys.stdout.write(out)

def parse_debug_options(s):
    return set([opt.strip() for opt in s.split(',')])

## Modified parameters by Don Jayamanne
# Accept current Process id to pass back to debugger
def debug(file, port_num, debug_id, debug_options, currentPid, run_as = 'script'):
    # remove us from modules so there's no trace of us
    sys.modules['$visualstudio_py_debugger'] = sys.modules['visualstudio_py_debugger']
    __name__ = '$visualstudio_py_debugger'
    del sys.modules['visualstudio_py_debugger']

    wait_on_normal_exit = 'WaitOnNormalExit' in debug_options

    ## Begin modification by Don Jayamanne
    # Pass current Process id to pass back to debugger
    attach_process(port_num, debug_id, debug_options, currentPid, report = True)
    ## End Modification by Don Jayamanne
     
    # setup the current thread
    cur_thread = new_thread()
    cur_thread.stepping = STEPPING_LAUNCH_BREAK

    # start tracing on this thread
    sys.settrace(cur_thread.trace_func)

    # now execute main file
    globals_obj = {'__name__': '__main__'}
    try:
        if run_as == 'module':
            exec_module(file, globals_obj)
        elif run_as == 'code':
            exec_code(file, '<string>', globals_obj)
        else:
            exec_file(file, globals_obj)
    finally:
        sys.settrace(None)
        THREADS_LOCK.acquire()
        del THREADS[cur_thread.id]
        THREADS_LOCK.release()
        report_thread_exit(cur_thread)

        # Give VS debugger a chance to process commands
        # by waiting for ack of "last" command
        global _threading
        if _threading is None:
            import threading
            _threading = threading
        global last_ack_event
        last_ack_event = _threading.Event()
        with _SendLockCtx:
            write_bytes(conn, LAST)
        last_ack_event.wait(5)

    if wait_on_normal_exit:
        do_wait()

# Code objects for functions which are going to be at the bottom of the stack, right below the first
# stack frame for user code. When we walk the stack to determine whether to report or block on a given
# frame, hitting any of these means that we walked all the frames that we needed to look at.
DEBUG_ENTRYPOINTS = set((
    get_code(debug),
    get_code(exec_file),
    get_code(exec_module),
    get_code(exec_code),
    get_code(new_thread_wrapper)
))
