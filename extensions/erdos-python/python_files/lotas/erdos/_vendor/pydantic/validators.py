import math
import re
from collections import OrderedDict, deque
from collections.abc import Hashable as CollectionsHashable
from datetime import date, datetime, time, timedelta
from decimal import Decimal, DecimalException
from enum import Enum, IntEnum
from ipaddress import IPv4Address, IPv4Interface, IPv4Network, IPv6Address, IPv6Interface, IPv6Network
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Deque,
    Dict,
    ForwardRef,
    FrozenSet,
    Generator,
    Hashable,
    List,
    NamedTuple,
    Pattern,
    Set,
    Tuple,
    Type,
    TypeVar,
    Union,
)
from uuid import UUID
from warnings import warn

from lotas.erdos._vendor.pydantic import errors
from lotas.erdos._vendor.pydantic.datetime_parse import parse_date, parse_datetime, parse_duration, parse_time
from lotas.erdos._vendor.pydantic.typing import (
    AnyCallable,
    all_literal_values,
    display_as_type,
    get_class,
    is_callable_type,
    is_literal_type,
    is_namedtuple,
    is_none_type,
    is_typeddict,
)
from lotas.erdos._vendor.pydantic.utils import almost_equal_floats, lenient_issubclass, sequence_like

if TYPE_CHECKING:
    from lotas.erdos._vendor.typing_extensions import Literal, TypedDict

    from lotas.erdos._vendor.pydantic.config import BaseConfig
    from lotas.erdos._vendor.pydantic.fields import ModelField
    from lotas.erdos._vendor.pydantic.types import ConstrainedDecimal, ConstrainedFloat, ConstrainedInt

    ConstrainedNumber = Union[ConstrainedDecimal, ConstrainedFloat, ConstrainedInt]
    AnyOrderedDict = OrderedDict[Any, Any]
    Number = Union[int, float, Decimal]
    StrBytes = Union[str, bytes]


def str_validator(v: Any) -> Union[str]:
    if isinstance(v, str):
        if isinstance(v, Enum):
            return v.value
        else:
            return v
    elif isinstance(v, (float, int, Decimal)):
        # is there anything else we want to add here? If you think so, create an issue.
        return str(v)
    elif isinstance(v, (bytes, bytearray)):
        return v.decode()
    else:
        raise errors.StrError()


def strict_str_validator(v: Any) -> Union[str]:
    if isinstance(v, str) and not isinstance(v, Enum):
        return v
    raise errors.StrError()


def bytes_validator(v: Any) -> Union[bytes]:
    if isinstance(v, bytes):
        return v
    elif isinstance(v, bytearray):
        return bytes(v)
    elif isinstance(v, str):
        return v.encode()
    elif isinstance(v, (float, int, Decimal)):
        return str(v).encode()
    else:
        raise errors.BytesError()


def strict_bytes_validator(v: Any) -> Union[bytes]:
    if isinstance(v, bytes):
        return v
    elif isinstance(v, bytearray):
        return bytes(v)
    else:
        raise errors.BytesError()


BOOL_FALSE = {0, '0', 'off', 'f', 'false', 'n', 'no'}
BOOL_TRUE = {1, '1', 'on', 't', 'true', 'y', 'yes'}


def bool_validator(v: Any) -> bool:
    if v is True or v is False:
        return v
    if isinstance(v, bytes):
        v = v.decode()
    if isinstance(v, str):
        v = v.lower()
    try:
        if v in BOOL_TRUE:
            return True
        if v in BOOL_FALSE:
            return False
    except TypeError:
        raise errors.BoolError()
    raise errors.BoolError()


# matches the default limit cpython, see https://github.com/python/cpython/pull/96500
max_str_int = 4_300


def int_validator(v: Any) -> int:
    if isinstance(v, int) and not (v is True or v is False):
        return v

    # see https://github.com/pydantic/pydantic/issues/1477 and in turn, https://github.com/python/cpython/issues/95778
    # this check should be unnecessary once patch releases are out for 3.7, 3.8, 3.9 and 3.10
    # but better to check here until then.
    # NOTICE: this does not fully protect user from the DOS risk since the standard library JSON implementation
    # (and other std lib modules like xml) use `int()` and are likely called before this, the best workaround is to
    # 1. update to the latest patch release of python once released, 2. use a different JSON library like ujson
    if isinstance(v, (str, bytes, bytearray)) and len(v) > max_str_int:
        raise errors.IntegerError()

    try:
        return int(v)
    except (TypeError, ValueError, OverflowError):
        raise errors.IntegerError()


