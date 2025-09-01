"""
Module is used to infer Django model fields.
"""
from inspect import Parameter

from jedi import debug
from erdos._vendor.jedi.inference.cache import inference_state_function_cache
from erdos._vendor.jedi.inference.base_value import ValueSet, iterator_to_value_set, ValueWrapper
from erdos._vendor.jedi.inference.filters import DictFilter, AttributeOverwrite
from erdos._vendor.jedi.inference.names import NameWrapper, BaseTreeParamName
from erdos._vendor.jedi.inference.compiled.value import EmptyCompiledName
from erdos._vendor.jedi.inference.value.instance import TreeInstance
from erdos._vendor.jedi.inference.value.klass import ClassMixin
from erdos._vendor.jedi.inference.gradual.base import GenericClass
from erdos._vendor.jedi.inference.gradual.generics import TupleGenericManager
from erdos._vendor.jedi.inference.signature import AbstractSignature


mapping = {
    'IntegerField': (None, 'int'),
    'BigIntegerField': (None, 'int'),
    'PositiveIntegerField': (None, 'int'),
    'SmallIntegerField': (None, 'int'),
    'CharField': (None, 'str'),
    'TextField': (None, 'str'),
    'EmailField': (None, 'str'),
    'GenericIPAddressField': (None, 'str'),
    'URLField': (None, 'str'),
    'FloatField': (None, 'float'),
    'BinaryField': (None, 'bytes'),
    'BooleanField': (None, 'bool'),
    'DecimalField': ('decimal', 'Decimal'),
    'TimeField': ('datetime', 'time'),
    'DurationField': ('datetime', 'timedelta'),
    'DateField': ('datetime', 'date'),
    'DateTimeField': ('datetime', 'datetime'),
    'UUIDField': ('uuid', 'UUID'),
}

_FILTER_LIKE_METHODS = ('create', 'filter', 'exclude', 'update', 'get',
                        'get_or_create', 'update_or_create')


@inference_state_function_cache()
def _get_deferred_attributes(inference_state):
    return inference_state.import_module(
        ('django', 'db', 'models', 'query_utils')
    ).py__getattribute__('DeferredAttribute').execute_annotation()


def _infer_scalar_field(inference_state, field_name, field_tree_instance, is_instance):
    try:
        module_name, attribute_name = mapping[field_tree_instance.py__name__()]
    except KeyError:
        return None

    if not is_instance:
        return _get_deferred_attributes(inference_state)

    if module_name is None:
        module = inference_state.builtins_module
    else:
        module = inference_state.import_module((module_name,))

    for attribute in module.py__getattribute__(attribute_name):
        return attribute.execute_with_values()


@iterator_to_value_set
def _get_foreign_key_values(cls, field_tree_instance):
    if isinstance(field_tree_instance, TreeInstance):
        # TODO private access..
        argument_iterator = field_tree_instance._arguments.unpack()
        key, lazy_values = next(argument_iterator, (None, None))
        if key is None and lazy_values is not None:
            for value in lazy_values.infer():
                if value.py__name__() == 'str':
                    foreign_key_class_name = value.get_safe_value()
                    module = cls.get_root_context()
                    for v in module.py__getattribute__(foreign_key_class_name):
                        if v.is_class():
                            yield v
                elif value.is_class():
                    yield value


def _infer_field(cls, field_name, is_instance):
    inference_state = cls.inference_state
    result = field_name.infer()
    for field_tree_instance in result:
        scalar_field = _infer_scalar_field(
            inference_state, field_name, field_tree_instance, is_instance)
        if scalar_field is not None:
            return scalar_field

        name = field_tree_instance.py__name__()
        is_many_to_many = name == 'ManyToManyField'
        if name in ('ForeignKey', 'OneToOneField') or is_many_to_many:
            if not is_instance:
                return _get_deferred_attributes(inference_state)

            values = _get_foreign_key_values(cls, field_tree_instance)
            if is_many_to_many:
                return ValueSet(filter(None, [
                    _create_manager_for(v, 'RelatedManager') for v in values
                ]))
            else:
                return values.execute_with_values()

    debug.dbg('django plugin: fail to infer `%s` from class `%s`',
              field_name.string_name, cls.py__name__())
    return result


class DjangoModelName(NameWrapper):
    def __init__(self, cls, name, is_instance):
        super().__init__(name)
        self._cls = cls
        self._is_instance = is_instance

    def infer(self):
        return _infer_field(self._cls, self._wrapped_name, self._is_instance)


def _create_manager_for(cls, manager_cls='BaseManager'):
    managers = cls.inference_state.import_module(
        ('django', 'db', 'models', 'manager')
    ).py__getattribute__(manager_cls)
    for m in managers:
        if m.is_class_mixin():
            generics_manager = TupleGenericManager((ValueSet([cls]),))
            for c in GenericClass(m, generics_manager).execute_annotation():
                return c
    return None


