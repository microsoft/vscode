import sys
import types
import typing
from typing import (
    TYPE_CHECKING,
    Any,
    ClassVar,
    Dict,
    ForwardRef,
    Generic,
    Iterator,
    List,
    Mapping,
    Optional,
    Tuple,
    Type,
    TypeVar,
    Union,
    cast,
)
from weakref import WeakKeyDictionary, WeakValueDictionary

from erdos._vendor.typing_extensions import Annotated, Literal as ExtLiteral

from erdos._vendor.pydantic.class_validators import gather_all_validators
from erdos._vendor.pydantic.fields import DeferredType
from erdos._vendor.pydantic.main import BaseModel, create_model
from erdos._vendor.pydantic.types import JsonWrapper
from erdos._vendor.pydantic.typing import display_as_type, get_all_type_hints, get_args, get_origin, typing_base
from erdos._vendor.pydantic.utils import all_identical, lenient_issubclass

if sys.version_info >= (3, 10):
    from typing import _UnionGenericAlias
if sys.version_info >= (3, 8):
    from typing import Literal

GenericModelT = TypeVar('GenericModelT', bound='GenericModel')
TypeVarType = Any  # since mypy doesn't allow the use of TypeVar as a type

CacheKey = Tuple[Type[Any], Any, Tuple[Any, ...]]
Parametrization = Mapping[TypeVarType, Type[Any]]

# weak dictionaries allow the dynamically created parametrized versions of generic models to get collected
# once they are no longer referenced by the caller.
if sys.version_info >= (3, 9):  # Typing for weak dictionaries available at 3.9
    GenericTypesCache = WeakValueDictionary[CacheKey, Type[BaseModel]]
    AssignedParameters = WeakKeyDictionary[Type[BaseModel], Parametrization]
else:
    GenericTypesCache = WeakValueDictionary
    AssignedParameters = WeakKeyDictionary

# _generic_types_cache is a Mapping from __class_getitem__ arguments to the parametrized version of generic models.
# This ensures multiple calls of e.g. A[B] return always the same class.
_generic_types_cache = GenericTypesCache()

# _assigned_parameters is a Mapping from parametrized version of generic models to assigned types of parametrizations
# as captured during construction of the class (not instances).
# E.g., for generic model `Model[A, B]`, when parametrized model `Model[int, str]` is created,
# `Model[int, str]`: {A: int, B: str}` will be stored in `_assigned_parameters`.
# (This information is only otherwise available after creation from the class name string).
_assigned_parameters = AssignedParameters()