def strict_int_validator(v: Any) -> int:
    if isinstance(v, int) and not (v is True or v is False):
        return v
    raise errors.IntegerError()


def float_validator(v: Any) -> float:
    if isinstance(v, float):
        return v

    try:
        return float(v)
    except (TypeError, ValueError):
        raise errors.FloatError()


def strict_float_validator(v: Any) -> float:
    if isinstance(v, float):
        return v
    raise errors.FloatError()


def float_finite_validator(v: 'Number', field: 'ModelField', config: 'BaseConfig') -> 'Number':
    allow_inf_nan = getattr(field.type_, 'allow_inf_nan', None)
    if allow_inf_nan is None:
        allow_inf_nan = config.allow_inf_nan

    if allow_inf_nan is False and (math.isnan(v) or math.isinf(v)):
        raise errors.NumberNotFiniteError()
    return v


def number_multiple_validator(v: 'Number', field: 'ModelField') -> 'Number':
    field_type: ConstrainedNumber = field.type_
    if field_type.multiple_of is not None:
        mod = float(v) / float(field_type.multiple_of) % 1
        if not almost_equal_floats(mod, 0.0) and not almost_equal_floats(mod, 1.0):
            raise errors.NumberNotMultipleError(multiple_of=field_type.multiple_of)
    return v


def number_size_validator(v: 'Number', field: 'ModelField') -> 'Number':
    field_type: ConstrainedNumber = field.type_
    if field_type.gt is not None and not v > field_type.gt:
        raise errors.NumberNotGtError(limit_value=field_type.gt)
    elif field_type.ge is not None and not v >= field_type.ge:
        raise errors.NumberNotGeError(limit_value=field_type.ge)

    if field_type.lt is not None and not v < field_type.lt:
        raise errors.NumberNotLtError(limit_value=field_type.lt)
    if field_type.le is not None and not v <= field_type.le:
        raise errors.NumberNotLeError(limit_value=field_type.le)

    return v


def constant_validator(v: 'Any', field: 'ModelField') -> 'Any':
    """Validate ``const`` fields.

    The value provided for a ``const`` field must be equal to the default value
    of the field. This is to support the keyword of the same name in JSON
    Schema.
    """
    if v != field.default:
        raise errors.WrongConstantError(given=v, permitted=[field.default])

    return v


def anystr_length_validator(v: 'StrBytes', config: 'BaseConfig') -> 'StrBytes':
    v_len = len(v)

    min_length = config.min_anystr_length
    if v_len < min_length:
        raise errors.AnyStrMinLengthError(limit_value=min_length)

    max_length = config.max_anystr_length
    if max_length is not None and v_len > max_length:
        raise errors.AnyStrMaxLengthError(limit_value=max_length)

    return v


def anystr_strip_whitespace(v: 'StrBytes') -> 'StrBytes':
    return v.strip()


def anystr_upper(v: 'StrBytes') -> 'StrBytes':
    return v.upper()


def anystr_lower(v: 'StrBytes') -> 'StrBytes':
    return v.lower()


def ordered_dict_validator(v: Any) -> 'AnyOrderedDict':
    if isinstance(v, OrderedDict):
        return v

    try:
        return OrderedDict(v)
    except (TypeError, ValueError):
        raise errors.DictError()


def dict_validator(v: Any) -> Dict[Any, Any]:
    if isinstance(v, dict):
        return v

    try:
        return dict(v)
    except (TypeError, ValueError):
        raise errors.DictError()


def list_validator(v: Any) -> List[Any]:
    if isinstance(v, list):
        return v
    elif sequence_like(v):
        return list(v)
    else:
        raise errors.ListError()


def tuple_validator(v: Any) -> Tuple[Any, ...]:
    if isinstance(v, tuple):
        return v
    elif sequence_like(v):
        return tuple(v)
    else:
        raise errors.TupleError()


def set_validator(v: Any) -> Set[Any]:
    if isinstance(v, set):
        return v
    elif sequence_like(v):
        return set(v)
    else:
        raise errors.SetError()


def frozenset_validator(v: Any) -> FrozenSet[Any]:
    if isinstance(v, frozenset):
        return v
    elif sequence_like(v):
        return frozenset(v)
    else:
        raise errors.FrozenSetError()


def deque_validator(v: Any) -> Deque[Any]:
    if isinstance(v, deque):
        return v
    elif sequence_like(v):
        return deque(v)
    else:
        raise errors.DequeError()


def enum_member_validator(v: Any, field: 'ModelField', config: 'BaseConfig') -> Enum:
    try:
        enum_v = field.type_(v)
    except ValueError:
        # field.type_ should be an enum, so will be iterable
        raise errors.EnumMemberError(enum_values=list(field.type_))
    return enum_v.value if config.use_enum_values else enum_v


