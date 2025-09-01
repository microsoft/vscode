"""
Filters are objects that you can use to filter names in different scopes. They
are needed for name resolution.
"""
from abc import abstractmethod
from typing import List, MutableMapping, Type
import weakref

from erdos._vendor.parso.tree import search_ancestor
from erdos._vendor.parso.python.tree import Name, UsedNamesMapping

from erdos._vendor.jedi.inference import flow_analysis
from erdos._vendor.jedi.inference.base_value import ValueSet, ValueWrapper, \
    LazyValueWrapper
from erdos._vendor.jedi.parser_utils import get_cached_parent_scope, get_parso_cache_node
from erdos._vendor.jedi.inference.utils import to_list
from erdos._vendor.jedi.inference.names import TreeNameDefinition, ParamName, \
    AnonymousParamName, AbstractNameDefinition, NameWrapper

_definition_name_cache: MutableMapping[UsedNamesMapping, List[Name]]
_definition_name_cache = weakref.WeakKeyDictionary()


class AbstractFilter:
    _until_position = None

    def _filter(self, names):
        if self._until_position is not None:
            return [n for n in names if n.start_pos < self._until_position]
        return names

    @abstractmethod
    def get(self, name):
        raise NotImplementedError

    @abstractmethod
    def values(self):
        raise NotImplementedError


class FilterWrapper:
    name_wrapper_class: Type[NameWrapper]

    def __init__(self, wrapped_filter):
        self._wrapped_filter = wrapped_filter

    def wrap_names(self, names):
        return [self.name_wrapper_class(name) for name in names]

    def get(self, name):
        return self.wrap_names(self._wrapped_filter.get(name))

    def values(self):
        return self.wrap_names(self._wrapped_filter.values())


def _get_definition_names(parso_cache_node, used_names, name_key):
    if parso_cache_node is None:
        names = used_names.get(name_key, ())
        return tuple(name for name in names if name.is_definition(include_setitem=True))

    try:
        for_module = _definition_name_cache[parso_cache_node]
    except KeyError:
        for_module = _definition_name_cache[parso_cache_node] = {}

    try:
        return for_module[name_key]
    except KeyError:
        names = used_names.get(name_key, ())
        result = for_module[name_key] = tuple(
            name for name in names if name.is_definition(include_setitem=True)
        )
        return result


class _AbstractUsedNamesFilter(AbstractFilter):
    name_class = TreeNameDefinition

    def __init__(self, parent_context, node_context=None):
        if node_context is None:
            node_context = parent_context
        self._node_context = node_context
        self._parser_scope = node_context.tree_node
        module_context = node_context.get_root_context()
        # It is quite hacky that we have to use that. This is for caching
        # certain things with a WeakKeyDictionary. However, parso intentionally
        # uses slots (to save memory) and therefore we end up with having to
        # have a weak reference to the object that caches the tree.
        #
        # Previously we have tried to solve this by using a weak reference onto
        # used_names. However that also does not work, because it has a
        # reference from the module, which itself is referenced by any node
        # through parents.
        path = module_context.py__file__()
        if path is None:
            # If the path is None, there is no guarantee that parso caches it.
            self._parso_cache_node = None
        else:
            self._parso_cache_node = get_parso_cache_node(
                module_context.inference_state.latest_grammar
                if module_context.is_stub() else module_context.inference_state.grammar,
                path
            )
        self._used_names = module_context.tree_node.get_used_names()
        self.parent_context = parent_context

    def get(self, name):
        return self._convert_names(self._filter(
            _get_definition_names(self._parso_cache_node, self._used_names, name),
        ))

    def _convert_names(self, names):
        return [self.name_class(self.parent_context, name) for name in names]

    def values(self):
        return self._convert_names(
            name
            for name_key in self._used_names
            for name in self._filter(
                _get_definition_names(self._parso_cache_node, self._used_names, name_key),
            )
        )

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.parent_context)


class ParserTreeFilter(_AbstractUsedNamesFilter):
    def __init__(self, parent_context, node_context=None, until_position=None,
                 origin_scope=None):
        """
        node_context is an option to specify a second value for use cases
        like the class mro where the parent class of a new name would be the
        value, but for some type inference it's important to have a local
        value of the other classes.
        """
        super().__init__(parent_context, node_context)
        self._origin_scope = origin_scope
        self._until_position = until_position

    def _filter(self, names):
        names = super()._filter(names)
        names = [n for n in names if self._is_name_reachable(n)]
        return list(self._check_flows(names))

    def _is_name_reachable(self, name):
        parent = name.parent
        if parent.type == 'trailer':
            return False
        base_node = parent if parent.type in ('classdef', 'funcdef') else name
        return get_cached_parent_scope(self._parso_cache_node, base_node) == self._parser_scope

    def _check_flows(self, names):
        for name in sorted(names, key=lambda name: name.start_pos, reverse=True):
            check = flow_analysis.reachability_check(
                context=self._node_context,
                value_scope=self._parser_scope,
                node=name,
                origin_scope=self._origin_scope
            )
            if check is not flow_analysis.UNREACHABLE:
                yield name

            if check is flow_analysis.REACHABLE:
                break