class GenericModel(BaseModel):
    __slots__ = ()
    __concrete__: ClassVar[bool] = False

    if TYPE_CHECKING:
        # Putting this in a TYPE_CHECKING block allows us to replace `if Generic not in cls.__bases__` with
        # `not hasattr(cls, "__parameters__")`. This means we don't need to force non-concrete subclasses of
        # `GenericModel` to also inherit from `Generic`, which would require changes to the use of `create_model` below.
        __parameters__: ClassVar[Tuple[TypeVarType, ...]]

    # Setting the return type as Type[Any] instead of Type[BaseModel] prevents PyCharm warnings
    def __class_getitem__(cls: Type[GenericModelT], params: Union[Type[Any], Tuple[Type[Any], ...]]) -> Type[Any]:
        """Instantiates a new class from a generic class `cls` and type variables `params`.

        :param params: Tuple of types the class . Given a generic class
            `Model` with 2 type variables and a concrete model `Model[str, int]`,
            the value `(str, int)` would be passed to `params`.
        :return: New model class inheriting from `cls` with instantiated
            types described by `params`. If no parameters are given, `cls` is
            returned as is.

        """

        def _cache_key(_params: Any) -> CacheKey:
            args = get_args(_params)
            # python returns a list for Callables, which is not hashable
            if len(args) == 2 and isinstance(args[0], list):
                args = (tuple(args[0]), args[1])
            return cls, _params, args

        cached = _generic_types_cache.get(_cache_key(params))
        if cached is not None:
            return cached
        if cls.__concrete__ and Generic not in cls.__bases__:
            raise TypeError('Cannot parameterize a concrete instantiation of a generic model')
        if not isinstance(params, tuple):
            params = (params,)
        if cls is GenericModel and any(isinstance(param, TypeVar) for param in params):
            raise TypeError('Type parameters should be placed on typing.Generic, not GenericModel')
        if not hasattr(cls, '__parameters__'):
            raise TypeError(f'Type {cls.__name__} must inherit from typing.Generic before being parameterized')

        check_parameters_count(cls, params)
        # Build map from generic typevars to passed params
        typevars_map: Dict[TypeVarType, Type[Any]] = dict(zip(cls.__parameters__, params))
        if all_identical(typevars_map.keys(), typevars_map.values()) and typevars_map:
            return cls  # if arguments are equal to parameters it's the same object

        # Create new model with original model as parent inserting fields with DeferredType.
        model_name = cls.__concrete_name__(params)
        validators = gather_all_validators(cls)

        type_hints = get_all_type_hints(cls).items()
        instance_type_hints = {k: v for k, v in type_hints if get_origin(v) is not ClassVar}

        fields = {k: (DeferredType(), cls.__fields__[k].field_info) for k in instance_type_hints if k in cls.__fields__}

        model_module, called_globally = get_caller_frame_info()
        created_model = cast(
            Type[GenericModel],  # casting ensures mypy is aware of the __concrete__ and __parameters__ attributes
            create_model(
                model_name,
                __module__=model_module or cls.__module__,
                __base__=(cls,) + tuple(cls.__parameterized_bases__(typevars_map)),
                __config__=None,
                __validators__=validators,
                __cls_kwargs__=None,
                **fields,
            ),
        )

        _assigned_parameters[created_model] = typevars_map

        if called_globally:  # create global reference and therefore allow pickling
            object_by_reference = None
            reference_name = model_name
            reference_module_globals = sys.modules[created_model.__module__].__dict__
            while object_by_reference is not created_model:
                object_by_reference = reference_module_globals.setdefault(reference_name, created_model)
                reference_name += '_'

        created_model.Config = cls.Config

        # Find any typevars that are still present in the model.
        # If none are left, the model is fully "concrete", otherwise the new
        # class is a generic class as well taking the found typevars as
        # parameters.
        new_params = tuple(
            {param: None for param in iter_contained_typevars(typevars_map.values())}
        )  # use dict as ordered set
        created_model.__concrete__ = not new_params
        if new_params:
            created_model.__parameters__ = new_params

        # Save created model in cache so we don't end up creating duplicate
        # models that should be identical.
        _generic_types_cache[_cache_key(params)] = created_model
        if len(params) == 1:
            _generic_types_cache[_cache_key(params[0])] = created_model

        # Recursively walk class type hints and replace generic typevars
        # with concrete types that were passed.
        _prepare_model_fields(created_model, fields, instance_type_hints, typevars_map)

        return created_model

    @classmethod
    def __concrete_name__(cls: Type[Any], params: Tuple[Type[Any], ...]) -> str:
        """Compute class name for child classes.

        :param params: Tuple of types the class . Given a generic class
            `Model` with 2 type variables and a concrete model `Model[str, int]`,
            the value `(str, int)` would be passed to `params`.
        :return: String representing a the new class where `params` are
            passed to `cls` as type variables.

        This method can be overridden to achieve a custom naming scheme for GenericModels.
        """
        param_names = [display_as_type(param) for param in params]
        params_component = ', '.join(param_names)
        return f'{cls.__name__}[{params_component}]'

    @classmethod
    def __parameterized_bases__(cls, typevars_map: Parametrization) -> Iterator[Type[Any]]:
        """
        Returns unbound bases of cls parameterised to given type variables

        :param typevars_map: Dictionary of type applications for binding subclasses.
            Given a generic class `Model` with 2 type variables [S, T]
            and a concrete model `Model[str, int]`,
            the value `{S: str, T: int}` would be passed to `typevars_map`.
        :return: an iterator of generic sub classes, parameterised by `typevars_map`
            and other assigned parameters of `cls`

        e.g.:
        ```
        class A(GenericModel, Generic[T]):
            ...

        class B(A[V], Generic[V]):
            ...

        assert A[int] in B.__parameterized_bases__({V: int})
        ```
        """

        def build_base_model(
            base_model: Type[GenericModel], mapped_types: Parametrization
        ) -> Iterator[Type[GenericModel]]:
            base_parameters = tuple(mapped_types[param] for param in base_model.__parameters__)
            parameterized_base = base_model.__class_getitem__(base_parameters)
            if parameterized_base is base_model or parameterized_base is cls:
                # Avoid duplication in MRO
                return
            yield parameterized_base

        for base_model in cls.__bases__:
            if not issubclass(base_model, GenericModel):
                # not a class that can be meaningfully parameterized
                continue
            elif not getattr(base_model, '__parameters__', None):
                # base_model is "GenericModel"  (and has no __parameters__)
                # or
                # base_model is already concrete, and will be included transitively via cls.
                continue
            elif cls in _assigned_parameters:
                if base_model in _assigned_parameters:
                    # cls is partially parameterised but not from base_model
                    # e.g. cls = B[S], base_model = A[S]
                    # B[S][int] should subclass A[int],  (and will be transitively via B[int])
                    # but it's not viable to consistently subclass types with arbitrary construction
                    # So don't attempt to include A[S][int]
                    continue
                else:  # base_model not in _assigned_parameters:
                    # cls is partially parameterized, base_model is original generic
                    # e.g.  cls = B[str, T], base_model = B[S, T]
                    # Need to determine the mapping for the base_model parameters
                    mapped_types: Parametrization = {
                        key: typevars_map.get(value, value) for key, value in _assigned_parameters[cls].items()
                    }
                    yield from build_base_model(base_model, mapped_types)
            else:
                # cls is base generic, so base_class has a distinct base
                # can construct the Parameterised base model using typevars_map directly
                yield from build_base_model(base_model, typevars_map)