def uuid_validator(v: Any, field: 'ModelField') -> UUID:
    try:
        if isinstance(v, str):
            v = UUID(v)
        elif isinstance(v, (bytes, bytearray)):
            try:
                v = UUID(v.decode())
            except ValueError:
                # 16 bytes in big-endian order as the bytes argument fail
                # the above check
                v = UUID(bytes=v)
    except ValueError:
        raise errors.UUIDError()

    if not isinstance(v, UUID):
        raise errors.UUIDError()

    required_version = getattr(field.type_, '_required_version', None)
    if required_version and v.version != required_version:
        raise errors.UUIDVersionError(required_version=required_version)

    return v


def decimal_validator(v: Any) -> Decimal:
    if isinstance(v, Decimal):
        return v
    elif isinstance(v, (bytes, bytearray)):
        v = v.decode()

    v = str(v).strip()

    try:
        v = Decimal(v)
    except DecimalException:
        raise errors.DecimalError()

    if not v.is_finite():
        raise errors.DecimalIsNotFiniteError()

    return v


def hashable_validator(v: Any) -> Hashable:
    if isinstance(v, Hashable):
        return v

    raise errors.HashableError()


def ip_v4_address_validator(v: Any) -> IPv4Address:
    if isinstance(v, IPv4Address):
        return v

    try:
        return IPv4Address(v)
    except ValueError:
        raise errors.IPv4AddressError()


def ip_v6_address_validator(v: Any) -> IPv6Address:
    if isinstance(v, IPv6Address):
        return v

    try:
        return IPv6Address(v)
    except ValueError:
        raise errors.IPv6AddressError()


def ip_v4_network_validator(v: Any) -> IPv4Network:
    """
    Assume IPv4Network initialised with a default ``strict`` argument

    See more:
    https://docs.python.org/library/ipaddress.html#ipaddress.IPv4Network
    """
    if isinstance(v, IPv4Network):
        return v

    try:
        return IPv4Network(v)
    except ValueError:
        raise errors.IPv4NetworkError()


def ip_v6_network_validator(v: Any) -> IPv6Network:
    """
    Assume IPv6Network initialised with a default ``strict`` argument

    See more:
    https://docs.python.org/library/ipaddress.html#ipaddress.IPv6Network
    """
    if isinstance(v, IPv6Network):
        return v

    try:
        return IPv6Network(v)
    except ValueError:
        raise errors.IPv6NetworkError()


def ip_v4_interface_validator(v: Any) -> IPv4Interface:
    if isinstance(v, IPv4Interface):
        return v

    try:
        return IPv4Interface(v)
    except ValueError:
        raise errors.IPv4InterfaceError()


def ip_v6_interface_validator(v: Any) -> IPv6Interface:
    if isinstance(v, IPv6Interface):
        return v

    try:
        return IPv6Interface(v)
    except ValueError:
        raise errors.IPv6InterfaceError()


def path_validator(v: Any) -> Path:
    if isinstance(v, Path):
        return v

    try:
        return Path(v)
    except TypeError:
        raise errors.PathError()


def path_exists_validator(v: Any) -> Path:
    if not v.exists():
        raise errors.PathNotExistsError(path=v)

    return v


def callable_validator(v: Any) -> AnyCallable:
    """
    Perform a simple check if the value is callable.

    Note: complete matching of argument type hints and return types is not performed
    """
    if callable(v):
        return v

    raise errors.CallableError(value=v)


def enum_validator(v: Any) -> Enum:
    if isinstance(v, Enum):
        return v

    raise errors.EnumError(value=v)


def int_enum_validator(v: Any) -> IntEnum:
    if isinstance(v, IntEnum):
        return v

    raise errors.IntEnumError(value=v)


def make_literal_validator(type_: Any) -> Callable[[Any], Any]:
    permitted_choices = all_literal_values(type_)

    # To have a O(1) complexity and still return one of the values set inside the `Literal`,
    # we create a dict with the set values (a set causes some problems with the way intersection works).
    # In some cases the set value and checked value can indeed be different (see `test_literal_validator_str_enum`)
    allowed_choices = {v: v for v in permitted_choices}

    def literal_validator(v: Any) -> Any:
        try:
            return allowed_choices[v]
        except (KeyError, TypeError):
            raise errors.WrongConstantError(given=v, permitted=permitted_choices)

    return literal_validator


