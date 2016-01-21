"""
Imitate the parser representation.
"""
import inspect
import re
import sys
import os
from functools import partial

from jedi._compatibility import builtins as _builtins, unicode
from jedi import debug
from jedi.cache import underscore_memoization, memoize_method
from jedi.evaluate.sys_path import get_sys_path
from jedi.parser.tree import Param, Base, Operator, zero_position_modifier
from jedi.evaluate.helpers import FakeName
from . import fake


_sep = os.path.sep
if os.path.altsep is not None:
    _sep += os.path.altsep
_path_re = re.compile('(?:\.[^{0}]+|[{0}]__init__\.py)$'.format(re.escape(_sep)))
del _sep


class CheckAttribute(object):
    """Raises an AttributeError if the attribute X isn't available."""
    def __init__(self, func):
        self.func = func
        # Remove the py in front of e.g. py__call__.
        self.check_name = func.__name__[2:]

    def __get__(self, instance, owner):
        # This might raise an AttributeError. That's wanted.
        getattr(instance.obj, self.check_name)
        return partial(self.func, instance)


class CompiledObject(Base):
    # comply with the parser
    start_pos = 0, 0
    path = None  # modules have this attribute - set it to None.
    used_names = {}  # To be consistent with modules.

    def __init__(self, obj, parent=None):
        self.obj = obj
        self.parent = parent

    @property
    def py__call__(self):
        def actual(evaluator, params):
            if inspect.isclass(self.obj):
                from jedi.evaluate.representation import Instance
                return [Instance(evaluator, self, params)]
            else:
                return list(self._execute_function(evaluator, params))

        # Might raise an AttributeError, which is intentional.
        self.obj.__call__
        return actual

    @CheckAttribute
    def py__class__(self, evaluator):
        return CompiledObject(self.obj.__class__, parent=self.parent)

    @CheckAttribute
    def py__mro__(self, evaluator):
        return tuple(create(evaluator, cls, self.parent) for cls in self.obj.__mro__)

    @CheckAttribute
    def py__bases__(self, evaluator):
        return tuple(create(evaluator, cls) for cls in self.obj.__bases__)

    def py__bool__(self):
        return bool(self.obj)

    def py__file__(self):
        return self.obj.__file__

    def is_class(self):
        return inspect.isclass(self.obj)

    @property
    def doc(self):
        return inspect.getdoc(self.obj) or ''

    @property
    def params(self):
        params_str, ret = self._parse_function_doc()
        tokens = params_str.split(',')
        if inspect.ismethoddescriptor(self._cls().obj):
            tokens.insert(0, 'self')
        params = []
        for p in tokens:
            parts = [FakeName(part) for part in p.strip().split('=')]
            if len(parts) > 1:
                parts.insert(1, Operator(zero_position_modifier, '=', (0, 0)))
            params.append(Param(parts, self))
        return params

    def __repr__(self):
        return '<%s: %s>' % (type(self).__name__, repr(self.obj))

    @underscore_memoization
    def _parse_function_doc(self):
        if self.doc is None:
            return '', ''

        return _parse_function_doc(self.doc)

    def api_type(self):
        if fake.is_class_instance(self.obj):
            return 'instance'

        cls = self._cls().obj
        if inspect.isclass(cls):
            return 'class'
        elif inspect.ismodule(cls):
            return 'module'
        elif inspect.isbuiltin(cls) or inspect.ismethod(cls) \
                or inspect.ismethoddescriptor(cls):
            return 'function'

    @property
    def type(self):
        """Imitate the tree.Node.type values."""
        cls = self._cls().obj
        if inspect.isclass(cls):
            return 'classdef'
        elif inspect.ismodule(cls):
            return 'file_input'
        elif inspect.isbuiltin(cls) or inspect.ismethod(cls) \
                or inspect.ismethoddescriptor(cls):
            return 'funcdef'

    @underscore_memoization
    def _cls(self):
        # Ensures that a CompiledObject is returned that is not an instance (like list)
        if fake.is_class_instance(self.obj):
            try:
                c = self.obj.__class__
            except AttributeError:
                # happens with numpy.core.umath._UFUNC_API (you get it
                # automatically by doing `import numpy`.
                c = type(None)
            return CompiledObject(c, self.parent)
        return self

    @property
    def names_dict(self):
        # For compatibility with `representation.Class`.
        return self.names_dicts(False)[0]

    def names_dicts(self, search_global, is_instance=False):
        return self._names_dict_ensure_one_dict(is_instance)

    @memoize_method
    def _names_dict_ensure_one_dict(self, is_instance):
        """
        search_global shouldn't change the fact that there's one dict, this way
        there's only one `object`.
        """
        return [LazyNamesDict(self._cls(), is_instance)]

    def get_subscope_by_name(self, name):
        if name in dir(self._cls().obj):
            return CompiledName(self._cls(), name).parent
        else:
            raise KeyError("CompiledObject doesn't have an attribute '%s'." % name)

    def get_index_types(self, evaluator, index_array=()):
        # If the object doesn't have `__getitem__`, just raise the
        # AttributeError.
        if not hasattr(self.obj, '__getitem__'):
            debug.warning('Tried to call __getitem__ on non-iterable.')
            return []
        if type(self.obj) not in (str, list, tuple, unicode, bytes, bytearray, dict):
            # Get rid of side effects, we won't call custom `__getitem__`s.
            return []

        result = []
        from jedi.evaluate.iterable import create_indexes_or_slices
        for typ in create_indexes_or_slices(evaluator, index_array):
            index = None
            try:
                index = typ.obj
                new = self.obj[index]
            except (KeyError, IndexError, TypeError, AttributeError):
                # Just try, we don't care if it fails, except for slices.
                if isinstance(index, slice):
                    result.append(self)
            else:
                result.append(CompiledObject(new))
        if not result:
            try:
                for obj in self.obj:
                    result.append(CompiledObject(obj))
            except TypeError:
                pass  # self.obj maynot have an __iter__ method.
        return result

    @property
    def name(self):
        # might not exist sometimes (raises AttributeError)
        return FakeName(self._cls().obj.__name__, self)

    def _execute_function(self, evaluator, params):
        if self.type != 'funcdef':
            return

        for name in self._parse_function_doc()[1].split():
            try:
                bltn_obj = _create_from_name(builtin, builtin, name)
            except AttributeError:
                continue
            else:
                if isinstance(bltn_obj, CompiledObject) and bltn_obj.obj is None:
                    # We want everything except None.
                    continue
                for result in evaluator.execute(bltn_obj, params):
                    yield result

    @property
    @underscore_memoization
    def subscopes(self):
        """
        Returns only the faked scopes - the other ones are not important for
        internal analysis.
        """
        module = self.get_parent_until()
        faked_subscopes = []
        for name in dir(self._cls().obj):
            f = fake.get_faked(module.obj, self.obj, name)
            if f:
                f.parent = self
                faked_subscopes.append(f)
        return faked_subscopes

    def is_scope(self):
        return True

    def get_self_attributes(self):
        return []  # Instance compatibility

    def get_imports(self):
        return []  # Builtins don't have imports


