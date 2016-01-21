"""
Contains all classes and functions to deal with lists, dicts, generators and
iterators in general.

Array modifications
*******************

If the content of an array (``set``/``list``) is requested somewhere, the
current module will be checked for appearances of ``arr.append``,
``arr.insert``, etc.  If the ``arr`` name points to an actual array, the
content will be added

This can be really cpu intensive, as you can imagine. Because |jedi| has to
follow **every** ``append`` and check wheter it's the right array. However this
works pretty good, because in *slow* cases, the recursion detector and other
settings will stop this process.

It is important to note that:

1. Array modfications work only in the current module.
2. Jedi only checks Array additions; ``list.pop``, etc are ignored.
"""
from itertools import chain

from jedi import common
from jedi import debug
from jedi import settings
from jedi._compatibility import use_metaclass, is_py3, unicode
from jedi.parser import tree
from jedi.evaluate import compiled
from jedi.evaluate import helpers
from jedi.evaluate.cache import CachedMetaClass, memoize_default
from jedi.evaluate import analysis


def unite(iterable):
    """Turns a two dimensional array into a one dimensional."""
    return list(chain.from_iterable(iterable))


class IterableWrapper(tree.Base):
    def is_class(self):
        return False


class GeneratorMixin(object):
    @memoize_default()
    def names_dicts(self, search_global=False):  # is always False
        dct = {}
        executes_generator = '__next__', 'send', 'next'
        for names in compiled.generator_obj.names_dict.values():
            for name in names:
                if name.value in executes_generator:
                    parent = GeneratorMethod(self, name.parent)
                    dct[name.value] = [helpers.FakeName(name.name, parent, is_definition=True)]
                else:
                    dct[name.value] = [name]
        yield dct

    def get_index_types(self, evaluator, index_array):
        #debug.warning('Tried to get array access on a generator: %s', self)
        analysis.add(self._evaluator, 'type-error-generator', index_array)
        return []

    def get_exact_index_types(self, index):
        """
        Exact lookups are used for tuple lookups, which are perfectly fine if
        used with generators.
        """
        return [self.iter_content()[index]]

    def py__bool__(self):
        return True


class Generator(use_metaclass(CachedMetaClass, IterableWrapper, GeneratorMixin)):
    """Handling of `yield` functions."""
    def __init__(self, evaluator, func, var_args):
        super(Generator, self).__init__()
        self._evaluator = evaluator
        self.func = func
        self.var_args = var_args

    def iter_content(self):
        """ returns the content of __iter__ """
        # Directly execute it, because with a normal call to py__call__ a
        # Generator will be returned.
        from jedi.evaluate.representation import FunctionExecution
        f = FunctionExecution(self._evaluator, self.func, self.var_args)
        return f.get_return_types(check_yields=True)

    def __getattr__(self, name):
        if name not in ['start_pos', 'end_pos', 'parent', 'get_imports',
                        'doc', 'docstr', 'get_parent_until',
                        'get_code', 'subscopes']:
            raise AttributeError("Accessing %s of %s is not allowed."
                                 % (self, name))
        return getattr(self.func, name)

    def __repr__(self):
        return "<%s of %s>" % (type(self).__name__, self.func)


class GeneratorMethod(IterableWrapper):
    """``__next__`` and ``send`` methods."""
    def __init__(self, generator, builtin_func):
        self._builtin_func = builtin_func
        self._generator = generator

    def py__call__(self, evaluator, params):
        # TODO add TypeError if params are given.
        return self._generator.iter_content()

    def __getattr__(self, name):
        return getattr(self._builtin_func, name)


class Comprehension(IterableWrapper):
    @staticmethod
    def from_atom(evaluator, atom):
        mapping = {
            '(': GeneratorComprehension,
            '[': ListComprehension
        }
        return mapping[atom.children[0]](evaluator, atom)

    def __init__(self, evaluator, atom):
        self._evaluator = evaluator
        self._atom = atom

    @memoize_default()
    def eval_node(self):
        """
        The first part `x + 1` of the list comprehension:

            [x + 1 for x in foo]
        """
        comprehension = self._atom.children[1]
        # For nested comprehensions we need to search the last one.
        last = comprehension.children[-1]
        last_comp = comprehension.children[1]
        while True:
            if isinstance(last, tree.CompFor):
                last_comp = last
            elif not tree.is_node(last, 'comp_if'):
                break
            last = last.children[-1]

        return helpers.deep_ast_copy(comprehension.children[0], parent=last_comp)

    def get_exact_index_types(self, index):
        return [self._evaluator.eval_element(self.eval_node())[index]]

    def __repr__(self):
        return "<e%s of %s>" % (type(self).__name__, self._atom)


