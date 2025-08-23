"""
Contains all classes and functions to deal with lists, dicts, generators and
iterators in general.
"""
from erdos.erdos._vendor.jedi.inference import compiled
from erdos.erdos._vendor.jedi.inference import analysis
from erdos.erdos._vendor.jedi.inference.lazy_value import LazyKnownValue, LazyKnownValues, \
    LazyTreeValue
from erdos.erdos._vendor.jedi.inference.helpers import get_int_or_none, is_string, \
    reraise_getitem_errors, SimpleGetItemNotFound
from erdos.erdos._vendor.jedi.inference.utils import safe_property, to_list
from erdos.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos.erdos._vendor.jedi.inference.filters import LazyAttributeOverwrite, publish_method
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, Value, NO_VALUES, \
    ContextualizedNode, iterate_values, sentinel, \
    LazyValueWrapper
from erdos.erdos._vendor.jedi.parser_utils import get_sync_comp_fors
from erdos.erdos._vendor.jedi.inference.context import CompForContext
from erdos.erdos._vendor.jedi.inference.value.dynamic_arrays import check_array_additions


class IterableMixin:
    def py__next__(self, contextualized_node=None):
        return self.py__iter__(contextualized_node)

    def py__stop_iteration_returns(self):
        return ValueSet([compiled.builtin_from_name(self.inference_state, 'None')])

    # At the moment, safe values are simple values like "foo", 1 and not
    # lists/dicts. Therefore as a small speed optimization we can just do the
    # default instead of resolving the lazy wrapped values, that are just
    # doing this in the end as well.
    # This mostly speeds up patterns like `sys.version_info >= (3, 0)` in
    # typeshed.
    get_safe_value = Value.get_safe_value


class GeneratorBase(LazyAttributeOverwrite, IterableMixin):
    array_type = None

    def _get_wrapped_value(self):
        instance, = self._get_cls().execute_annotation()
        return instance

    def _get_cls(self):
        generator, = self.inference_state.typing_module.py__getattribute__('Generator')
        return generator

    def py__bool__(self):
        return True

    @publish_method('__iter__')
    def _iter(self, arguments):
        return ValueSet([self])

    @publish_method('send')
    @publish_method('__next__')
    def _next(self, arguments):
        return ValueSet.from_sets(lazy_value.infer() for lazy_value in self.py__iter__())

    def py__stop_iteration_returns(self):
        return ValueSet([compiled.builtin_from_name(self.inference_state, 'None')])

    @property
    def name(self):
        return compiled.CompiledValueName(self, 'Generator')

    def get_annotated_class_object(self):
        from erdos.erdos._vendor.jedi.inference.gradual.generics import TupleGenericManager
        gen_values = self.merge_types_of_iterate().py__class__()
        gm = TupleGenericManager((gen_values, NO_VALUES, NO_VALUES))
        return self._get_cls().with_generics(gm)


class Generator(GeneratorBase):
    """Handling of `yield` functions."""
    def __init__(self, inference_state, func_execution_context):
        super().__init__(inference_state)
        self._func_execution_context = func_execution_context

    def py__iter__(self, contextualized_node=None):
        iterators = self._func_execution_context.infer_annotations()
        if iterators:
            return iterators.iterate(contextualized_node)
        return self._func_execution_context.get_yield_lazy_values()

    def py__stop_iteration_returns(self):
        return self._func_execution_context.get_return_values()

    def __repr__(self):
        return "<%s of %s>" % (type(self).__name__, self._func_execution_context)


def comprehension_from_atom(inference_state, value, atom):
    bracket = atom.children[0]
    test_list_comp = atom.children[1]

    if bracket == '{':
        if atom.children[1].children[1] == ':':
            sync_comp_for = test_list_comp.children[3]
            if sync_comp_for.type == 'comp_for':
                sync_comp_for = sync_comp_for.children[1]

            return DictComprehension(
                inference_state,
                value,
                sync_comp_for_node=sync_comp_for,
                key_node=test_list_comp.children[0],
                value_node=test_list_comp.children[2],
            )
        else:
            cls = SetComprehension
    elif bracket == '(':
        cls = GeneratorComprehension
    elif bracket == '[':
        cls = ListComprehension

    sync_comp_for = test_list_comp.children[1]
    if sync_comp_for.type == 'comp_for':
        sync_comp_for = sync_comp_for.children[1]

    return cls(
        inference_state,
        defining_context=value,
        sync_comp_for_node=sync_comp_for,
        entry_node=test_list_comp.children[0],
    )