def constr_length_validator(v: 'StrBytes', field: 'ModelField', config: 'BaseConfig') -> 'StrBytes':
    v_len = len(v)

    min_length = field.type_.min_length if field.type_.min_length is not None else config.min_anystr_length
    if v_len < min_length:
        raise errors.AnyStrMinLengthError(limit_value=min_length)

    max_length = field.type_.max_length if field.type_.max_length is not None else config.max_anystr_length
    if max_length is not None and v_len > max_length:
        raise errors.AnyStrMaxLengthError(limit_value=max_length)

    return v


def constr_strip_whitespace(v: 'StrBytes', field: 'ModelField', config: 'BaseConfig') -> 'StrBytes':
    strip_whitespace = field.type_.strip_whitespace or config.anystr_strip_whitespace
    if strip_whitespace:
        v = v.strip()

    return v


def constr_upper(v: 'StrBytes', field: 'ModelField', config: 'BaseConfig') -> 'StrBytes':
    upper = field.type_.to_upper or config.anystr_upper
    if upper:
        v = v.upper()

    return v


def constr_lower(v: 'StrBytes', field: 'ModelField', config: 'BaseConfig') -> 'StrBytes':
    lower = field.type_.to_lower or config.anystr_lower
    if lower:
        v = v.lower()
    return v


def validate_json(v: Any, config: 'BaseConfig') -> Any:
    if v is None:
        # pass None through to other validators
        return v
    try:
        return config.json_loads(v)  # type: ignore
    except ValueError:
        raise errors.JsonError()
    except TypeError:
        raise errors.JsonTypeError()


T = TypeVar('T')


def make_arbitrary_type_validator(type_: Type[T]) -> Callable[[T], T]:
    def arbitrary_type_validator(v: Any) -> T:
        if isinstance(v, type_):
            return v
        raise errors.ArbitraryTypeError(expected_arbitrary_type=type_)

    return arbitrary_type_validator


def make_class_validator(type_: Type[T]) -> Callable[[Any], Type[T]]:
    def class_validator(v: Any) -> Type[T]:
        if lenient_issubclass(v, type_):
            return v
        raise errors.SubclassError(expected_class=type_)

    return class_validator


def any_class_validator(v: Any) -> Type[T]:
    if isinstance(v, type):
        return v
    raise errors.ClassError()


def none_validator(v: Any) -> 'Literal[None]':
    if v is None:
        return v
    raise errors.NotNoneError()


def pattern_validator(v: Any) -> Pattern[str]:
    if isinstance(v, Pattern):
        return v

    str_value = str_validator(v)

    try:
        return re.compile(str_value)
    except re.error:
        raise errors.PatternError()


NamedTupleT = TypeVar('NamedTupleT', bound=NamedTuple)


def make_namedtuple_validator(
    namedtuple_cls: Type[NamedTupleT], config: Type['BaseConfig']
) -> Callable[[Tuple[Any, ...]], NamedTupleT]:
    from lotas.erdos._vendor.pydantic.annotated_types import create_model_from_namedtuple

    NamedTupleModel = create_model_from_namedtuple(
        namedtuple_cls,
        __config__=config,
        __module__=namedtuple_cls.__module__,
    )
    namedtuple_cls.__pydantic_model__ = NamedTupleModel  # type: ignore[attr-defined]

    def namedtuple_validator(values: Tuple[Any, ...]) -> NamedTupleT:
        annotations = NamedTupleModel.__annotations__

        if len(values) > len(annotations):
            raise errors.ListMaxLengthError(limit_value=len(annotations))

        dict_values: Dict[str, Any] = dict(zip(annotations, values))
        validated_dict_values: Dict[str, Any] = dict(NamedTupleModel(**dict_values))
        return namedtuple_cls(**validated_dict_values)

    return namedtuple_validator


def make_typeddict_validator(
    typeddict_cls: Type['TypedDict'], config: Type['BaseConfig']  # type: ignore[valid-type]
) -> Callable[[Any], Dict[str, Any]]:
    from lotas.erdos._vendor.pydantic.annotated_types import create_model_from_typeddict

    TypedDictModel = create_model_from_typeddict(
        typeddict_cls,
        __config__=config,
        __module__=typeddict_cls.__module__,
    )
    typeddict_cls.__pydantic_model__ = TypedDictModel  # type: ignore[attr-defined]

    def typeddict_validator(values: 'TypedDict') -> Dict[str, Any]:  # type: ignore[valid-type]
        return TypedDictModel.parse_obj(values).dict(exclude_unset=True)

    return typeddict_validator


