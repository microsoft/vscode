from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES, ValueWrapper
from erdos.erdos._vendor.jedi.inference.gradual.base import BaseTypingValue


class TypeVarClass(ValueWrapper):
    def py__call__(self, arguments):
        unpacked = arguments.unpack()

        key, lazy_value = next(unpacked, (None, None))
        var_name = self._find_string_name(lazy_value)
        # The name must be given, otherwise it's useless.
        if var_name is None or key is not None:
            debug.warning('Found a variable without a name %s', arguments)
            return NO_VALUES

        return ValueSet([TypeVar.create_cached(
            self.inference_state,
            self.parent_context,
            tree_name=self.tree_node.name,
            var_name=var_name,
            unpacked_args=unpacked,
        )])

    def _find_string_name(self, lazy_value):
        if lazy_value is None:
            return None

        value_set = lazy_value.infer()
        if not value_set:
            return None
        if len(value_set) > 1:
            debug.warning('Found multiple values for a type variable: %s', value_set)

        name_value = next(iter(value_set))
        try:
            method = name_value.get_safe_value
        except AttributeError:
            return None
        else:
            safe_value = method(default=None)
            if isinstance(safe_value, str):
                return safe_value
            return None


class TypeVar(BaseTypingValue):
    def __init__(self, parent_context, tree_name, var_name, unpacked_args):
        super().__init__(parent_context, tree_name)
        self._var_name = var_name

        self._constraints_lazy_values = []
        self._bound_lazy_value = None
        self._covariant_lazy_value = None
        self._contravariant_lazy_value = None
        for key, lazy_value in unpacked_args:
            if key is None:
                self._constraints_lazy_values.append(lazy_value)
            else:
                if key == 'bound':
                    self._bound_lazy_value = lazy_value
                elif key == 'covariant':
                    self._covariant_lazy_value = lazy_value
                elif key == 'contravariant':
                    self._contra_variant_lazy_value = lazy_value
                else:
                    debug.warning('Invalid TypeVar param name %s', key)

    def py__name__(self):
        return self._var_name

    def get_filters(self, *args, **kwargs):
        return iter([])

    def _get_classes(self):
        if self._bound_lazy_value is not None:
            return self._bound_lazy_value.infer()
        if self._constraints_lazy_values:
            return self.constraints
        debug.warning('Tried to infer the TypeVar %s without a given type', self._var_name)
        return NO_VALUES

    def is_same_class(self, other):
        # Everything can match an undefined type var.
        return True

    @property
    def constraints(self):
        return ValueSet.from_sets(
            lazy.infer() for lazy in self._constraints_lazy_values
        )

    def define_generics(self, type_var_dict):
        try:
            found = type_var_dict[self.py__name__()]
        except KeyError:
            pass
        else:
            if found:
                return found
        return ValueSet({self})

    def execute_annotation(self):
        return self._get_classes().execute_annotation()

    def infer_type_vars(self, value_set):
        def iterate():
            for v in value_set:
                cls = v.py__class__()
                if v.is_function() or v.is_class():
                    cls = TypeWrapper(cls, v)
                yield cls

        annotation_name = self.py__name__()
        return {annotation_name: ValueSet(iterate())}

    def __repr__(self):
        return '<%s: %s>' % (self.__class__.__name__, self.py__name__())


class TypeWrapper(ValueWrapper):
    def __init__(self, wrapped_value, original_value):
        super().__init__(wrapped_value)
        self._original_value = original_value

    def execute_annotation(self):
        return ValueSet({self._original_value})
