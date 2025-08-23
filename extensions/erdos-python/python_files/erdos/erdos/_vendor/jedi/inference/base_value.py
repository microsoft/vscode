"""
Values are the "values" that Python would return. However Values are at the
same time also the "values" that a user is currently sitting in.

A ValueSet is typically used to specify the return of a function or any other
static analysis operation. In jedi there are always multiple returns and not
just one.
"""
from functools import reduce
from operator import add
from itertools import zip_longest

from erdos.erdos._vendor.parso.python.tree import Name

from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi.parser_utils import clean_scope_docstring
from erdos.erdos._vendor.jedi.inference.helpers import SimpleGetItemNotFound
from erdos.erdos._vendor.jedi.inference.utils import safe_property
from erdos.erdos._vendor.jedi.inference.cache import inference_state_as_method_param_cache
from erdos.erdos._vendor.jedi.cache import memoize_method

sentinel = object()


class HasNoContext(Exception):
    pass


class HelperValueMixin:
    def get_root_context(self):
        value = self
        if value.parent_context is None:
            return value.as_context()

        while True:
            if value.parent_context is None:
                return value
            value = value.parent_context

    def execute(self, arguments):
        return self.inference_state.execute(self, arguments=arguments)

    def execute_with_values(self, *value_list):
        from erdos.erdos._vendor.jedi.inference.arguments import ValuesArguments
        arguments = ValuesArguments([ValueSet([value]) for value in value_list])
        return self.inference_state.execute(self, arguments)

    def execute_annotation(self):
        return self.execute_with_values()

    def gather_annotation_classes(self):
        return ValueSet([self])

    def merge_types_of_iterate(self, contextualized_node=None, is_async=False):
        return ValueSet.from_sets(
            lazy_value.infer()
            for lazy_value in self.iterate(contextualized_node, is_async)
        )

    def _get_value_filters(self, name_or_str):
        origin_scope = name_or_str if isinstance(name_or_str, Name) else None
        yield from self.get_filters(origin_scope=origin_scope)
        # This covers the case where a stub files are incomplete.
        if self.is_stub():
            from erdos.erdos._vendor.jedi.inference.gradual.conversion import convert_values
            for c in convert_values(ValueSet({self})):
                yield from c.get_filters()

    def goto(self, name_or_str, name_context=None, analysis_errors=True):
        from erdos.erdos._vendor.jedi.inference import finder
        filters = self._get_value_filters(name_or_str)
        names = finder.filter_name(filters, name_or_str)
        debug.dbg('context.goto %s in (%s): %s', name_or_str, self, names)
        return names

    def py__getattribute__(self, name_or_str, name_context=None, position=None,
                           analysis_errors=True):
        """
        :param position: Position of the last statement -> tuple of line, column
        """
        if name_context is None:
            name_context = self
        names = self.goto(name_or_str, name_context, analysis_errors)
        values = ValueSet.from_sets(name.infer() for name in names)
        if not values:
            n = name_or_str.value if isinstance(name_or_str, Name) else name_or_str
            values = self.py__getattribute__alternatives(n)

        if not names and not values and analysis_errors:
            if isinstance(name_or_str, Name):
                from erdos.erdos._vendor.jedi.inference import analysis
                analysis.add_attribute_error(
                    name_context, self, name_or_str)
        debug.dbg('context.names_to_types: %s -> %s', names, values)
        return values

    def py__await__(self):
        await_value_set = self.py__getattribute__("__await__")
        if not await_value_set:
            debug.warning('Tried to run __await__ on value %s', self)
        return await_value_set.execute_with_values()

    def py__name__(self):
        return self.name.string_name

    def iterate(self, contextualized_node=None, is_async=False):
        debug.dbg('iterate %s', self)
        if is_async:
            from erdos.erdos._vendor.jedi.inference.lazy_value import LazyKnownValues
            # TODO if no __aiter__ values are there, error should be:
            # TypeError: 'async for' requires an object with __aiter__ method, got int
            return iter([
                LazyKnownValues(
                    self.py__getattribute__('__aiter__').execute_with_values()
                        .py__getattribute__('__anext__').execute_with_values()
                        .py__getattribute__('__await__').execute_with_values()
                        .py__stop_iteration_returns()
                )  # noqa: E124
            ])
        return self.py__iter__(contextualized_node)

    def is_sub_class_of(self, class_value):
        with debug.increase_indent_cm('subclass matching of %s <=> %s' % (self, class_value),
                                      color='BLUE'):
            for cls in self.py__mro__():
                if cls.is_same_class(class_value):
                    debug.dbg('matched subclass True', color='BLUE')
                    return True
            debug.dbg('matched subclass False', color='BLUE')
            return False

    def is_same_class(self, class2):
        # Class matching should prefer comparisons that are not this function.
        if type(class2).is_same_class != HelperValueMixin.is_same_class:
            return class2.is_same_class(self)
        return self == class2

    @memoize_method
    def as_context(self, *args, **kwargs):
        return self._as_context(*args, **kwargs)