class IfConfig:
    def __init__(self, validator: AnyCallable, *config_attr_names: str, ignored_value: Any = False) -> None:
        self.validator = validator
        self.config_attr_names = config_attr_names
        self.ignored_value = ignored_value

    def check(self, config: Type['BaseConfig']) -> bool:
        return any(getattr(config, name) not in {None, self.ignored_value} for name in self.config_attr_names)


# order is important here, for example: bool is a subclass of int so has to come first, datetime before date same,
# IPv4Interface before IPv4Address, etc
_VALIDATORS: List[Tuple[Type[Any], List[Any]]] = [
    (IntEnum, [int_validator, enum_member_validator]),
    (Enum, [enum_member_validator]),
    (
        str,
        [
            str_validator,
            IfConfig(anystr_strip_whitespace, 'anystr_strip_whitespace'),
            IfConfig(anystr_upper, 'anystr_upper'),
            IfConfig(anystr_lower, 'anystr_lower'),
            IfConfig(anystr_length_validator, 'min_anystr_length', 'max_anystr_length'),
        ],
    ),
    (
        bytes,
        [
            bytes_validator,
            IfConfig(anystr_strip_whitespace, 'anystr_strip_whitespace'),
            IfConfig(anystr_upper, 'anystr_upper'),
            IfConfig(anystr_lower, 'anystr_lower'),
            IfConfig(anystr_length_validator, 'min_anystr_length', 'max_anystr_length'),
        ],
    ),
    (bool, [bool_validator]),
    (int, [int_validator]),
    (float, [float_validator, IfConfig(float_finite_validator, 'allow_inf_nan', ignored_value=True)]),
    (Path, [path_validator]),
    (datetime, [parse_datetime]),
    (date, [parse_date]),
    (time, [parse_time]),
    (timedelta, [parse_duration]),
    (OrderedDict, [ordered_dict_validator]),
    (dict, [dict_validator]),
    (list, [list_validator]),
    (tuple, [tuple_validator]),
    (set, [set_validator]),
    (frozenset, [frozenset_validator]),
    (deque, [deque_validator]),
    (UUID, [uuid_validator]),
    (Decimal, [decimal_validator]),
    (IPv4Interface, [ip_v4_interface_validator]),
    (IPv6Interface, [ip_v6_interface_validator]),
    (IPv4Address, [ip_v4_address_validator]),
    (IPv6Address, [ip_v6_address_validator]),
    (IPv4Network, [ip_v4_network_validator]),
    (IPv6Network, [ip_v6_network_validator]),
]


def find_validators(  # noqa: C901 (ignore complexity)
    type_: Type[Any], config: Type['BaseConfig']
) -> Generator[AnyCallable, None, None]:
    from lotas.erdos._vendor.pydantic.dataclasses import is_builtin_dataclass, make_dataclass_validator

    if type_ is Any or type_ is object:
        return
    type_type = type_.__class__
    if type_type == ForwardRef or type_type == TypeVar:
        return

    if is_none_type(type_):
        yield none_validator
        return
    if type_ is Pattern or type_ is re.Pattern:
        yield pattern_validator
        return
    if type_ is Hashable or type_ is CollectionsHashable:
        yield hashable_validator
        return
    if is_callable_type(type_):
        yield callable_validator
        return
    if is_literal_type(type_):
        yield make_literal_validator(type_)
        return
    if is_builtin_dataclass(type_):
        yield from make_dataclass_validator(type_, config)
        return
    if type_ is Enum:
        yield enum_validator
        return
    if type_ is IntEnum:
        yield int_enum_validator
        return
    if is_namedtuple(type_):
        yield tuple_validator
        yield make_namedtuple_validator(type_, config)
        return
    if is_typeddict(type_):
        yield make_typeddict_validator(type_, config)
        return

    class_ = get_class(type_)
    if class_ is not None:
        if class_ is not Any and isinstance(class_, type):
            yield make_class_validator(class_)
        else:
            yield any_class_validator
        return

    for val_type, validators in _VALIDATORS:
        try:
            if issubclass(type_, val_type):
                for v in validators:
                    if isinstance(v, IfConfig):
                        if v.check(config):
                            yield v.validator
                    else:
                        yield v
                return
        except TypeError:
            raise RuntimeError(f'error checking inheritance of {type_!r} (type: {display_as_type(type_)})')

    if config.arbitrary_types_allowed:
        yield make_arbitrary_type_validator(type_)
    else:
        if hasattr(type_, '__pydantic_core_schema__'):
            warn(f'Mixing V1 and V2 models is not supported. `{type_.__name__}` is a V2 model.', UserWarning)
        raise RuntimeError(f'no validator found for {type_}, see `arbitrary_types_allowed` in Config')
