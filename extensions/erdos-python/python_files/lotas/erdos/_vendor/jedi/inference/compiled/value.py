"""
Imitate the parser representation.
"""
import re
from functools import partial
from inspect import Parameter
from pathlib import Path
from typing import Optional

from jedi import debug
from lotas.erdos._vendor.jedi.inference.utils import to_list
from lotas.erdos._vendor.jedi.cache import memoize_method
from lotas.erdos._vendor.jedi.inference.filters import AbstractFilter
from lotas.erdos._vendor.jedi.inference.names import AbstractNameDefinition, ValueNameMixin, \
    ParamNameInterface
from lotas.erdos._vendor.jedi.inference.base_value import Value, ValueSet, NO_VALUES
from lotas.erdos._vendor.jedi.inference.lazy_value import LazyKnownValue
from lotas.erdos._vendor.jedi.inference.compiled.access import _sentinel
from lotas.erdos._vendor.jedi.inference.cache import inference_state_function_cache
from lotas.erdos._vendor.jedi.inference.helpers import reraise_getitem_errors
from lotas.erdos._vendor.jedi.inference.signature import BuiltinSignature
from lotas.erdos._vendor.jedi.inference.context import CompiledContext, CompiledModuleContext


class CheckAttribute:
    """Raises :exc:`AttributeError` if the attribute X is not available."""
    def __init__(self, check_name=None):
        # Remove the py in front of e.g. py__call__.
        self.check_name = check_name

    def __call__(self, func):
        self.func = func
        if self.check_name is None:
            self.check_name = func.__name__[2:]
        return self

    def __get__(self, instance, owner):
        if instance is None:
            return self

        # This might raise an AttributeError. That's wanted.
        instance.access_handle.getattr_paths(self.check_name)
        return partial(self.func, instance)