class ComprehensionMixin:
    @inference_state_method_cache()
    def _get_comp_for_context(self, parent_context, comp_for):
        return CompForContext(parent_context, comp_for)

    def _nested(self, comp_fors, parent_context=None):
        comp_for = comp_fors[0]

        is_async = comp_for.parent.type == 'comp_for'

        input_node = comp_for.children[3]
        parent_context = parent_context or self._defining_context
        input_types = parent_context.infer_node(input_node)

        cn = ContextualizedNode(parent_context, input_node)
        iterated = input_types.iterate(cn, is_async=is_async)
        exprlist = comp_for.children[1]
        for i, lazy_value in enumerate(iterated):
            types = lazy_value.infer()
            dct = unpack_tuple_to_dict(parent_context, types, exprlist)
            context = self._get_comp_for_context(
                parent_context,
                comp_for,
            )
            with context.predefine_names(comp_for, dct):
                try:
                    yield from self._nested(comp_fors[1:], context)
                except IndexError:
                    iterated = context.infer_node(self._entry_node)
                    if self.array_type == 'dict':
                        yield iterated, context.infer_node(self._value_node)
                    else:
                        yield iterated

    @inference_state_method_cache(default=[])
    @to_list
    def _iterate(self):
        comp_fors = tuple(get_sync_comp_fors(self._sync_comp_for_node))
        yield from self._nested(comp_fors)

    def py__iter__(self, contextualized_node=None):
        for set_ in self._iterate():
            yield LazyKnownValues(set_)

    def __repr__(self):
        return "<%s of %s>" % (type(self).__name__, self._sync_comp_for_node)


class _DictMixin:
    def _get_generics(self):
        return tuple(c_set.py__class__() for c_set in self.get_mapping_item_values())


class Sequence(LazyAttributeOverwrite, IterableMixin):
    api_type = 'instance'

    @property
    def name(self):
        return compiled.CompiledValueName(self, self.array_type)

    def _get_generics(self):
        return (self.merge_types_of_iterate().py__class__(),)

    @inference_state_method_cache(default=())
    def _cached_generics(self):
        return self._get_generics()

    def _get_wrapped_value(self):
        from erdos.erdos._vendor.jedi.inference.gradual.base import GenericClass
        from erdos.erdos._vendor.jedi.inference.gradual.generics import TupleGenericManager
        klass = compiled.builtin_from_name(self.inference_state, self.array_type)
        c, = GenericClass(
            klass,
            TupleGenericManager(self._cached_generics())
        ).execute_annotation()
        return c

    def py__bool__(self):
        return None  # We don't know the length, because of appends.

    @safe_property
    def parent(self):
        return self.inference_state.builtins_module

    def py__getitem__(self, index_value_set, contextualized_node):
        if self.array_type == 'dict':
            return self._dict_values()
        return iterate_values(ValueSet([self]))


class _BaseComprehension(ComprehensionMixin):
    def __init__(self, inference_state, defining_context, sync_comp_for_node, entry_node):
        assert sync_comp_for_node.type == 'sync_comp_for'
        super().__init__(inference_state)
        self._defining_context = defining_context
        self._sync_comp_for_node = sync_comp_for_node
        self._entry_node = entry_node


class ListComprehension(_BaseComprehension, Sequence):
    array_type = 'list'

    def py__simple_getitem__(self, index):
        if isinstance(index, slice):
            return ValueSet([self])

        all_types = list(self.py__iter__())
        with reraise_getitem_errors(IndexError, TypeError):
            lazy_value = all_types[index]
        return lazy_value.infer()


class SetComprehension(_BaseComprehension, Sequence):
    array_type = 'set'


class GeneratorComprehension(_BaseComprehension, GeneratorBase):
    pass