class ArrayMixin(object):
    @memoize_default()
    def names_dicts(self, search_global=False):  # Always False.
        # `array.type` is a string with the type, e.g. 'list'.
        scope = self._evaluator.find_types(compiled.builtin, self.type)[0]
        # builtins only have one class -> [0]
        scope = self._evaluator.execute(scope, (AlreadyEvaluated((self,)),))[0]
        return scope.names_dicts(search_global)

    def py__bool__(self):
        return None  # We don't know the length, because of appends.


class ListComprehension(Comprehension, ArrayMixin):
    type = 'list'

    def get_index_types(self, evaluator, index):
        return self.iter_content()

    def iter_content(self):
        return self._evaluator.eval_element(self.eval_node())

    @property
    def name(self):
        return FakeSequence(self._evaluator, [], 'list').name


class GeneratorComprehension(Comprehension, GeneratorMixin):
    def iter_content(self):
        return self._evaluator.eval_element(self.eval_node())


class Array(IterableWrapper, ArrayMixin):
    mapping = {'(': 'tuple',
               '[': 'list',
               '{': 'dict'}

    def __init__(self, evaluator, atom):
        self._evaluator = evaluator
        self.atom = atom
        self.type = Array.mapping[atom.children[0]]
        """The builtin name of the array (list, set, tuple or dict)."""

        c = self.atom.children
        array_node = c[1]
        if self.type == 'dict' and array_node != '}' \
                and (not hasattr(array_node, 'children')
                     or ':' not in array_node.children):
            self.type = 'set'

    @property
    def name(self):
        return helpers.FakeName(self.type, parent=self)

    @memoize_default()
    def get_index_types(self, evaluator, index=()):
        """
        Get the types of a specific index or all, if not given.

        :param index: A subscriptlist node (or subnode).
        """
        indexes = create_indexes_or_slices(evaluator, index)
        lookup_done = False
        types = []
        for index in indexes:
            if isinstance(index, Slice):
                types += [self]
                lookup_done = True
            elif isinstance(index, compiled.CompiledObject) \
                    and isinstance(index.obj, (int, str, unicode)):
                with common.ignored(KeyError, IndexError, TypeError):
                    types += self.get_exact_index_types(index.obj)
                    lookup_done = True

        return types if lookup_done else self.values()

    @memoize_default()
    def values(self):
        result = unite(self._evaluator.eval_element(v) for v in self._values())
        result += check_array_additions(self._evaluator, self)
        return result

    def get_exact_index_types(self, mixed_index):
        """ Here the index is an int/str. Raises IndexError/KeyError """
        if self.type == 'dict':
            for key, values in self._items():
                # Because we only want the key to be a string.
                keys = self._evaluator.eval_element(key)

                for k in keys:
                    if isinstance(k, compiled.CompiledObject) \
                            and mixed_index == k.obj:
                        for value in values:
                            return self._evaluator.eval_element(value)
            raise KeyError('No key found in dictionary %s.' % self)

        # Can raise an IndexError
        return self._evaluator.eval_element(self._items()[mixed_index])

    def iter_content(self):
        return self.values()

    @common.safe_property
    def parent(self):
        return compiled.builtin

    def get_parent_until(self):
        return compiled.builtin

    def __getattr__(self, name):
        if name not in ['start_pos', 'get_only_subelement', 'parent',
                        'get_parent_until', 'items']:
            raise AttributeError('Strange access on %s: %s.' % (self, name))
        return getattr(self.atom, name)

    def _values(self):
        """Returns a list of a list of node."""
        if self.type == 'dict':
            return list(chain.from_iterable(v for k, v in self._items()))
        else:
            return self._items()

    def _items(self):
        c = self.atom.children
        array_node = c[1]
        if array_node in (']', '}', ')'):
            return []  # Direct closing bracket, doesn't contain items.

        if tree.is_node(array_node, 'testlist_comp'):
            return array_node.children[::2]
        elif tree.is_node(array_node, 'dictorsetmaker'):
            kv = []
            iterator = iter(array_node.children)
            for key in iterator:
                op = next(iterator, None)
                if op is None or op == ',':
                    kv.append(key)  # A set.
                elif op == ':':  # A dict.
                    kv.append((key, [next(iterator)]))
                    next(iterator, None)  # Possible comma.
                else:
                    raise NotImplementedError('dict/set comprehensions')
            return kv
        else:
            return [array_node]

    def __iter__(self):
        return iter(self._items())

    def __repr__(self):
        return "<%s of %s>" % (type(self).__name__, self.atom)


class _FakeArray(Array):
    def __init__(self, evaluator, container, type):
        self.type = type
        self._evaluator = evaluator
        self.atom = container


