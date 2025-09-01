import inspect
import types
import traceback
import sys
import operator as op
from collections import namedtuple
import warnings
import re
import builtins
import typing
from pathlib import Path
from typing import Optional, Tuple

from erdos._vendor.jedi.inference.compiled.getattr_static import getattr_static

ALLOWED_GETITEM_TYPES = (str, list, tuple, bytes, bytearray, dict)

MethodDescriptorType = type(str.replace)
# These are not considered classes and access is granted even though they have
# a __class__ attribute.
NOT_CLASS_TYPES = (
    types.BuiltinFunctionType,
    types.CodeType,
    types.FrameType,
    types.FunctionType,
    types.GeneratorType,
    types.GetSetDescriptorType,
    types.LambdaType,
    types.MemberDescriptorType,
    types.MethodType,
    types.ModuleType,
    types.TracebackType,
    MethodDescriptorType,
    types.MappingProxyType,
    types.SimpleNamespace,
    types.DynamicClassAttribute,
)

# Those types don't exist in typing.
MethodDescriptorType = type(str.replace)
WrapperDescriptorType = type(set.__iter__)
# `object.__subclasshook__` is an already executed descriptor.
object_class_dict = type.__dict__["__dict__"].__get__(object)  # type: ignore[index]
ClassMethodDescriptorType = type(object_class_dict['__subclasshook__'])

_sentinel = object()

# Maps Python syntax to the operator module.
COMPARISON_OPERATORS = {
    '==': op.eq,
    '!=': op.ne,
    'is': op.is_,
    'is not': op.is_not,
    '<': op.lt,
    '<=': op.le,
    '>': op.gt,
    '>=': op.ge,
}

_OPERATORS = {
    '+': op.add,
    '-': op.sub,
}
_OPERATORS.update(COMPARISON_OPERATORS)

ALLOWED_DESCRIPTOR_ACCESS = (
    types.FunctionType,
    types.GetSetDescriptorType,
    types.MemberDescriptorType,
    MethodDescriptorType,
    WrapperDescriptorType,
    ClassMethodDescriptorType,
    staticmethod,
    classmethod,
)


def safe_getattr(obj, name, default=_sentinel):
    try:
        attr, is_get_descriptor = getattr_static(obj, name)
    except AttributeError:
        if default is _sentinel:
            raise
        return default
    else:
        if isinstance(attr, ALLOWED_DESCRIPTOR_ACCESS):
            # In case of descriptors that have get methods we cannot return
            # it's value, because that would mean code execution.
            # Since it's an isinstance call, code execution is still possible,
            # but this is not really a security feature, but much more of a
            # safety feature. Code execution is basically always possible when
            # a module is imported. This is here so people don't shoot
            # themselves in the foot.
            return getattr(obj, name)
    return attr


SignatureParam = namedtuple(
    'SignatureParam',
    'name has_default default default_string has_annotation annotation annotation_string kind_name'
)


def shorten_repr(func):
    def wrapper(self):
        r = func(self)
        if len(r) > 50:
            r = r[:50] + '..'
        return r
    return wrapper


def create_access(inference_state, obj):
    return inference_state.compiled_subprocess.get_or_create_access_handle(obj)


def load_module(inference_state, dotted_name, sys_path):
    temp, sys.path = sys.path, sys_path
    try:
        __import__(dotted_name)
    except ImportError:
        # If a module is "corrupt" or not really a Python module or whatever.
        warnings.warn(
            "Module %s not importable in path %s." % (dotted_name, sys_path),
            UserWarning,
            stacklevel=2,
        )
        return None
    except Exception:
        # Since __import__ pretty much makes code execution possible, just
        # catch any error here and print it.
        warnings.warn(
            "Cannot import:\n%s" % traceback.format_exc(), UserWarning, stacklevel=2
        )
        return None
    finally:
        sys.path = temp

    # Just access the cache after import, because of #59 as well as the very
    # complicated import structure of Python.
    module = sys.modules[dotted_name]
    return create_access_path(inference_state, module)