class Value(HelperValueMixin):
    """
    To be implemented by subclasses.
    """
    tree_node = None
    # Possible values: None, tuple, list, dict and set. Here to deal with these
    # very important containers.
    array_type = None
    api_type = 'not_defined_please_report_bug'

    def __init__(self, inference_state, parent_context=None):
        self.inference_state = inference_state
        self.parent_context = parent_context

    def py__getitem__(self, index_value_set, contextualized_node):
        from erdos.erdos._vendor.jedi.inference import analysis
        # TODO this value is probably not right.
        analysis.add(
            contextualized_node.context,
            'type-error-not-subscriptable',
            contextualized_node.node,
            message="TypeError: '%s' object is not subscriptable" % self
        )
        return NO_VALUES

    def py__simple_getitem__(self, index):
        raise SimpleGetItemNotFound

    def py__iter__(self, contextualized_node=None):
        if contextualized_node is not None:
            from erdos.erdos._vendor.jedi.inference import analysis
            analysis.add(
                contextualized_node.context,
                'type-error-not-iterable',
                contextualized_node.node,
                message="TypeError: '%s' object is not iterable" % self)
        return iter([])

    def py__next__(self, contextualized_node=None):
        return self.py__iter__(contextualized_node)

    def get_signatures(self):
        return []

    def is_class(self):
        return False

    def is_class_mixin(self):
        return False

    def is_instance(self):
        return False

    def is_function(self):
        return False

    def is_module(self):
        return False

    def is_namespace(self):
        return False

    def is_compiled(self):
        return False

    def is_bound_method(self):
        return False

    def is_builtins_module(self):
        return False

    def py__bool__(self):
        """
        Since Wrapper is a super class for classes, functions and modules,
        the return value will always be true.
        """
        return True

    def py__doc__(self):
        try:
            self.tree_node.get_doc_node
        except AttributeError:
            return ''
        else:
            return clean_scope_docstring(self.tree_node)

    def get_safe_value(self, default=sentinel):
        if default is sentinel:
            raise ValueError("There exists no safe value for value %s" % self)
        return default

    def execute_operation(self, other, operator):
        debug.warning("%s not possible between %s and %s", operator, self, other)
        return NO_VALUES

    def py__call__(self, arguments):
        debug.warning("no execution possible %s", self)
        return NO_VALUES

    def py__stop_iteration_returns(self):
        debug.warning("Not possible to return the stop iterations of %s", self)
        return NO_VALUES

    def py__getattribute__alternatives(self, name_or_str):
        """
        For now a way to add values in cases like __getattr__.
        """
        return NO_VALUES

    def py__get__(self, instance, class_value):
        debug.warning("No __get__ defined on %s", self)
        return ValueSet([self])

    def py__get__on_class(self, calling_instance, instance, class_value):
        return NotImplemented

    def get_qualified_names(self):
        # Returns Optional[Tuple[str, ...]]
        return None

    def is_stub(self):
        # The root value knows if it's a stub or not.
        return self.parent_context.is_stub()

    def _as_context(self):
        raise HasNoContext

    @property
    def name(self):
        raise NotImplementedError

    def get_type_hint(self, add_class_info=True):
        return None

    def infer_type_vars(self, value_set):
        """
        When the current instance represents a type annotation, this method
        tries to find information about undefined type vars and returns a dict
        from type var name to value set.

        This is for example important to understand what `iter([1])` returns.
        According to typeshed, `iter` returns an `Iterator[_T]`:

            def iter(iterable: Iterable[_T]) -> Iterator[_T]: ...

        This functions would generate `int` for `_T` in this case, because it
        unpacks the `Iterable`.

        Parameters
        ----------

        `self`: represents the annotation of the current parameter to infer the
            value for. In the above example, this would initially be the
            `Iterable[_T]` of the `iterable` parameter and then, when recursing,
            just the `_T` generic parameter.

        `value_set`: represents the actual argument passed to the parameter
            we're inferred for, or (for recursive calls) their types. In the
            above example this would first be the representation of the list
            `[1]` and then, when recursing, just of `1`.
        """
        return {}