class _FunctionExecutionFilter(ParserTreeFilter):
    def __init__(self, parent_context, function_value, until_position, origin_scope):
        super().__init__(
            parent_context,
            until_position=until_position,
            origin_scope=origin_scope,
        )
        self._function_value = function_value

    def _convert_param(self, param, name):
        raise NotImplementedError

    @to_list
    def _convert_names(self, names):
        for name in names:
            param = search_ancestor(name, 'param')
            # Here we don't need to check if the param is a default/annotation,
            # because those are not definitions and never make it to this
            # point.
            if param:
                yield self._convert_param(param, name)
            else:
                yield TreeNameDefinition(self.parent_context, name)


class FunctionExecutionFilter(_FunctionExecutionFilter):
    def __init__(self, *args, arguments, **kwargs):
        super().__init__(*args, **kwargs)
        self._arguments = arguments

    def _convert_param(self, param, name):
        return ParamName(self._function_value, name, self._arguments)


class AnonymousFunctionExecutionFilter(_FunctionExecutionFilter):
    def _convert_param(self, param, name):
        return AnonymousParamName(self._function_value, name)


class GlobalNameFilter(_AbstractUsedNamesFilter):
    def get(self, name):
        try:
            names = self._used_names[name]
        except KeyError:
            return []
        return self._convert_names(self._filter(names))

    @to_list
    def _filter(self, names):
        for name in names:
            if name.parent.type == 'global_stmt':
                yield name

    def values(self):
        return self._convert_names(
            name for name_list in self._used_names.values()
            for name in self._filter(name_list)
        )


class DictFilter(AbstractFilter):
    def __init__(self, dct):
        self._dct = dct

    def get(self, name):
        try:
            value = self._convert(name, self._dct[name])
        except KeyError:
            return []
        else:
            return list(self._filter([value]))

    def values(self):
        def yielder():
            for item in self._dct.items():
                try:
                    yield self._convert(*item)
                except KeyError:
                    pass
        return self._filter(yielder())

    def _convert(self, name, value):
        return value

    def __repr__(self):
        keys = ', '.join(self._dct.keys())
        return '<%s: for {%s}>' % (self.__class__.__name__, keys)


class MergedFilter:
    def __init__(self, *filters):
        self._filters = filters

    def get(self, name):
        return [n for filter in self._filters for n in filter.get(name)]

    def values(self):
        return [n for filter in self._filters for n in filter.values()]

    def __repr__(self):
        return '%s(%s)' % (self.__class__.__name__, ', '.join(str(f) for f in self._filters))


class _BuiltinMappedMethod(ValueWrapper):
    """``Generator.__next__`` ``dict.values`` methods and so on."""
    api_type = 'function'

    def __init__(self, value, method, builtin_func):
        super().__init__(builtin_func)
        self._value = value
        self._method = method

    def py__call__(self, arguments):
        # TODO add TypeError if params are given/or not correct.
        return self._method(self._value, arguments)


class SpecialMethodFilter(DictFilter):
    """
    A filter for methods that are defined in this module on the corresponding
    classes like Generator (for __next__, etc).
    """
    class SpecialMethodName(AbstractNameDefinition):
        api_type = 'function'

        def __init__(self, parent_context, string_name, callable_, builtin_value):
            self.parent_context = parent_context
            self.string_name = string_name
            self._callable = callable_
            self._builtin_value = builtin_value

        def infer(self):
            for filter in self._builtin_value.get_filters():
                # We can take the first index, because on builtin methods there's
                # always only going to be one name. The same is true for the
                # inferred values.
                for name in filter.get(self.string_name):
                    builtin_func = next(iter(name.infer()))
                    break
                else:
                    continue
                break
            return ValueSet([
                _BuiltinMappedMethod(self.parent_context, self._callable, builtin_func)
            ])

    def __init__(self, value, dct, builtin_value):
        super().__init__(dct)
        self.value = value
        self._builtin_value = builtin_value
        """
        This value is what will be used to introspect the name, where as the
        other value will be used to execute the function.

        We distinguish, because we have to.
        """

    def _convert(self, name, value):
        return self.SpecialMethodName(self.value, name, value, self._builtin_value)


class _OverwriteMeta(type):
    def __init__(cls, name, bases, dct):
        super().__init__(name, bases, dct)

        base_dct = {}
        for base_cls in reversed(cls.__bases__):
            try:
                base_dct.update(base_cls.overwritten_methods)
            except AttributeError:
                pass

        for func in cls.__dict__.values():
            try:
                base_dct.update(func.registered_overwritten_methods)
            except AttributeError:
                pass
        cls.overwritten_methods = base_dct


class _AttributeOverwriteMixin:
    def get_filters(self, *args, **kwargs):
        yield SpecialMethodFilter(self, self.overwritten_methods, self._wrapped_value)
        yield from self._wrapped_value.get_filters(*args, **kwargs)


class LazyAttributeOverwrite(_AttributeOverwriteMixin, LazyValueWrapper,
                             metaclass=_OverwriteMeta):
    def __init__(self, inference_state):
        self.inference_state = inference_state


class AttributeOverwrite(_AttributeOverwriteMixin, ValueWrapper,
                         metaclass=_OverwriteMeta):
    pass


def publish_method(method_name):
    def decorator(func):
        dct = func.__dict__.setdefault('registered_overwritten_methods', {})
        dct[method_name] = func
        return func
    return decorator