class _DictKeyMixin:
    # TODO merge with _DictMixin?
    def get_mapping_item_values(self):
        return self._dict_keys(), self._dict_values()

    def get_key_values(self):
        # TODO merge with _dict_keys?
        return self._dict_keys()


class DictComprehension(ComprehensionMixin, Sequence, _DictKeyMixin):
    array_type = 'dict'

    def __init__(self, inference_state, defining_context, sync_comp_for_node, key_node, value_node):
        assert sync_comp_for_node.type == 'sync_comp_for'
        super().__init__(inference_state)
        self._defining_context = defining_context
        self._sync_comp_for_node = sync_comp_for_node
        self._entry_node = key_node
        self._value_node = value_node

    def py__iter__(self, contextualized_node=None):
        for keys, values in self._iterate():
            yield LazyKnownValues(keys)

    def py__simple_getitem__(self, index):
        for keys, values in self._iterate():
            for k in keys:
                # Be careful in the future if refactoring, index could be a
                # slice object.
                if k.get_safe_value(default=object()) == index:
                    return values
        raise SimpleGetItemNotFound()

    def _dict_keys(self):
        return ValueSet.from_sets(keys for keys, values in self._iterate())

    def _dict_values(self):
        return ValueSet.from_sets(values for keys, values in self._iterate())

    @publish_method('values')
    def _imitate_values(self, arguments):
        lazy_value = LazyKnownValues(self._dict_values())
        return ValueSet([FakeList(self.inference_state, [lazy_value])])

    @publish_method('items')
    def _imitate_items(self, arguments):
        lazy_values = [
            LazyKnownValue(
                FakeTuple(
                    self.inference_state,
                    [LazyKnownValues(key),
                     LazyKnownValues(value)]
                )
            )
            for key, value in self._iterate()
        ]

        return ValueSet([FakeList(self.inference_state, lazy_values)])

    def exact_key_items(self):
        # NOTE: A smarter thing can probably done here to achieve better
        # completions, but at least like this jedi doesn't crash
        return []


class SequenceLiteralValue(Sequence):
    _TUPLE_LIKE = 'testlist_star_expr', 'testlist', 'subscriptlist'
    mapping = {'(': 'tuple',
               '[': 'list',
               '{': 'set'}

    def __init__(self, inference_state, defining_context, atom):
        super().__init__(inference_state)
        self.atom = atom
        self._defining_context = defining_context

        if self.atom.type in self._TUPLE_LIKE:
            self.array_type = 'tuple'
        else:
            self.array_type = SequenceLiteralValue.mapping[atom.children[0]]
            """The builtin name of the array (list, set, tuple or dict)."""

    def _get_generics(self):
        if self.array_type == 'tuple':
            return tuple(x.infer().py__class__() for x in self.py__iter__())
        return super()._get_generics()

    def py__simple_getitem__(self, index):
        """Here the index is an int/str. Raises IndexError/KeyError."""
        if isinstance(index, slice):
            return ValueSet([self])
        else:
            with reraise_getitem_errors(TypeError, KeyError, IndexError):
                node = self.get_tree_entries()[index]
            if node == ':' or node.type == 'subscript':
                return NO_VALUES
            return self._defining_context.infer_node(node)

    def py__iter__(self, contextualized_node=None):
        """
        While values returns the possible values for any array field, this
        function returns the value for a certain index.
        """
        for node in self.get_tree_entries():
            if node == ':' or node.type == 'subscript':
                # TODO this should probably use at least part of the code
                #      of infer_subscript_list.
                yield LazyKnownValue(Slice(self._defining_context, None, None, None))
            else:
                yield LazyTreeValue(self._defining_context, node)
        yield from check_array_additions(self._defining_context, self)

    def py__len__(self):
        # This function is not really used often. It's more of a try.
        return len(self.get_tree_entries())

    def get_tree_entries(self):
        c = self.atom.children

        if self.atom.type in self._TUPLE_LIKE:
            return c[::2]

        array_node = c[1]
        if array_node in (']', '}', ')'):
            return []  # Direct closing bracket, doesn't contain items.

        if array_node.type == 'testlist_comp':
            # filter out (for now) pep 448 single-star unpacking
            return [value for value in array_node.children[::2]
                    if value.type != "star_expr"]
        elif array_node.type == 'dictorsetmaker':
            kv = []
            iterator = iter(array_node.children)
            for key in iterator:
                if key == "**":
                    # dict with pep 448 double-star unpacking
                    # for now ignoring the values imported by **
                    next(iterator)
                    next(iterator, None)  # Possible comma.
                else:
                    op = next(iterator, None)
                    if op is None or op == ',':
                        if key.type == "star_expr":
                            # pep 448 single-star unpacking
                            # for now ignoring values imported by *
                            pass
                        else:
                            kv.append(key)  # A set.
                    else:
                        assert op == ':'  # A dict.
                        kv.append((key, next(iterator)))
                        next(iterator, None)  # Possible comma.
            return kv
        else:
            if array_node.type == "star_expr":
                # pep 448 single-star unpacking
                # for now ignoring values imported by *
                return []
            else:
                return [array_node]

    def __repr__(self):
        return "<%s of %s>" % (self.__class__.__name__, self.atom)


