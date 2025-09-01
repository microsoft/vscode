from erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES
from erdos._vendor.jedi.common import monkeypatch


class AbstractLazyValue:
    def __init__(self, data, min=1, max=1):
        self.data = data
        self.min = min
        self.max = max

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.data)

    def infer(self):
        raise NotImplementedError


class LazyKnownValue(AbstractLazyValue):
    """data is a Value."""
    def infer(self):
        return ValueSet([self.data])


class LazyKnownValues(AbstractLazyValue):
    """data is a ValueSet."""
    def infer(self):
        return self.data


class LazyUnknownValue(AbstractLazyValue):
    def __init__(self, min=1, max=1):
        super().__init__(None, min, max)

    def infer(self):
        return NO_VALUES


class LazyTreeValue(AbstractLazyValue):
    def __init__(self, context, node, min=1, max=1):
        super().__init__(node, min, max)
        self.context = context
        # We need to save the predefined names. It's an unfortunate side effect
        # that needs to be tracked otherwise results will be wrong.
        self._predefined_names = dict(context.predefined_names)

    def infer(self):
        with monkeypatch(self.context, 'predefined_names', self._predefined_names):
            return self.context.infer_node(self.data)


def get_merged_lazy_value(lazy_values):
    if len(lazy_values) > 1:
        return MergedLazyValues(lazy_values)
    else:
        return lazy_values[0]


class MergedLazyValues(AbstractLazyValue):
    """data is a list of lazy values."""
    def infer(self):
        return ValueSet.from_sets(l.infer() for l in self.data)