class ImplicitTuple(_FakeArray):
    def __init__(self, evaluator, testlist):
        super(ImplicitTuple, self).__init__(evaluator, testlist, 'tuple')
        self._testlist = testlist

    def _items(self):
        return self._testlist.children[::2]


class FakeSequence(_FakeArray):
    def __init__(self, evaluator, sequence_values, type):
        super(FakeSequence, self).__init__(evaluator, sequence_values, type)
        self._sequence_values = sequence_values

    def _items(self):
        return self._sequence_values

    def get_exact_index_types(self, index):
        value = self._sequence_values[index]
        return self._evaluator.eval_element(value)


class AlreadyEvaluated(frozenset):
    """A simple container to add already evaluated objects to an array."""
    def get_code(self):
        # For debugging purposes.
        return str(self)


class MergedNodes(frozenset):
    pass


class FakeDict(_FakeArray):
    def __init__(self, evaluator, dct):
        super(FakeDict, self).__init__(evaluator, dct, 'dict')
        self._dct = dct

    def get_exact_index_types(self, index):
        return list(chain.from_iterable(self._evaluator.eval_element(v)
                                        for v in self._dct[index]))

    def _items(self):
        return self._dct.items()


class MergedArray(_FakeArray):
    def __init__(self, evaluator, arrays):
        super(MergedArray, self).__init__(evaluator, arrays, arrays[-1].type)
        self._arrays = arrays

    def get_exact_index_types(self, mixed_index):
        raise IndexError

    def values(self):
        return list(chain(*(a.values() for a in self._arrays)))

    def __iter__(self):
        for array in self._arrays:
            for a in array:
                yield a

    def __len__(self):
        return sum(len(a) for a in self._arrays)


def get_iterator_types(inputs):
    """Returns the types of any iterator (arrays, yields, __iter__, etc)."""
    iterators = []
    # Take the first statement (for has always only
    # one, remember `in`). And follow it.
    for it in inputs:
        if isinstance(it, (Generator, Array, ArrayInstance, Comprehension)):
            iterators.append(it)
        else:
            if not hasattr(it, 'execute_subscope_by_name'):
                debug.warning('iterator/for loop input wrong: %s', it)
                continue
            try:
                iterators += it.execute_subscope_by_name('__iter__')
            except KeyError:
                debug.warning('iterators: No __iter__ method found.')

    result = []
    from jedi.evaluate.representation import Instance
    for it in iterators:
        if isinstance(it, Array):
            # Array is a little bit special, since this is an internal array,
            # but there's also the list builtin, which is another thing.
            result += it.values()
        elif isinstance(it, Instance):
            # __iter__ returned an instance.
            name = '__next__' if is_py3 else 'next'
            try:
                result += it.execute_subscope_by_name(name)
            except KeyError:
                debug.warning('Instance has no __next__ function in %s.', it)
        else:
            # TODO this is not correct, __iter__ can return arbitrary input!
            # Is a generator.
            result += it.iter_content()
    return result


def check_array_additions(evaluator, array):
    """ Just a mapper function for the internal _check_array_additions """
    if array.type not in ('list', 'set'):
        # TODO also check for dict updates
        return []

    is_list = array.type == 'list'
    try:
        current_module = array.atom.get_parent_until()
    except AttributeError:
        # If there's no get_parent_until, it's a FakeSequence or another Fake
        # type. Those fake types are used inside Jedi's engine. No values may
        # be added to those after their creation.
        return []
    return _check_array_additions(evaluator, array, current_module, is_list)


