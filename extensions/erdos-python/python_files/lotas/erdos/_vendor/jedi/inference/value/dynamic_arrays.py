"""
A module to deal with stuff like `list.append` and `set.add`.

Array modifications
*******************

If the content of an array (``set``/``list``) is requested somewhere, the
current module will be checked for appearances of ``arr.append``,
``arr.insert``, etc.  If the ``arr`` name points to an actual array, the
content will be added

This can be really cpu intensive, as you can imagine. Because |jedi| has to
follow **every** ``append`` and check whether it's the right array. However this
works pretty good, because in *slow* cases, the recursion detector and other
settings will stop this process.

It is important to note that:

1. Array modifications work only in the current module.
2. Jedi only checks Array additions; ``list.pop``, etc are ignored.
"""
from jedi import debug
from jedi import settings
from lotas.erdos._vendor.jedi.inference import recursion
from lotas.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES, HelperValueMixin, \
    ValueWrapper
from lotas.erdos._vendor.jedi.inference.lazy_value import LazyKnownValues
from lotas.erdos._vendor.jedi.inference.helpers import infer_call_of_leaf
from lotas.erdos._vendor.jedi.inference.cache import inference_state_method_cache

_sentinel = object()


def check_array_additions(context, sequence):
    """ Just a mapper function for the internal _internal_check_array_additions """
    if sequence.array_type not in ('list', 'set'):
        # TODO also check for dict updates
        return NO_VALUES

    return _internal_check_array_additions(context, sequence)


@inference_state_method_cache(default=NO_VALUES)
@debug.increase_indent
def _internal_check_array_additions(context, sequence):
    """
    Checks if a `Array` has "add" (append, insert, extend) statements:

    >>> a = [""]
    >>> a.append(1)
    """
    from lotas.erdos._vendor.jedi.inference import arguments

    debug.dbg('Dynamic array search for %s' % sequence, color='MAGENTA')
    module_context = context.get_root_context()
    if not settings.dynamic_array_additions or module_context.is_compiled():
        debug.dbg('Dynamic array search aborted.', color='MAGENTA')
        return NO_VALUES

    def find_additions(context, arglist, add_name):
        params = list(arguments.TreeArguments(context.inference_state, context, arglist).unpack())
        result = set()
        if add_name in ['insert']:
            params = params[1:]
        if add_name in ['append', 'add', 'insert']:
            for key, lazy_value in params:
                result.add(lazy_value)
        elif add_name in ['extend', 'update']:
            for key, lazy_value in params:
                result |= set(lazy_value.infer().iterate())
        return result

    temp_param_add, settings.dynamic_params_for_other_modules = \
        settings.dynamic_params_for_other_modules, False

    is_list = sequence.name.string_name == 'list'
    search_names = (['append', 'extend', 'insert'] if is_list else ['add', 'update'])

    added_types = set()
    for add_name in search_names:
        try:
            possible_names = module_context.tree_node.get_used_names()[add_name]
        except KeyError:
            continue
        else:
            for name in possible_names:
                value_node = context.tree_node
                if not (value_node.start_pos < name.start_pos < value_node.end_pos):
                    continue
                trailer = name.parent
                power = trailer.parent
                trailer_pos = power.children.index(trailer)
                try:
                    execution_trailer = power.children[trailer_pos + 1]
                except IndexError:
                    continue
                else:
                    if execution_trailer.type != 'trailer' \
                            or execution_trailer.children[0] != '(' \
                            or execution_trailer.children[1] == ')':
                        continue

                random_context = context.create_context(name)

                with recursion.execution_allowed(context.inference_state, power) as allowed:
                    if allowed:
                        found = infer_call_of_leaf(
                            random_context,
                            name,
                            cut_own_trailer=True
                        )
                        if sequence in found:
                            # The arrays match. Now add the results
                            added_types |= find_additions(
                                random_context,
                                execution_trailer.children[1],
                                add_name
                            )

    # reset settings
    settings.dynamic_params_for_other_modules = temp_param_add
    debug.dbg('Dynamic array result %s', added_types, color='MAGENTA')
    return added_types


def get_dynamic_array_instance(instance, arguments):
    """Used for set() and list() instances."""
    ai = _DynamicArrayAdditions(instance, arguments)
    from lotas.erdos._vendor.jedi.inference import arguments
    return arguments.ValuesArguments([ValueSet([ai])])


class _DynamicArrayAdditions(HelperValueMixin):
    """
    Used for the usage of set() and list().
    This is definitely a hack, but a good one :-)
    It makes it possible to use set/list conversions.

    This is not a proper context, because it doesn't have to be. It's not used
    in the wild, it's just used within typeshed as an argument to `__init__`
    for set/list and never used in any other place.
    """
    def __init__(self, instance, arguments):
        self._instance = instance
        self._arguments = arguments

    def py__class__(self):
        tuple_, = self._instance.inference_state.builtins_module.py__getattribute__('tuple')
        return tuple_

    def py__iter__(self, contextualized_node=None):
        arguments = self._arguments
        try:
            _, lazy_value = next(arguments.unpack())
        except StopIteration:
            pass
        else:
            yield from lazy_value.infer().iterate()

        from lotas.erdos._vendor.jedi.inference.arguments import TreeArguments
        if isinstance(arguments, TreeArguments):
            additions = _internal_check_array_additions(arguments.context, self._instance)
            yield from additions

    def iterate(self, contextualized_node=None, is_async=False):
        return self.py__iter__(contextualized_node)


class _Modification(ValueWrapper):
    def __init__(self, wrapped_value, assigned_values, contextualized_key):
        super().__init__(wrapped_value)
        self._assigned_values = assigned_values
        self._contextualized_key = contextualized_key

    def py__getitem__(self, *args, **kwargs):
        return self._wrapped_value.py__getitem__(*args, **kwargs) | self._assigned_values

    def py__simple_getitem__(self, index):
        actual = [
            v.get_safe_value(_sentinel)
            for v in self._contextualized_key.infer()
        ]
        if index in actual:
            return self._assigned_values
        return self._wrapped_value.py__simple_getitem__(index)


class DictModification(_Modification):
    def py__iter__(self, contextualized_node=None):
        yield from self._wrapped_value.py__iter__(contextualized_node)
        yield self._contextualized_key

    def get_key_values(self):
        return self._wrapped_value.get_key_values() | self._contextualized_key.infer()


class ListModification(_Modification):
    def py__iter__(self, contextualized_node=None):
        yield from self._wrapped_value.py__iter__(contextualized_node)
        yield LazyKnownValues(self._assigned_values)