def replace_types(type_: Any, type_map: Mapping[Any, Any]) -> Any:
    """Return type with all occurrences of `type_map` keys recursively replaced with their values.

    :param type_: Any type, class or generic alias
    :param type_map: Mapping from `TypeVar` instance to concrete types.
    :return: New type representing the basic structure of `type_` with all
        `typevar_map` keys recursively replaced.

    >>> replace_types(Tuple[str, Union[List[str], float]], {str: int})
    Tuple[int, Union[List[int], float]]

    """
    if not type_map:
        return type_

    type_args = get_args(type_)
    origin_type = get_origin(type_)

    if origin_type is Annotated:
        annotated_type, *annotations = type_args
        return Annotated[replace_types(annotated_type, type_map), tuple(annotations)]

    if (origin_type is ExtLiteral) or (sys.version_info >= (3, 8) and origin_type is Literal):
        return type_map.get(type_, type_)
    # Having type args is a good indicator that this is a typing module
    # class instantiation or a generic alias of some sort.
    if type_args:
        resolved_type_args = tuple(replace_types(arg, type_map) for arg in type_args)
        if all_identical(type_args, resolved_type_args):
            # If all arguments are the same, there is no need to modify the
            # type or create a new object at all
            return type_
        if (
            origin_type is not None
            and isinstance(type_, typing_base)
            and not isinstance(origin_type, typing_base)
            and getattr(type_, '_name', None) is not None
        ):
            # In python < 3.9 generic aliases don't exist so any of these like `list`,
            # `type` or `collections.abc.Callable` need to be translated.
            # See: https://www.python.org/dev/peps/pep-0585
            origin_type = getattr(typing, type_._name)
        assert origin_type is not None
        # PEP-604 syntax (Ex.: list | str) is represented with a types.UnionType object that does not have __getitem__.
        # We also cannot use isinstance() since we have to compare types.
        if sys.version_info >= (3, 10) and origin_type is types.UnionType:  # noqa: E721
            return _UnionGenericAlias(origin_type, resolved_type_args)
        return origin_type[resolved_type_args]

    # We handle pydantic generic models separately as they don't have the same
    # semantics as "typing" classes or generic aliases
    if not origin_type and lenient_issubclass(type_, GenericModel) and not type_.__concrete__:
        type_args = type_.__parameters__
        resolved_type_args = tuple(replace_types(t, type_map) for t in type_args)
        if all_identical(type_args, resolved_type_args):
            return type_
        return type_[resolved_type_args]

    # Handle special case for typehints that can have lists as arguments.
    # `typing.Callable[[int, str], int]` is an example for this.
    if isinstance(type_, (List, list)):
        resolved_list = list(replace_types(element, type_map) for element in type_)
        if all_identical(type_, resolved_list):
            return type_
        return resolved_list

    # For JsonWrapperValue, need to handle its inner type to allow correct parsing
    # of generic Json arguments like Json[T]
    if not origin_type and lenient_issubclass(type_, JsonWrapper):
        type_.inner_type = replace_types(type_.inner_type, type_map)
        return type_

    # If all else fails, we try to resolve the type directly and otherwise just
    # return the input with no modifications.
    new_type = type_map.get(type_, type_)
    # Convert string to ForwardRef
    if isinstance(new_type, str):
        return ForwardRef(new_type)
    else:
        return new_type


