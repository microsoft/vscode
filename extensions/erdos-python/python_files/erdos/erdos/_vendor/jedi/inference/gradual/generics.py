"""
This module is about generics, like the `int` in `List[int]`. It's not about
the Generic class.
"""

from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi.cache import memoize_method
from erdos.erdos._vendor.jedi.inference.utils import to_tuple
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from erdos.erdos._vendor.jedi.inference.value.iterable import SequenceLiteralValue
from erdos.erdos._vendor.jedi.inference.helpers import is_string


def _resolve_forward_references(context, value_set):
    for value in value_set:
        if is_string(value):
            from erdos.erdos._vendor.jedi.inference.gradual.annotation import _get_forward_reference_node
            node = _get_forward_reference_node(context, value.get_safe_value())
            if node is not None:
                for c in context.infer_node(node):
                    yield c
        else:
            yield value


class _AbstractGenericManager:
    def get_index_and_execute(self, index):
        try:
            return self[index].execute_annotation()
        except IndexError:
            debug.warning('No param #%s found for annotation %s', index, self)
            return NO_VALUES

    def get_type_hint(self):
        return '[%s]' % ', '.join(t.get_type_hint(add_class_info=False) for t in self.to_tuple())


class LazyGenericManager(_AbstractGenericManager):
    def __init__(self, context_of_index, index_value):
        self._context_of_index = context_of_index
        self._index_value = index_value

    @memoize_method
    def __getitem__(self, index):
        return self._tuple()[index]()

    def __len__(self):
        return len(self._tuple())

    @memoize_method
    @to_tuple
    def _tuple(self):
        def lambda_scoping_in_for_loop_sucks(lazy_value):
            return lambda: ValueSet(_resolve_forward_references(
                self._context_of_index,
                lazy_value.infer()
            ))

        if isinstance(self._index_value, SequenceLiteralValue):
            for lazy_value in self._index_value.py__iter__(contextualized_node=None):
                yield lambda_scoping_in_for_loop_sucks(lazy_value)
        else:
            yield lambda: ValueSet(_resolve_forward_references(
                self._context_of_index,
                ValueSet([self._index_value])
            ))

    @to_tuple
    def to_tuple(self):
        for callable_ in self._tuple():
            yield callable_()

    def is_homogenous_tuple(self):
        if isinstance(self._index_value, SequenceLiteralValue):
            entries = self._index_value.get_tree_entries()
            if len(entries) == 2 and entries[1] == '...':
                return True
        return False

    def __repr__(self):
        return '<LazyG>[%s]' % (', '.join(repr(x) for x in self.to_tuple()))


class TupleGenericManager(_AbstractGenericManager):
    def __init__(self, tup):
        self._tuple = tup

    def __getitem__(self, index):
        return self._tuple[index]

    def __len__(self):
        return len(self._tuple)

    def to_tuple(self):
        return self._tuple

    def is_homogenous_tuple(self):
        return False

    def __repr__(self):
        return '<TupG>[%s]' % (', '.join(repr(x) for x in self.to_tuple()))