class DictLiteralValue(_DictMixin, SequenceLiteralValue, _DictKeyMixin):
    array_type = 'dict'

    def __init__(self, inference_state, defining_context, atom):
        # Intentionally don't call the super class. This is definitely a sign
        # that the architecture is bad and we should refactor.
        Sequence.__init__(self, inference_state)
        self._defining_context = defining_context
        self.atom = atom

    def py__simple_getitem__(self, index):
        """Here the index is an int/str. Raises IndexError/KeyError."""
        compiled_value_index = compiled.create_simple_object(self.inference_state, index)
        for key, value in self.get_tree_entries():
            for k in self._defining_context.infer_node(key):
                for key_v in k.execute_operation(compiled_value_index, '=='):
                    if key_v.get_safe_value():
                        return self._defining_context.infer_node(value)
        raise SimpleGetItemNotFound('No key found in dictionary %s.' % self)

    def py__iter__(self, contextualized_node=None):
        """
        While values returns the possible values for any array field, this
        function returns the value for a certain index.
        """
        # Get keys.
        types = NO_VALUES
        for k, _ in self.get_tree_entries():
            types |= self._defining_context.infer_node(k)
        # We don't know which dict index comes first, therefore always
        # yield all the types.
        for _ in types:
            yield LazyKnownValues(types)

    @publish_method('values')
    def _imitate_values(self, arguments):
        lazy_value = LazyKnownValues(self._dict_values())
        return ValueSet([FakeList(self.inference_state, [lazy_value])])

    @publish_method('items')
    def _imitate_items(self, arguments):
        lazy_values = [
            LazyKnownValue(FakeTuple(
                self.inference_state,
                (LazyTreeValue(self._defining_context, key_node),
                 LazyTreeValue(self._defining_context, value_node))
            )) for key_node, value_node in self.get_tree_entries()
        ]

        return ValueSet([FakeList(self.inference_state, lazy_values)])

    def exact_key_items(self):
        """
        Returns a generator of tuples like dict.items(), where the key is
        resolved (as a string) and the values are still lazy values.
        """
        for key_node, value in self.get_tree_entries():
            for key in self._defining_context.infer_node(key_node):
                if is_string(key):
                    yield key.get_safe_value(), LazyTreeValue(self._defining_context, value)

    def _dict_values(self):
        return ValueSet.from_sets(
            self._defining_context.infer_node(v)
            for k, v in self.get_tree_entries()
        )

    def _dict_keys(self):
        return ValueSet.from_sets(
            self._defining_context.infer_node(k)
            for k, v in self.get_tree_entries()
        )


class _FakeSequence(Sequence):
    def __init__(self, inference_state, lazy_value_list):
        """
        type should be one of "tuple", "list"
        """
        super().__init__(inference_state)
        self._lazy_value_list = lazy_value_list

    def py__simple_getitem__(self, index):
        if isinstance(index, slice):
            return ValueSet([self])

        with reraise_getitem_errors(IndexError, TypeError):
            lazy_value = self._lazy_value_list[index]
        return lazy_value.infer()

    def py__iter__(self, contextualized_node=None):
        return self._lazy_value_list

    def py__bool__(self):
        return bool(len(self._lazy_value_list))

    def __repr__(self):
        return "<%s of %s>" % (type(self).__name__, self._lazy_value_list)