def check_parameters_count(cls: Type[GenericModel], parameters: Tuple[Any, ...]) -> None:
    actual = len(parameters)
    expected = len(cls.__parameters__)
    if actual != expected:
        description = 'many' if actual > expected else 'few'
        raise TypeError(f'Too {description} parameters for {cls.__name__}; actual {actual}, expected {expected}')


DictValues: Type[Any] = {}.values().__class__


def iter_contained_typevars(v: Any) -> Iterator[TypeVarType]:
    """Recursively iterate through all subtypes and type args of `v` and yield any typevars that are found."""
    if isinstance(v, TypeVar):
        yield v
    elif hasattr(v, '__parameters__') and not get_origin(v) and lenient_issubclass(v, GenericModel):
        yield from v.__parameters__
    elif isinstance(v, (DictValues, list)):
        for var in v:
            yield from iter_contained_typevars(var)
    else:
        args = get_args(v)
        for arg in args:
            yield from iter_contained_typevars(arg)


def get_caller_frame_info() -> Tuple[Optional[str], bool]:
    """
    Used inside a function to check whether it was called globally

    Will only work against non-compiled code, therefore used only in pydantic.generics

    :returns Tuple[module_name, called_globally]
    """
    try:
        previous_caller_frame = sys._getframe(2)
    except ValueError as e:
        raise RuntimeError('This function must be used inside another function') from e
    except AttributeError:  # sys module does not have _getframe function, so there's nothing we can do about it
        return None, False
    frame_globals = previous_caller_frame.f_globals
    return frame_globals.get('__name__'), previous_caller_frame.f_locals is frame_globals


def _prepare_model_fields(
    created_model: Type[GenericModel],
    fields: Mapping[str, Any],
    instance_type_hints: Mapping[str, type],
    typevars_map: Mapping[Any, type],
) -> None:
    """
    Replace DeferredType fields with concrete type hints and prepare them.
    """

    for key, field in created_model.__fields__.items():
        if key not in fields:
            assert field.type_.__class__ is not DeferredType
            # https://github.com/nedbat/coveragepy/issues/198
            continue  # pragma: no cover

        assert field.type_.__class__ is DeferredType, field.type_.__class__

        field_type_hint = instance_type_hints[key]
        concrete_type = replace_types(field_type_hint, typevars_map)
        field.type_ = concrete_type
        field.outer_type_ = concrete_type
        field.prepare()
        created_model.__annotations__[key] = concrete_type