class LazyNamesDict(object):
    """
    A names_dict instance for compiled objects, resembles the parser.tree.
    """
    def __init__(self, compiled_obj, is_instance):
        self._compiled_obj = compiled_obj
        self._is_instance = is_instance

    def __iter__(self):
        return (v[0].value for v in self.values())

    @memoize_method
    def __getitem__(self, name):
        try:
            getattr(self._compiled_obj.obj, name)
        except AttributeError:
            raise KeyError('%s in %s not found.' % (name, self._compiled_obj))
        return [CompiledName(self._compiled_obj, name)]

    def values(self):
        obj = self._compiled_obj.obj

        values = []
        for name in dir(obj):
            try:
                values.append(self[name])
            except KeyError:
                # The dir function can be wrong.
                pass

        # dir doesn't include the type names.
        if not inspect.ismodule(obj) and obj != type and not self._is_instance:
            values += _type_names_dict.values()
        return values


class CompiledName(FakeName):
    def __init__(self, obj, name):
        super(CompiledName, self).__init__(name)
        self._obj = obj
        self.name = name

    def __repr__(self):
        try:
            name = self._obj.name  # __name__ is not defined all the time
        except AttributeError:
            name = None
        return '<%s: (%s).%s>' % (type(self).__name__, name, self.name)

    def is_definition(self):
        return True

    @property
    @underscore_memoization
    def parent(self):
        module = self._obj.get_parent_until()
        return _create_from_name(module, self._obj, self.name)

    @parent.setter
    def parent(self, value):
        pass  # Just ignore this, FakeName tries to overwrite the parent attribute.


def dotted_from_fs_path(fs_path, sys_path=None):
    """
    Changes `/usr/lib/python3.4/email/utils.py` to `email.utils`.  I.e.
    compares the path with sys.path and then returns the dotted_path. If the
    path is not in the sys.path, just returns None.
    """
    if sys_path is None:
        sys_path = get_sys_path()

    if os.path.basename(fs_path).startswith('__init__.'):
        # We are calculating the path. __init__ files are not interesting.
        fs_path = os.path.dirname(fs_path)

    # prefer
    #   - UNIX
    #     /path/to/pythonX.Y/lib-dynload
    #     /path/to/pythonX.Y/site-packages
    #   - Windows
    #     C:\path\to\DLLs
    #     C:\path\to\Lib\site-packages
    # over
    #   - UNIX
    #     /path/to/pythonX.Y
    #   - Windows
    #     C:\path\to\Lib
    path = ''
    for s in sys_path:
        if (fs_path.startswith(s) and len(path) < len(s)):
            path = s
    return _path_re.sub('', fs_path[len(path):].lstrip(os.path.sep)).replace(os.path.sep, '.')