def iterate_values(values, contextualized_node=None, is_async=False):
    """
    Calls `iterate`, on all values but ignores the ordering and just returns
    all values that the iterate functions yield.
    """
    return ValueSet.from_sets(
        lazy_value.infer()
        for lazy_value in values.iterate(contextualized_node, is_async=is_async)
    )


class _ValueWrapperBase(HelperValueMixin):
    @safe_property
    def name(self):
        from erdos.erdos._vendor.jedi.inference.names import ValueName
        wrapped_name = self._wrapped_value.name
        if wrapped_name.tree_name is not None:
            return ValueName(self, wrapped_name.tree_name)
        else:
            from erdos.erdos._vendor.jedi.inference.compiled import CompiledValueName
            return CompiledValueName(self, wrapped_name.string_name)

    @classmethod
    @inference_state_as_method_param_cache()
    def create_cached(cls, inference_state, *args, **kwargs):
        return cls(*args, **kwargs)

    def __getattr__(self, name):
        assert name != '_wrapped_value', 'Problem with _get_wrapped_value'
        return getattr(self._wrapped_value, name)


class LazyValueWrapper(_ValueWrapperBase):
    @safe_property
    @memoize_method
    def _wrapped_value(self):
        with debug.increase_indent_cm('Resolve lazy value wrapper'):
            return self._get_wrapped_value()

    def __repr__(self):
        return '<%s>' % (self.__class__.__name__)

    def _get_wrapped_value(self):
        raise NotImplementedError


class ValueWrapper(_ValueWrapperBase):
    def __init__(self, wrapped_value):
        self._wrapped_value = wrapped_value

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, self._wrapped_value)


class TreeValue(Value):
    def __init__(self, inference_state, parent_context, tree_node):
        super().__init__(inference_state, parent_context)
        self.tree_node = tree_node

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.tree_node)


class ContextualizedNode:
    def __init__(self, context, node):
        self.context = context
        self.node = node

    def get_root_context(self):
        return self.context.get_root_context()

    def infer(self):
        return self.context.infer_node(self.node)

    def __repr__(self):
        return '<%s: %s in %s>' % (self.__class__.__name__, self.node, self.context)


def _getitem(value, index_values, contextualized_node):
    # The actual getitem call.
    result = NO_VALUES
    unused_values = set()
    for index_value in index_values:
        index = index_value.get_safe_value(default=None)
        if type(index) in (float, int, str, slice, bytes):
            try:
                result |= value.py__simple_getitem__(index)
                continue
            except SimpleGetItemNotFound:
                pass

        unused_values.add(index_value)

    # The index was somehow not good enough or simply a wrong type.
    # Therefore we now iterate through all the values and just take
    # all results.
    if unused_values or not index_values:
        result |= value.py__getitem__(
            ValueSet(unused_values),
            contextualized_node
        )
    debug.dbg('py__getitem__ result: %s', result)
    return result