class CompiledValue(Value):
    def __init__(self, inference_state, access_handle, parent_context=None):
        super().__init__(inference_state, parent_context)
        self.access_handle = access_handle

    def py__call__(self, arguments):
        return_annotation = self.access_handle.get_return_annotation()
        if return_annotation is not None:
            return create_from_access_path(
                self.inference_state,
                return_annotation
            ).execute_annotation()

        try:
            self.access_handle.getattr_paths('__call__')
        except AttributeError:
            return super().py__call__(arguments)
        else:
            if self.access_handle.is_class():
                from lotas.erdos._vendor.jedi.inference.value import CompiledInstance
                return ValueSet([
                    CompiledInstance(self.inference_state, self.parent_context, self, arguments)
                ])
            else:
                return ValueSet(self._execute_function(arguments))

    @CheckAttribute()
    def py__class__(self):
        return create_from_access_path(self.inference_state, self.access_handle.py__class__())

    @CheckAttribute()
    def py__mro__(self):
        return (self,) + tuple(
            create_from_access_path(self.inference_state, access)
            for access in self.access_handle.py__mro__accesses()
        )

    @CheckAttribute()
    def py__bases__(self):
        return tuple(
            create_from_access_path(self.inference_state, access)
            for access in self.access_handle.py__bases__()
        )

    def get_qualified_names(self):
        return self.access_handle.get_qualified_names()

    def py__bool__(self):
        return self.access_handle.py__bool__()

    def is_class(self):
        return self.access_handle.is_class()

    def is_function(self):
        return self.access_handle.is_function()

    def is_module(self):
        return self.access_handle.is_module()

    def is_compiled(self):
        return True

    def is_stub(self):
        return False

    def is_instance(self):
        return self.access_handle.is_instance()

    def py__doc__(self):
        return self.access_handle.py__doc__()

    @to_list
    def get_param_names(self):
        try:
            signature_params = self.access_handle.get_signature_params()
        except ValueError:  # Has no signature
            params_str, ret = self._parse_function_doc()
            if not params_str:
                tokens = []
            else:
                tokens = params_str.split(',')
            if self.access_handle.ismethoddescriptor():
                tokens.insert(0, 'self')
            for p in tokens:
                name, _, default = p.strip().partition('=')
                yield UnresolvableParamName(self, name, default)
        else:
            for signature_param in signature_params:
                yield SignatureParamName(self, signature_param)

    def get_signatures(self):
        _, return_string = self._parse_function_doc()
        return [BuiltinSignature(self, return_string)]

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.access_handle.get_repr())

    @memoize_method
    def _parse_function_doc(self):
        doc = self.py__doc__()
        if doc is None:
            return '', ''

        return _parse_function_doc(doc)

    @property
    def api_type(self):
        return self.access_handle.get_api_type()

    def get_filters(self, is_instance=False, origin_scope=None):
        yield self._ensure_one_filter(is_instance)

    @memoize_method
    def _ensure_one_filter(self, is_instance):
        return CompiledValueFilter(self.inference_state, self, is_instance)

    def py__simple_getitem__(self, index):
        with reraise_getitem_errors(IndexError, KeyError, TypeError):
            try:
                access = self.access_handle.py__simple_getitem__(
                    index,
                    safe=not self.inference_state.allow_unsafe_executions
                )
            except AttributeError:
                return super().py__simple_getitem__(index)
        if access is None:
            return super().py__simple_getitem__(index)

        return ValueSet([create_from_access_path(self.inference_state, access)])

    def py__getitem__(self, index_value_set, contextualized_node):
        all_access_paths = self.access_handle.py__getitem__all_values()
        if all_access_paths is None:
            # This means basically that no __getitem__ has been defined on this
            # object.
            return super().py__getitem__(index_value_set, contextualized_node)
        return ValueSet(
            create_from_access_path(self.inference_state, access)
            for access in all_access_paths
        )

    def py__iter__(self, contextualized_node=None):
        if not self.access_handle.has_iter():
            yield from super().py__iter__(contextualized_node)

        access_path_list = self.access_handle.py__iter__list()
        if access_path_list is None:
            # There is no __iter__ method on this object.
            return

        for access in access_path_list:
            yield LazyKnownValue(create_from_access_path(self.inference_state, access))

    def py__name__(self):
        return self.access_handle.py__name__()

    @property
    def name(self):
        name = self.py__name__()
        if name is None:
            name = self.access_handle.get_repr()
        return CompiledValueName(self, name)

    def _execute_function(self, params):
        from lotas.erdos._vendor.jedi.inference import docstrings
        from lotas.erdos._vendor.jedi.inference.compiled import builtin_from_name
        if self.api_type != 'function':
            return

        for name in self._parse_function_doc()[1].split():
            try:
                # TODO wtf is this? this is exactly the same as the thing
                # below. It uses getattr as well.
                self.inference_state.builtins_module.access_handle.getattr_paths(name)
            except AttributeError:
                continue
            else:
                bltn_obj = builtin_from_name(self.inference_state, name)
                yield from self.inference_state.execute(bltn_obj, params)
        yield from docstrings.infer_return_types(self)

    def get_safe_value(self, default=_sentinel):
        try:
            return self.access_handle.get_safe_value()
        except ValueError:
            if default == _sentinel:
                raise
            return default

    def execute_operation(self, other, operator):
        try:
            return ValueSet([create_from_access_path(
                self.inference_state,
                self.access_handle.execute_operation(other.access_handle, operator)
            )])
        except TypeError:
            return NO_VALUES

    def execute_annotation(self):
        if self.access_handle.get_repr() == 'None':
            # None as an annotation doesn't need to be executed.
            return ValueSet([self])

        name, args = self.access_handle.get_annotation_name_and_args()
        arguments = [
            ValueSet([create_from_access_path(self.inference_state, path)])
            for path in args
        ]
        if name == 'Union':
            return ValueSet.from_sets(arg.execute_annotation() for arg in arguments)
        elif name:
            # While with_generics only exists on very specific objects, we
            # should probably be fine, because we control all the typing
            # objects.
            return ValueSet([
                v.with_generics(arguments)
                for v in self.inference_state.typing_module.py__getattribute__(name)
            ]).execute_annotation()
        return super().execute_annotation()

    def negate(self):
        return create_from_access_path(self.inference_state, self.access_handle.negate())

    def get_metaclasses(self):
        return NO_VALUES

    def _as_context(self):
        return CompiledContext(self)

    @property
    def array_type(self):
        return self.access_handle.get_array_type()

    def get_key_values(self):
        return [
            create_from_access_path(self.inference_state, k)
            for k in self.access_handle.get_key_paths()
        ]

    def get_type_hint(self, add_class_info=True):
        if self.access_handle.get_repr() in ('None', "<class 'NoneType'>"):
            return 'None'
        return None