class AccessPath:
    def __init__(self, accesses):
        self.accesses = accesses


def create_access_path(inference_state, obj) -> AccessPath:
    access = create_access(inference_state, obj)
    return AccessPath(access.get_access_path_tuples())


def get_api_type(obj):
    if inspect.isclass(obj):
        return 'class'
    elif inspect.ismodule(obj):
        return 'module'
    elif inspect.isbuiltin(obj) or inspect.ismethod(obj) \
            or inspect.ismethoddescriptor(obj) or inspect.isfunction(obj):
        return 'function'
    # Everything else...
    return 'instance'


class DirectObjectAccess:
    def __init__(self, inference_state, obj):
        self._inference_state = inference_state
        self._obj = obj

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self.get_repr())

    def _create_access(self, obj):
        return create_access(self._inference_state, obj)

    def _create_access_path(self, obj) -> AccessPath:
        return create_access_path(self._inference_state, obj)

    def py__bool__(self):
        return bool(self._obj)

    def py__file__(self) -> Optional[Path]:
        try:
            return Path(self._obj.__file__)
        except AttributeError:
            return None

    def py__doc__(self):
        return inspect.getdoc(self._obj) or ''

    def py__name__(self):
        if not _is_class_instance(self._obj) or \
                inspect.ismethoddescriptor(self._obj):  # slots
            cls = self._obj
        else:
            try:
                cls = self._obj.__class__
            except AttributeError:
                # happens with numpy.core.umath._UFUNC_API (you get it
                # automatically by doing `import numpy`.
                return None

        try:
            return cls.__name__
        except AttributeError:
            return None

    def py__mro__accesses(self):
        return tuple(self._create_access_path(cls) for cls in self._obj.__mro__[1:])

    def py__getitem__all_values(self):
        if isinstance(self._obj, dict):
            return [self._create_access_path(v) for v in self._obj.values()]
        if isinstance(self._obj, (list, tuple)):
            return [self._create_access_path(v) for v in self._obj]

        if self.is_instance():
            cls = DirectObjectAccess(self._inference_state, self._obj.__class__)
            return cls.py__getitem__all_values()

        try:
            getitem = self._obj.__getitem__
        except AttributeError:
            pass
        else:
            annotation = DirectObjectAccess(self._inference_state, getitem).get_return_annotation()
            if annotation is not None:
                return [annotation]
        return None

    def py__simple_getitem__(self, index, *, safe=True):
        if safe and type(self._obj) not in ALLOWED_GETITEM_TYPES:
            # Get rid of side effects, we won't call custom `__getitem__`s.
            return None

        return self._create_access_path(self._obj[index])

    def py__iter__list(self):
        try:
            iter_method = self._obj.__iter__
        except AttributeError:
            return None
        else:
            p = DirectObjectAccess(self._inference_state, iter_method).get_return_annotation()
            if p is not None:
                return [p]

        if type(self._obj) not in ALLOWED_GETITEM_TYPES:
            # Get rid of side effects, we won't call custom `__getitem__`s.
            return []

        lst = []
        for i, part in enumerate(self._obj):
            if i > 20:
                # Should not go crazy with large iterators
                break
            lst.append(self._create_access_path(part))
        return lst

    def py__class__(self):
        return self._create_access_path(self._obj.__class__)

    def py__bases__(self):
        return [self._create_access_path(base) for base in self._obj.__bases__]

    def py__path__(self):
        paths = getattr(self._obj, '__path__', None)
        # Avoid some weird hacks that would just fail, because they cannot be
        # used by pickle.
        if not isinstance(paths, list) \
                or not all(isinstance(p, str) for p in paths):
            return None
        return paths

    @shorten_repr
    def get_repr(self):
        if inspect.ismodule(self._obj):
            return repr(self._obj)
        # Try to avoid execution of the property.
        if safe_getattr(self._obj, '__module__', default='') == 'builtins':
            return repr(self._obj)

        type_ = type(self._obj)
        if type_ == type:
            return type.__repr__(self._obj)

        if safe_getattr(type_, '__module__', default='') == 'builtins':
            # Allow direct execution of repr for builtins.
            return repr(self._obj)
        return object.__repr__(self._obj)

    def is_class(self):
        return inspect.isclass(self._obj)

    def is_function(self):
        return inspect.isfunction(self._obj) or inspect.ismethod(self._obj)

    def is_module(self):
        return inspect.ismodule(self._obj)

    def is_instance(self):
        return _is_class_instance(self._obj)

    def ismethoddescriptor(self):
        return inspect.ismethoddescriptor(self._obj)

    def get_qualified_names(self):
        def try_to_get_name(obj):
            return getattr(obj, '__qualname__', getattr(obj, '__name__', None))

        if self.is_module():
            return ()
        name = try_to_get_name(self._obj)
        if name is None:
            name = try_to_get_name(type(self._obj))
            if name is None:
                return ()
        return tuple(name.split('.'))

    def dir(self):
        return dir(self._obj)

    def has_iter(self):
        try:
            iter(self._obj)
            return True
        except TypeError:
            return False

    def is_allowed_getattr(self, name, safe=True) -> Tuple[bool, bool, Optional[AccessPath]]:
        # TODO this API is ugly.
        try:
            attr, is_get_descriptor = getattr_static(self._obj, name)
        except AttributeError:
            if not safe:
                # Unsafe is mostly used to check for __getattr__/__getattribute__.
                # getattr_static works for properties, but the underscore methods
                # are just ignored (because it's safer and avoids more code
                # execution). See also GH #1378.

                # Avoid warnings, see comment in the next function.
                with warnings.catch_warnings(record=True):
                    warnings.simplefilter("always")
                    try:
                        return hasattr(self._obj, name), False, None
                    except Exception:
                        # Obviously has an attribute (probably a property) that
                        # gets executed, so just avoid all exceptions here.
                        pass
            return False, False, None
        else:
            if is_get_descriptor and type(attr) not in ALLOWED_DESCRIPTOR_ACCESS:
                if isinstance(attr, property):
                    if hasattr(attr.fget, '__annotations__'):
                        a = DirectObjectAccess(self._inference_state, attr.fget)
                        return True, True, a.get_return_annotation()
                # In case of descriptors that have get methods we cannot return
                # it's value, because that would mean code execution.
                return True, True, None
        return True, False, None

    def getattr_paths(self, name, default=_sentinel):
        try:
            # Make sure no warnings are printed here, this is autocompletion,
            # warnings should not be shown. See also GH #1383.
            with warnings.catch_warnings(record=True):
                warnings.simplefilter("always")
                return_obj = getattr(self._obj, name)
        except Exception as e:
            if default is _sentinel:
                if isinstance(e, AttributeError):
                    # Happens e.g. in properties of
                    # PyQt4.QtGui.QStyleOptionComboBox.currentText
                    # -> just set it to None
                    raise
                # Just in case anything happens, return an AttributeError. It
                # should not crash.
                raise AttributeError
            return_obj = default
        access = self._create_access(return_obj)
        if inspect.ismodule(return_obj):
            return [access]

        try:
            module = return_obj.__module__
        except AttributeError:
            pass
        else:
            if module is not None and isinstance(module, str):
                try:
                    __import__(module)
                    # For some modules like _sqlite3, the __module__ for classes is
                    # different, in this case it's sqlite3. So we have to try to
                    # load that "original" module, because it's not loaded yet. If
                    # we don't do that, we don't really have a "parent" module and
                    # we would fall back to builtins.
                except ImportError:
                    pass

        module = inspect.getmodule(return_obj)
        if module is None:
            module = inspect.getmodule(type(return_obj))
            if module is None:
                module = builtins
        return [self._create_access(module), access]

    def get_safe_value(self):
        if type(self._obj) in (bool, bytes, float, int, str, slice) or self._obj is None:
            return self._obj
        raise ValueError("Object is type %s and not simple" % type(self._obj))

    def get_api_type(self):
        return get_api_type(self._obj)

    def get_array_type(self):
        if isinstance(self._obj, dict):
            return 'dict'
        return None

    def get_key_paths(self):
        def iter_partial_keys():
            # We could use list(keys()), but that might take a lot more memory.
            for (i, k) in enumerate(self._obj.keys()):
                # Limit key listing at some point. This is artificial, but this
                # way we don't get stalled because of slow completions
                if i > 50:
                    break
                yield k

        return [self._create_access_path(k) for k in iter_partial_keys()]

    def get_access_path_tuples(self):
        accesses = [create_access(self._inference_state, o) for o in self._get_objects_path()]
        return [(access.py__name__(), access) for access in accesses]

    def _get_objects_path(self):
        def get():
            obj = self._obj
            yield obj
            try:
                obj = obj.__objclass__
            except AttributeError:
                pass
            else:
                yield obj

            try:
                # Returns a dotted string path.
                imp_plz = obj.__module__
            except AttributeError:
                # Unfortunately in some cases like `int` there's no __module__
                if not inspect.ismodule(obj):
                    yield builtins
            else:
                if imp_plz is None:
                    # Happens for example in `(_ for _ in []).send.__module__`.
                    yield builtins
                else:
                    try:
                        yield sys.modules[imp_plz]
                    except KeyError:
                        # __module__ can be something arbitrary that doesn't exist.
                        yield builtins

        return list(reversed(list(get())))

    def execute_operation(self, other_access_handle, operator):
        other_access = other_access_handle.access
        op = _OPERATORS[operator]
        return self._create_access_path(op(self._obj, other_access._obj))

    def get_annotation_name_and_args(self):
        """
        Returns Tuple[Optional[str], Tuple[AccessPath, ...]]
        """
        name = None
        args = ()
        if safe_getattr(self._obj, '__module__', default='') == 'typing':
            m = re.match(r'typing.(\w+)\[', repr(self._obj))
            if m is not None:
                name = m.group(1)

                import typing
                if sys.version_info >= (3, 8):
                    args = typing.get_args(self._obj)
                else:
                    args = safe_getattr(self._obj, '__args__', default=None)
        return name, tuple(self._create_access_path(arg) for arg in args)

    def needs_type_completions(self):
        return inspect.isclass(self._obj) and self._obj != type

    def _annotation_to_str(self, annotation):
        return inspect.formatannotation(annotation)

    def get_signature_params(self):
        return [
            SignatureParam(
                name=p.name,
                has_default=p.default is not p.empty,
                default=self._create_access_path(p.default),
                default_string=repr(p.default),
                has_annotation=p.annotation is not p.empty,
                annotation=self._create_access_path(p.annotation),
                annotation_string=self._annotation_to_str(p.annotation),
                kind_name=str(p.kind)
            ) for p in self._get_signature().parameters.values()
        ]

    def _get_signature(self):
        obj = self._obj
        try:
            return inspect.signature(obj)
        except (RuntimeError, TypeError):
            # Reading the code of the function in Python 3.6 implies there are
            # at least these errors that might occur if something is wrong with
            # the signature. In that case we just want a simple escape for now.
            raise ValueError

    def get_return_annotation(self) -> Optional[AccessPath]:
        try:
            o = self._obj.__annotations__.get('return')
        except AttributeError:
            return None

        if o is None:
            return None

        try:
            o = typing.get_type_hints(self._obj).get('return')
        except Exception:
            pass

        return self._create_access_path(o)

    def negate(self):
        return self._create_access_path(-self._obj)

    def get_dir_infos(self):
        """
        Used to return a couple of infos that are needed when accessing the sub
        objects of an objects
        """
        tuples = dict(
            (name, self.is_allowed_getattr(name))
            for name in self.dir()
        )
        return self.needs_type_completions(), tuples


def _is_class_instance(obj):
    """Like inspect.* methods."""
    try:
        cls = obj.__class__
    except AttributeError:
        return False
    else:
        # The isinstance check for cls is just there so issubclass doesn't
        # raise an exception.
        return cls != type and isinstance(cls, type) and not issubclass(cls, NOT_CLASS_TYPES)
