"""
To ensure compatibility from Python ``2.6`` - ``3.3``, a module has been
created. Clearly there is huge need to use conforming syntax.
"""
import sys
import imp
import os
import re
try:
    import importlib
except ImportError:
    pass

is_py3 = sys.version_info[0] >= 3
is_py33 = is_py3 and sys.version_info.minor >= 3
is_py26 = not is_py3 and sys.version_info[1] < 7


def find_module_py33(string, path=None):
    loader = importlib.machinery.PathFinder.find_module(string, path)

    if loader is None and path is None:  # Fallback to find builtins
        try:
            loader = importlib.find_loader(string)
        except ValueError as e:
            # See #491. Importlib might raise a ValueError, to avoid this, we
            # just raise an ImportError to fix the issue.
            raise ImportError("Originally ValueError: " + e.message)

    if loader is None:
        raise ImportError("Couldn't find a loader for {0}".format(string))

    try:
        is_package = loader.is_package(string)
        if is_package:
            module_path = os.path.dirname(loader.path)
            module_file = None
        else:
            module_path = loader.get_filename(string)
            module_file = open(module_path, 'rb')
    except AttributeError:
        # ExtensionLoader has not attribute get_filename, instead it has a
        # path attribute that we can use to retrieve the module path
        try:
            module_path = loader.path
            module_file = open(loader.path, 'rb')
        except AttributeError:
            module_path = string
            module_file = None
        finally:
            is_package = False

    return module_file, module_path, is_package


def find_module_pre_py33(string, path=None):
    module_file, module_path, description = imp.find_module(string, path)
    module_type = description[2]
    return module_file, module_path, module_type is imp.PKG_DIRECTORY


find_module = find_module_py33 if is_py33 else find_module_pre_py33
find_module.__doc__ = """
Provides information about a module.

This function isolates the differences in importing libraries introduced with
python 3.3 on; it gets a module name and optionally a path. It will return a
tuple containin an open file for the module (if not builtin), the filename
or the name of the module if it is a builtin one and a boolean indicating
if the module is contained in a package.
"""


# unicode function
try:
    unicode = unicode
except NameError:
    unicode = str

if is_py3:
    u = lambda s: s
else:
    u = lambda s: s.decode('utf-8')

u.__doc__ = """
Decode a raw string into unicode object.  Do nothing in Python 3.
"""

# exec function
if is_py3:
    def exec_function(source, global_map):
        exec(source, global_map)
else:
    eval(compile("""def exec_function(source, global_map):
                        exec source in global_map """, 'blub', 'exec'))

# re-raise function
if is_py3:
    def reraise(exception, traceback):
        raise exception.with_traceback(traceback)
else:
    eval(compile("""
def reraise(exception, traceback):
    raise exception, None, traceback
""", 'blub', 'exec'))

reraise.__doc__ = """
Re-raise `exception` with a `traceback` object.

Usage::

    reraise(Exception, sys.exc_info()[2])

"""

class Python3Method(object):
    def __init__(self, func):
        self.func = func

    def __get__(self, obj, objtype):
        if obj is None:
            return lambda *args, **kwargs: self.func(*args, **kwargs)
        else:
            return lambda *args, **kwargs: self.func(obj, *args, **kwargs)


def use_metaclass(meta, *bases):
    """ Create a class with a metaclass. """
    if not bases:
        bases = (object,)
    return meta("HackClass", bases, {})


try:
    encoding = sys.stdout.encoding
    if encoding is None:
        encoding = 'utf-8'
except AttributeError:
    encoding = 'ascii'


def u(string):
    """Cast to unicode DAMMIT!
    Written because Python2 repr always implicitly casts to a string, so we
    have to cast back to a unicode (and we now that we always deal with valid
    unicode, because we check that in the beginning).
    """
    if is_py3:
        return str(string)
    elif not isinstance(string, unicode):
        return unicode(str(string), 'UTF-8')
    return string

try:
    import builtins  # module name in python 3
except ImportError:
    import __builtin__ as builtins


import ast


def literal_eval(string):
    # py3.0, py3.1 and py32 don't support unicode literals. Support those, I
    # don't want to write two versions of the tokenizer.
    if is_py3 and sys.version_info.minor < 3:
        if re.match('[uU][\'"]', string):
            string = string[1:]
    return ast.literal_eval(string)


try:
    from itertools import zip_longest
except ImportError:
    from itertools import izip_longest as zip_longest  # Python 2


def no_unicode_pprint(dct):
    """
    Python 2/3 dict __repr__ may be different, because of unicode differens
    (with or without a `u` prefix). Normally in doctests we could use `pprint`
    to sort dicts and check for equality, but here we have to write a separate
    function to do that.
    """
    import pprint
    s = pprint.pformat(dct)
    print(re.sub("u'", "'", s))


def utf8_repr(func):
    """
    ``__repr__`` methods in Python 2 don't allow unicode objects to be
    returned. Therefore cast them to utf-8 bytes in this decorator.
    """
    def wrapper(self):
        result = func(self)
        if isinstance(result, unicode):
            return result.encode('utf-8')
        else:
            return result

    if is_py3:
        return func
    else:
        return wrapper