class CompiledModule(CompiledValue):
    file_io = None  # For modules

    def _as_context(self):
        return CompiledModuleContext(self)

    def py__path__(self):
        return self.access_handle.py__path__()

    def is_package(self):
        return self.py__path__() is not None

    @property
    def string_names(self):
        # For modules
        name = self.py__name__()
        if name is None:
            return ()
        return tuple(name.split('.'))

    def py__file__(self) -> Optional[Path]:
        return self.access_handle.py__file__()  # type: ignore[no-any-return]


class CompiledName(AbstractNameDefinition):
    def __init__(self, inference_state, parent_value, name, is_descriptor):
        self._inference_state = inference_state
        self.parent_context = parent_value.as_context()
        self._parent_value = parent_value
        self.string_name = name
        self.is_descriptor = is_descriptor

    def py__doc__(self):
        return self.infer_compiled_value().py__doc__()

    def _get_qualified_names(self):
        parent_qualified_names = self.parent_context.get_qualified_names()
        if parent_qualified_names is None:
            return None
        return parent_qualified_names + (self.string_name,)

    def get_defining_qualified_value(self):
        context = self.parent_context
        if context.is_module() or context.is_class():
            return self.parent_context.get_value()  # Might be None

        return None

    def __repr__(self):
        try:
            name = self.parent_context.name  # __name__ is not defined all the time
        except AttributeError:
            name = None
        return '<%s: (%s).%s>' % (self.__class__.__name__, name, self.string_name)

    @property
    def api_type(self):
        if self.is_descriptor:
            # In case of properties we want to avoid executions as much as
            # possible. Since the api_type can be wrong for other reasons
            # anyway, we just return instance here.
            return "instance"
        return self.infer_compiled_value().api_type

    def infer(self):
        return ValueSet([self.infer_compiled_value()])

    @memoize_method
    def infer_compiled_value(self):
        return create_from_name(self._inference_state, self._parent_value, self.string_name)


class SignatureParamName(ParamNameInterface, AbstractNameDefinition):
    def __init__(self, compiled_value, signature_param):
        self.parent_context = compiled_value.parent_context
        self._signature_param = signature_param

    @property
    def string_name(self):
        return self._signature_param.name

    def to_string(self):
        s = self._kind_string() + self.string_name
        if self._signature_param.has_annotation:
            s += ': ' + self._signature_param.annotation_string
        if self._signature_param.has_default:
            s += '=' + self._signature_param.default_string
        return s

    def get_kind(self):
        return getattr(Parameter, self._signature_param.kind_name)

    def infer(self):
        p = self._signature_param
        inference_state = self.parent_context.inference_state
        values = NO_VALUES
        if p.has_default:
            values = ValueSet([create_from_access_path(inference_state, p.default)])
        if p.has_annotation:
            annotation = create_from_access_path(inference_state, p.annotation)
            values |= annotation.execute_with_values()
        return values


class UnresolvableParamName(ParamNameInterface, AbstractNameDefinition):
    def __init__(self, compiled_value, name, default):
        self.parent_context = compiled_value.parent_context
        self.string_name = name
        self._default = default

    def get_kind(self):
        return Parameter.POSITIONAL_ONLY

    def to_string(self):
        string = self.string_name
        if self._default:
            string += '=' + self._default
        return string

    def infer(self):
        return NO_VALUES


class CompiledValueName(ValueNameMixin, AbstractNameDefinition):
    def __init__(self, value, name):
        self.string_name = name
        self._value = value
        self.parent_context = value.parent_context