def load_module(path=None, name=None):
    if path is not None:
        dotted_path = dotted_from_fs_path(path)
    else:
        dotted_path = name

    sys_path = get_sys_path()
    if dotted_path is None:
        p, _, dotted_path = path.partition(os.path.sep)
        sys_path.insert(0, p)

    temp, sys.path = sys.path, sys_path
    try:
        __import__(dotted_path)
    except RuntimeError:
        if 'PySide' in dotted_path or 'PyQt' in dotted_path:
            # RuntimeError: the PyQt4.QtCore and PyQt5.QtCore modules both wrap
            # the QObject class.
            # See https://github.com/davidhalter/jedi/pull/483
            return None
        raise
    except ImportError:
        # If a module is "corrupt" or not really a Python module or whatever.
        debug.warning('Module %s not importable.', path)
        return None
    finally:
        sys.path = temp

    # Just access the cache after import, because of #59 as well as the very
    # complicated import structure of Python.
    module = sys.modules[dotted_path]

    return CompiledObject(module)


docstr_defaults = {
    'floating point number': 'float',
    'character': 'str',
    'integer': 'int',
    'dictionary': 'dict',
    'string': 'str',
}


def _parse_function_doc(doc):
    """
    Takes a function and returns the params and return value as a tuple.
    This is nothing more than a docstring parser.

    TODO docstrings like utime(path, (atime, mtime)) and a(b [, b]) -> None
    TODO docstrings like 'tuple of integers'
    """
    # parse round parentheses: def func(a, (b,c))
    try:
        count = 0
        start = doc.index('(')
        for i, s in enumerate(doc[start:]):
            if s == '(':
                count += 1
            elif s == ')':
                count -= 1
            if count == 0:
                end = start + i
                break
        param_str = doc[start + 1:end]
    except (ValueError, UnboundLocalError):
        # ValueError for doc.index
        # UnboundLocalError for undefined end in last line
        debug.dbg('no brackets found - no param')
        end = 0
        param_str = ''
    else:
        # remove square brackets, that show an optional param ( = None)
        def change_options(m):
            args = m.group(1).split(',')
            for i, a in enumerate(args):
                if a and '=' not in a:
                    args[i] += '=None'
            return ','.join(args)

        while True:
            param_str, changes = re.subn(r' ?\[([^\[\]]+)\]',
                                         change_options, param_str)
            if changes == 0:
                break
    param_str = param_str.replace('-', '_')  # see: isinstance.__doc__

    # parse return value
    r = re.search('-[>-]* ', doc[end:end + 7])
    if r is None:
        ret = ''
    else:
        index = end + r.end()
        # get result type, which can contain newlines
        pattern = re.compile(r'(,\n|[^\n-])+')
        ret_str = pattern.match(doc, index).group(0).strip()
        # New object -> object()
        ret_str = re.sub(r'[nN]ew (.*)', r'\1()', ret_str)

        ret = docstr_defaults.get(ret_str, ret_str)

    return param_str, ret


class Builtin(CompiledObject):
    @memoize_method
    def get_by_name(self, name):
        return self.names_dict[name][0].parent


def _a_generator(foo):
    """Used to have an object to return for generators."""
    yield 42
    yield foo


def _create_from_name(module, parent, name):
    faked = fake.get_faked(module.obj, parent.obj, name)
    # only functions are necessary.
    if faked is not None:
        faked.parent = parent
        return faked

    try:
        obj = getattr(parent.obj, name)
    except AttributeError:
        # happens e.g. in properties of
        # PyQt4.QtGui.QStyleOptionComboBox.currentText
        # -> just set it to None
        obj = None
    return CompiledObject(obj, parent)


builtin = Builtin(_builtins)
magic_function_class = CompiledObject(type(load_module), parent=builtin)
generator_obj = CompiledObject(_a_generator(1.0))
_type_names_dict = builtin.get_by_name('type').names_dict
none_obj = builtin.get_by_name('None')
false_obj = builtin.get_by_name('False')
true_obj = builtin.get_by_name('True')
object_obj = builtin.get_by_name('object')


def keyword_from_value(obj):
    if obj is None:
        return none_obj
    elif obj is False:
        return false_obj
    elif obj is True:
        return true_obj
    else:
        raise NotImplementedError


def compiled_objects_cache(func):
    def wrapper(evaluator, obj, parent=builtin, module=None):
        # Do a very cheap form of caching here.
        key = id(obj), id(parent), id(module)
        try:
            return evaluator.compiled_cache[key][0]
        except KeyError:
            result = func(evaluator, obj, parent, module)
            # Need to cache all of them, otherwise the id could be overwritten.
            evaluator.compiled_cache[key] = result, obj, parent, module
            return result
    return wrapper


@compiled_objects_cache
def create(evaluator, obj, parent=builtin, module=None):
    """
    A very weird interface class to this module. The more options provided the
    more acurate loading compiled objects is.
    """

    if not inspect.ismodule(obj):
        faked = fake.get_faked(module and module.obj, obj)
        if faked is not None:
            faked.parent = parent
            return faked

    try:
        if parent == builtin and obj.__module__ in ('builtins', '__builtin__'):
            return builtin.get_by_name(obj.__name__)
    except AttributeError:
        pass

    return CompiledObject(obj, parent)