class FakeTuple(_FakeSequence):
    array_type = 'tuple'


class FakeList(_FakeSequence):
    array_type = 'tuple'


class FakeDict(_DictMixin, Sequence, _DictKeyMixin):
    array_type = 'dict'

    def __init__(self, inference_state, dct):
        super().__init__(inference_state)
        self._dct = dct

    def py__iter__(self, contextualized_node=None):
        for key in self._dct:
            yield LazyKnownValue(compiled.create_simple_object(self.inference_state, key))

    def py__simple_getitem__(self, index):
        with reraise_getitem_errors(KeyError, TypeError):
            lazy_value = self._dct[index]
        return lazy_value.infer()

    @publish_method('values')
    def _values(self, arguments):
        return ValueSet([FakeTuple(
            self.inference_state,
            [LazyKnownValues(self._dict_values())]
        )])

    def _dict_values(self):
        return ValueSet.from_sets(lazy_value.infer() for lazy_value in self._dct.values())

    def _dict_keys(self):
        return ValueSet.from_sets(lazy_value.infer() for lazy_value in self.py__iter__())

    def exact_key_items(self):
        return self._dct.items()

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self._dct)


class MergedArray(Sequence):
    def __init__(self, inference_state, arrays):
        super().__init__(inference_state)
        self.array_type = arrays[-1].array_type
        self._arrays = arrays

    def py__iter__(self, contextualized_node=None):
        for array in self._arrays:
            yield from array.py__iter__()

    def py__simple_getitem__(self, index):
        return ValueSet.from_sets(lazy_value.infer() for lazy_value in self.py__iter__())


def unpack_tuple_to_dict(context, types, exprlist):
    """
    Unpacking tuple assignments in for statements and expr_stmts.
    """
    if exprlist.type == 'name':
        return {exprlist.value: types}
    elif exprlist.type == 'atom' and exprlist.children[0] in ('(', '['):
        return unpack_tuple_to_dict(context, types, exprlist.children[1])
    elif exprlist.type in ('testlist', 'testlist_comp', 'exprlist',
                           'testlist_star_expr'):
        dct = {}
        parts = iter(exprlist.children[::2])
        n = 0
        for lazy_value in types.iterate(ContextualizedNode(context, exprlist)):
            n += 1
            try:
                part = next(parts)
            except StopIteration:
                analysis.add(context, 'value-error-too-many-values', part,
                             message="ValueError: too many values to unpack (expected %s)" % n)
            else:
                dct.update(unpack_tuple_to_dict(context, lazy_value.infer(), part))
        has_parts = next(parts, None)
        if types and has_parts is not None:
            analysis.add(context, 'value-error-too-few-values', has_parts,
                         message="ValueError: need more than %s values to unpack" % n)
        return dct
    elif exprlist.type == 'power' or exprlist.type == 'atom_expr':
        # Something like ``arr[x], var = ...``.
        # This is something that is not yet supported, would also be difficult
        # to write into a dict.
        return {}
    elif exprlist.type == 'star_expr':  # `a, *b, c = x` type unpackings
        # Currently we're not supporting them.
        return {}
    raise NotImplementedError


class Slice(LazyValueWrapper):
    def __init__(self, python_context, start, stop, step):
        self.inference_state = python_context.inference_state
        self._context = python_context
        # All of them are either a Precedence or None.
        self._start = start
        self._stop = stop
        self._step = step

    def _get_wrapped_value(self):
        value = compiled.builtin_from_name(self._context.inference_state, 'slice')
        slice_value, = value.execute_with_values()
        return slice_value

    def get_safe_value(self, default=sentinel):
        """
        Imitate CompiledValue.obj behavior and return a ``builtin.slice()``
        object.
        """
        def get(element):
            if element is None:
                return None

            result = self._context.infer_node(element)
            if len(result) != 1:
                # For simplicity, we want slices to be clear defined with just
                # one type.  Otherwise we will return an empty slice object.
                raise IndexError

            value, = result
            return get_int_or_none(value)

        try:
            return slice(get(self._start), get(self._stop), get(self._step))
        except IndexError:
            return slice(None, None, None)