class EmptyCompiledName(AbstractNameDefinition):
    """
    Accessing some names will raise an exception. To avoid not having any
    completions, just give Jedi the option to return this object. It infers to
    nothing.
    """
    def __init__(self, inference_state, name):
        self.parent_context = inference_state.builtins_module
        self.string_name = name

    def infer(self):
        return NO_VALUES


class CompiledValueFilter(AbstractFilter):
    def __init__(self, inference_state, compiled_value, is_instance=False):
        self._inference_state = inference_state
        self.compiled_value = compiled_value
        self.is_instance = is_instance

    def get(self, name):
        access_handle = self.compiled_value.access_handle
        safe = not self._inference_state.allow_unsafe_executions
        return self._get(
            name,
            lambda name: access_handle.is_allowed_getattr(name, safe=safe),
            lambda name: name in access_handle.dir(),
            check_has_attribute=True
        )

    def _get(self, name, allowed_getattr_callback, in_dir_callback, check_has_attribute=False):
        """
        To remove quite a few access calls we introduced the callback here.
        """
        has_attribute, is_descriptor, property_return_annotation = allowed_getattr_callback(
            name,
        )
        if property_return_annotation is not None:
            values = create_from_access_path(
                self._inference_state,
                property_return_annotation
            ).execute_annotation()
            if values:
                return [CompiledValueName(v, name) for v in values]

        if check_has_attribute and not has_attribute:
            return []

        if (is_descriptor or not has_attribute) \
                and not self._inference_state.allow_unsafe_executions:
            return [self._get_cached_name(name, is_empty=True)]

        if self.is_instance and not in_dir_callback(name):
            return []
        return [self._get_cached_name(name, is_descriptor=is_descriptor)]

    @memoize_method
    def _get_cached_name(self, name, is_empty=False, *, is_descriptor=False):
        if is_empty:
            return EmptyCompiledName(self._inference_state, name)
        else:
            return self._create_name(name, is_descriptor=is_descriptor)

    def values(self):
        from lotas.erdos._vendor.jedi.inference.compiled import builtin_from_name
        names = []
        needs_type_completions, dir_infos = self.compiled_value.access_handle.get_dir_infos()
        # We could use `safe=False` here as well, especially as a parameter to
        # get_dir_infos. But this would lead to a lot of property executions
        # that are probably not wanted. The drawback for this is that we
        # have a different name for `get` and `values`. For `get` we always
        # execute.
        for name in dir_infos:
            names += self._get(
                name,
                lambda name: dir_infos[name],
                lambda name: name in dir_infos,
            )

        # ``dir`` doesn't include the type names.
        if not self.is_instance and needs_type_completions:
            for filter in builtin_from_name(self._inference_state, 'type').get_filters():
                names += filter.values()
        return names

    def _create_name(self, name, is_descriptor):
        return CompiledName(
            self._inference_state,
            self.compiled_value,
            name,
            is_descriptor,
        )

    def __repr__(self):
        return "<%s: %s>" % (self.__class__.__name__, self.compiled_value)


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


def create_from_name(inference_state, compiled_value, name):
    access_paths = compiled_value.access_handle.getattr_paths(name, default=None)

    value = None
    for access_path in access_paths:
        value = create_cached_compiled_value(
            inference_state,
            access_path,
            parent_context=None if value is None else value.as_context(),
        )
    return value


def _normalize_create_args(func):
    """The cache doesn't care about keyword vs. normal args."""
    def wrapper(inference_state, obj, parent_context=None):
        return func(inference_state, obj, parent_context)
    return wrapper


def create_from_access_path(inference_state, access_path):
    value = None
    for name, access in access_path.accesses:
        value = create_cached_compiled_value(
            inference_state,
            access,
            parent_context=None if value is None else value.as_context()
        )
    return value


@_normalize_create_args
@inference_state_function_cache()
def create_cached_compiled_value(inference_state, access_handle, parent_context):
    assert not isinstance(parent_context, CompiledValue)
    if parent_context is None:
        cls = CompiledModule
    else:
        cls = CompiledValue
    return cls(inference_state, access_handle, parent_context)