class ValueSet:
    def __init__(self, iterable):
        self._set = frozenset(iterable)
        for value in iterable:
            assert not isinstance(value, ValueSet)

    @classmethod
    def _from_frozen_set(cls, frozenset_):
        self = cls.__new__(cls)
        self._set = frozenset_
        return self

    @classmethod
    def from_sets(cls, sets):
        """
        Used to work with an iterable of set.
        """
        aggregated = set()
        for set_ in sets:
            if isinstance(set_, ValueSet):
                aggregated |= set_._set
            else:
                aggregated |= frozenset(set_)
        return cls._from_frozen_set(frozenset(aggregated))

    def __or__(self, other):
        return self._from_frozen_set(self._set | other._set)

    def __and__(self, other):
        return self._from_frozen_set(self._set & other._set)

    def __iter__(self):
        return iter(self._set)

    def __bool__(self):
        return bool(self._set)

    def __len__(self):
        return len(self._set)

    def __repr__(self):
        return 'S{%s}' % (', '.join(str(s) for s in self._set))

    def filter(self, filter_func):
        return self.__class__(filter(filter_func, self._set))

    def __getattr__(self, name):
        def mapper(*args, **kwargs):
            return self.from_sets(
                getattr(value, name)(*args, **kwargs)
                for value in self._set
            )
        return mapper

    def __eq__(self, other):
        return self._set == other._set

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash(self._set)

    def py__class__(self):
        return ValueSet(c.py__class__() for c in self._set)

    def iterate(self, contextualized_node=None, is_async=False):
        from erdos.erdos._vendor.jedi.inference.lazy_value import get_merged_lazy_value
        type_iters = [c.iterate(contextualized_node, is_async=is_async) for c in self._set]
        for lazy_values in zip_longest(*type_iters):
            yield get_merged_lazy_value(
                [l for l in lazy_values if l is not None]
            )

    def execute(self, arguments):
        return ValueSet.from_sets(c.inference_state.execute(c, arguments) for c in self._set)

    def execute_with_values(self, *args, **kwargs):
        return ValueSet.from_sets(c.execute_with_values(*args, **kwargs) for c in self._set)

    def goto(self, *args, **kwargs):
        return reduce(add, [c.goto(*args, **kwargs) for c in self._set], [])

    def py__getattribute__(self, *args, **kwargs):
        return ValueSet.from_sets(c.py__getattribute__(*args, **kwargs) for c in self._set)

    def get_item(self, *args, **kwargs):
        return ValueSet.from_sets(_getitem(c, *args, **kwargs) for c in self._set)

    def try_merge(self, function_name):
        value_set = self.__class__([])
        for c in self._set:
            try:
                method = getattr(c, function_name)
            except AttributeError:
                pass
            else:
                value_set |= method()
        return value_set

    def gather_annotation_classes(self):
        return ValueSet.from_sets([c.gather_annotation_classes() for c in self._set])

    def get_signatures(self):
        return [sig for c in self._set for sig in c.get_signatures()]

    def get_type_hint(self, add_class_info=True):
        t = [v.get_type_hint(add_class_info=add_class_info) for v in self._set]
        type_hints = sorted(filter(None, t))
        if len(type_hints) == 1:
            return type_hints[0]

        optional = 'None' in type_hints
        if optional:
            type_hints.remove('None')

        if len(type_hints) == 0:
            return None
        elif len(type_hints) == 1:
            s = type_hints[0]
        else:
            s = 'Union[%s]' % ', '.join(type_hints)
        if optional:
            s = 'Optional[%s]' % s
        return s

    def infer_type_vars(self, value_set):
        # Circular
        from erdos.erdos._vendor.jedi.inference.gradual.annotation import merge_type_var_dicts

        type_var_dict = {}
        for value in self._set:
            merge_type_var_dicts(
                type_var_dict,
                value.infer_type_vars(value_set),
            )
        return type_var_dict


NO_VALUES = ValueSet([])


def iterator_to_value_set(func):
    def wrapper(*args, **kwargs):
        return ValueSet(func(*args, **kwargs))

    return wrapper