@memoize_default([], evaluator_is_first_arg=True)
def _check_array_additions(evaluator, compare_array, module, is_list):
    """
    Checks if a `Array` has "add" (append, insert, extend) statements:

    >>> a = [""]
    >>> a.append(1)
    """
    if not settings.dynamic_array_additions or isinstance(module, compiled.CompiledObject):
        return []

    def check_additions(arglist, add_name):
        params = list(param.Arguments(evaluator, arglist).unpack())
        result = []
        if add_name in ['insert']:
            params = params[1:]
        if add_name in ['append', 'add', 'insert']:
            for key, nodes in params:
                result += unite(evaluator.eval_element(node) for node in nodes)
        elif add_name in ['extend', 'update']:
            for key, nodes in params:
                iterators = unite(evaluator.eval_element(node) for node in nodes)
                result += get_iterator_types(iterators)
        return result

    from jedi.evaluate import representation as er, param

    def get_execution_parent(element):
        """ Used to get an Instance/FunctionExecution parent """
        if isinstance(element, Array):
            node = element.atom
        else:
            # Is an Instance with an
            # Arguments([AlreadyEvaluated([ArrayInstance])]) inside
            # Yeah... I know... It's complicated ;-)
            node = list(element.var_args.argument_node[0])[0].var_args.trailer
        if isinstance(node, er.InstanceElement):
            return node
        return node.get_parent_until(er.FunctionExecution)

    temp_param_add, settings.dynamic_params_for_other_modules = \
        settings.dynamic_params_for_other_modules, False

    search_names = ['append', 'extend', 'insert'] if is_list else ['add', 'update']
    comp_arr_parent = get_execution_parent(compare_array)

    added_types = []
    for add_name in search_names:
        try:
            possible_names = module.used_names[add_name]
        except KeyError:
            continue
        else:
            for name in possible_names:
                # Check if the original scope is an execution. If it is, one
                # can search for the same statement, that is in the module
                # dict. Executions are somewhat special in jedi, since they
                # literally copy the contents of a function.
                if isinstance(comp_arr_parent, er.FunctionExecution):
                    if comp_arr_parent.start_pos < name.start_pos < comp_arr_parent.end_pos:
                        name = comp_arr_parent.name_for_position(name.start_pos)
                    else:
                        # Don't check definitions that are not defined in the
                        # same function. This is not "proper" anyway. It also
                        # improves Jedi's speed for array lookups, since we
                        # don't have to check the whole source tree anymore.
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
                power = helpers.call_of_name(name, cut_own_trailer=True)
                # InstanceElements are special, because they don't get copied,
                # but have this wrapper around them.
                if isinstance(comp_arr_parent, er.InstanceElement):
                    power = er.get_instance_el(evaluator, comp_arr_parent.instance, power)

                if evaluator.recursion_detector.push_stmt(power):
                    # Check for recursion. Possible by using 'extend' in
                    # combination with function calls.
                    continue
                if compare_array in evaluator.eval_element(power):
                    # The arrays match. Now add the results
                    added_types += check_additions(execution_trailer.children[1], add_name)

                evaluator.recursion_detector.pop_stmt()
    # reset settings
    settings.dynamic_params_for_other_modules = temp_param_add
    return added_types


def check_array_instances(evaluator, instance):
    """Used for set() and list() instances."""
    if not settings.dynamic_array_additions:
        return instance.var_args

    ai = ArrayInstance(evaluator, instance)
    from jedi.evaluate import param
    return param.Arguments(evaluator, [AlreadyEvaluated([ai])])


class ArrayInstance(IterableWrapper):
    """
    Used for the usage of set() and list().
    This is definitely a hack, but a good one :-)
    It makes it possible to use set/list conversions.

    In contrast to Array, ListComprehension and all other iterable types, this
    is something that is only used inside `evaluate/compiled/fake/builtins.py`
    and therefore doesn't need `names_dicts`, `py__bool__` and so on, because
    we don't use these operations in `builtins.py`.
    """
    def __init__(self, evaluator, instance):
        self._evaluator = evaluator
        self.instance = instance
        self.var_args = instance.var_args

    def iter_content(self):
        """
        The index is here just ignored, because of all the appends, etc.
        lists/sets are too complicated too handle that.
        """
        items = []
        for key, nodes in self.var_args.unpack():
            for node in nodes:
                for typ in self._evaluator.eval_element(node):
                    items += get_iterator_types([typ])

        module = self.var_args.get_parent_until()
        is_list = str(self.instance.name) == 'list'
        items += _check_array_additions(self._evaluator, self.instance, module, is_list)
        return items


class Slice(object):
    def __init__(self, evaluator, start, stop, step):
        self._evaluator = evaluator
        # all of them are either a Precedence or None.
        self._start = start
        self._stop = stop
        self._step = step

    @property
    def obj(self):
        """
        Imitate CompiledObject.obj behavior and return a ``builtin.slice()``
        object.
        """
        def get(element):
            if element is None:
                return None

            result = self._evaluator.eval_element(element)
            if len(result) != 1:
                # We want slices to be clear defined with just one type.
                # Otherwise we will return an empty slice object.
                raise IndexError
            try:
                return result[0].obj
            except AttributeError:
                return None

        try:
            return slice(get(self._start), get(self._stop), get(self._step))
        except IndexError:
            return slice(None, None, None)


def create_indexes_or_slices(evaluator, index):
    if tree.is_node(index, 'subscript'):  # subscript is a slice operation.
        start, stop, step = None, None, None
        result = []
        for el in index.children:
            if el == ':':
                if not result:
                    result.append(None)
            elif tree.is_node(el, 'sliceop'):
                if len(el.children) == 2:
                    result.append(el.children[1])
            else:
                result.append(el)
        result += [None] * (3 - len(result))

        return (Slice(evaluator, *result),)
    return evaluator.eval_element(index)