def _new_dict_filter(cls, is_instance):
    filters = list(cls.get_filters(
        is_instance=is_instance,
        include_metaclasses=False,
        include_type_when_class=False)
    )
    dct = {
        name.string_name: DjangoModelName(cls, name, is_instance)
        for filter_ in reversed(filters)
        for name in filter_.values()
    }
    if is_instance:
        # Replace the objects with a name that amounts to nothing when accessed
        # in an instance. This is not perfect and still completes "objects" in
        # that case, but it at least not inferes stuff like `.objects.filter`.
        # It would be nicer to do that in a better way, so that it also doesn't
        # show up in completions, but it's probably just not worth doing that
        # for the extra amount of work.
        dct['objects'] = EmptyCompiledName(cls.inference_state, 'objects')

    return DictFilter(dct)


def is_django_model_base(value):
    return value.py__name__() == 'ModelBase' \
        and value.get_root_context().py__name__() == 'django.db.models.base'


def get_metaclass_filters(func):
    def wrapper(cls, metaclasses, is_instance):
        for metaclass in metaclasses:
            if is_django_model_base(metaclass):
                return [_new_dict_filter(cls, is_instance)]

        return func(cls, metaclasses, is_instance)
    return wrapper


def tree_name_to_values(func):
    def wrapper(inference_state, context, tree_name):
        result = func(inference_state, context, tree_name)
        if tree_name.value in _FILTER_LIKE_METHODS:
            # Here we try to overwrite stuff like User.objects.filter. We need
            # this to make sure that keyword param completion works on these
            # kind of methods.
            for v in result:
                if v.get_qualified_names() == ('_BaseQuerySet', tree_name.value) \
                        and v.parent_context.is_module() \
                        and v.parent_context.py__name__() == 'django.db.models.query':
                    qs = context.get_value()
                    generics = qs.get_generics()
                    if len(generics) >= 1:
                        return ValueSet(QuerySetMethodWrapper(v, model)
                                        for model in generics[0])

        elif tree_name.value == 'BaseManager' and context.is_module() \
                and context.py__name__() == 'django.db.models.manager':
            return ValueSet(ManagerWrapper(r) for r in result)

        elif tree_name.value == 'Field' and context.is_module() \
                and context.py__name__() == 'django.db.models.fields':
            return ValueSet(FieldWrapper(r) for r in result)
        return result
    return wrapper


def _find_fields(cls):
    for name in _new_dict_filter(cls, is_instance=False).values():
        for value in name.infer():
            if value.name.get_qualified_names(include_module_names=True) \
                    == ('django', 'db', 'models', 'query_utils', 'DeferredAttribute'):
                yield name


def _get_signatures(cls):
    return [DjangoModelSignature(cls, field_names=list(_find_fields(cls)))]


def get_metaclass_signatures(func):
    def wrapper(cls, metaclasses):
        for metaclass in metaclasses:
            if is_django_model_base(metaclass):
                return _get_signatures(cls)
        return func(cls, metaclass)
    return wrapper


class ManagerWrapper(ValueWrapper):
    def py__getitem__(self, index_value_set, contextualized_node):
        return ValueSet(
            GenericManagerWrapper(generic)
            for generic in self._wrapped_value.py__getitem__(
                index_value_set, contextualized_node)
        )


class GenericManagerWrapper(AttributeOverwrite, ClassMixin):
    def py__get__on_class(self, calling_instance, instance, class_value):
        return calling_instance.class_value.with_generics(
            (ValueSet({class_value}),)
        ).py__call__(calling_instance._arguments)

    def with_generics(self, generics_tuple):
        return self._wrapped_value.with_generics(generics_tuple)


class FieldWrapper(ValueWrapper):
    def py__getitem__(self, index_value_set, contextualized_node):
        return ValueSet(
            GenericFieldWrapper(generic)
            for generic in self._wrapped_value.py__getitem__(
                index_value_set, contextualized_node)
        )


class GenericFieldWrapper(AttributeOverwrite, ClassMixin):
    def py__get__on_class(self, calling_instance, instance, class_value):
        # This is mostly an optimization to avoid Jedi aborting inference,
        # because of too many function executions of Field.__get__.
        return ValueSet({calling_instance})


class DjangoModelSignature(AbstractSignature):
    def __init__(self, value, field_names):
        super().__init__(value)
        self._field_names = field_names

    def get_param_names(self, resolve_stars=False):
        return [DjangoParamName(name) for name in self._field_names]


class DjangoParamName(BaseTreeParamName):
    def __init__(self, field_name):
        super().__init__(field_name.parent_context, field_name.tree_name)
        self._field_name = field_name

    def get_kind(self):
        return Parameter.KEYWORD_ONLY

    def infer(self):
        return self._field_name.infer()


class QuerySetMethodWrapper(ValueWrapper):
    def __init__(self, method, model_cls):
        super().__init__(method)
        self._model_cls = model_cls

    def py__get__(self, instance, class_value):
        return ValueSet({QuerySetBoundMethodWrapper(v, self._model_cls)
                         for v in self._wrapped_value.py__get__(instance, class_value)})


class QuerySetBoundMethodWrapper(ValueWrapper):
    def __init__(self, method, model_cls):
        super().__init__(method)
        self._model_cls = model_cls

    def get_signatures(self):
        return _get_signatures(self._model_cls)
