from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable, Sequence, Set, Tuple, Type, Union

from erdos._vendor.pydantic.typing import display_as_type

if TYPE_CHECKING:
    from erdos._vendor.pydantic.typing import DictStrAny

# explicitly state exports to avoid "from erdos._vendor.pydantic.errors import *" also importing Decimal, Path etc.
__all__ = (
    'PydanticTypeError',
    'PydanticValueError',
    'ConfigError',
    'MissingError',
    'ExtraError',
    'NoneIsNotAllowedError',
    'NoneIsAllowedError',
    'WrongConstantError',
    'NotNoneError',
    'BoolError',
    'BytesError',
    'DictError',
    'EmailError',
    'UrlError',
    'UrlSchemeError',
    'UrlSchemePermittedError',
    'UrlUserInfoError',
    'UrlHostError',
    'UrlHostTldError',
    'UrlPortError',
    'UrlExtraError',
    'EnumError',
    'IntEnumError',
    'EnumMemberError',
    'IntegerError',
    'FloatError',
    'PathError',
    'PathNotExistsError',
    'PathNotAFileError',
    'PathNotADirectoryError',
    'PyObjectError',
    'SequenceError',
    'ListError',
    'SetError',
    'FrozenSetError',
    'TupleError',
    'TupleLengthError',
    'ListMinLengthError',
    'ListMaxLengthError',
    'ListUniqueItemsError',
    'SetMinLengthError',
    'SetMaxLengthError',
    'FrozenSetMinLengthError',
    'FrozenSetMaxLengthError',
    'AnyStrMinLengthError',
    'AnyStrMaxLengthError',
    'StrError',
    'StrRegexError',
    'NumberNotGtError',
    'NumberNotGeError',
    'NumberNotLtError',
    'NumberNotLeError',
    'NumberNotMultipleError',
    'DecimalError',
    'DecimalIsNotFiniteError',
    'DecimalMaxDigitsError',
    'DecimalMaxPlacesError',
    'DecimalWholeDigitsError',
    'DateTimeError',
    'DateError',
    'DateNotInThePastError',
    'DateNotInTheFutureError',
    'TimeError',
    'DurationError',
    'HashableError',
    'UUIDError',
    'UUIDVersionError',
    'ArbitraryTypeError',
    'ClassError',
    'SubclassError',
    'JsonError',
    'JsonTypeError',
    'PatternError',
    'DataclassTypeError',
    'CallableError',
    'IPvAnyAddressError',
    'IPvAnyInterfaceError',
    'IPvAnyNetworkError',
    'IPv4AddressError',
    'IPv6AddressError',
    'IPv4NetworkError',
    'IPv6NetworkError',
    'IPv4InterfaceError',
    'IPv6InterfaceError',
    'ColorError',
    'StrictBoolError',
    'NotDigitError',
    'LuhnValidationError',
    'InvalidLengthForBrand',
    'InvalidByteSize',
    'InvalidByteSizeUnit',
    'MissingDiscriminator',
    'InvalidDiscriminator',
)


def cls_kwargs(cls: Type['PydanticErrorMixin'], ctx: 'DictStrAny') -> 'PydanticErrorMixin':
    """
    For built-in exceptions like ValueError or TypeError, we need to implement
    __reduce__ to override the default behaviour (instead of __getstate__/__setstate__)
    By default pickle protocol 2 calls `cls.__new__(cls, *args)`.
    Since we only use kwargs, we need a little constructor to change that.
    Note: the callable can't be a lambda as pickle looks in the namespace to find it
    """
    return cls(**ctx)


class PydanticErrorMixin:
    code: str
    msg_template: str

    def __init__(self, **ctx: Any) -> None:
        self.__dict__ = ctx

    def __str__(self) -> str:
        return self.msg_template.format(**self.__dict__)

    def __reduce__(self) -> Tuple[Callable[..., 'PydanticErrorMixin'], Tuple[Type['PydanticErrorMixin'], 'DictStrAny']]:
        return cls_kwargs, (self.__class__, self.__dict__)


class PydanticTypeError(PydanticErrorMixin, TypeError):
    pass


class PydanticValueError(PydanticErrorMixin, ValueError):
    pass


class ConfigError(RuntimeError):
    pass


class MissingError(PydanticValueError):
    msg_template = 'field required'


class ExtraError(PydanticValueError):
    msg_template = 'extra fields not permitted'


class NoneIsNotAllowedError(PydanticTypeError):
    code = 'none.not_allowed'
    msg_template = 'none is not an allowed value'


class NoneIsAllowedError(PydanticTypeError):
    code = 'none.allowed'
    msg_template = 'value is not none'


class WrongConstantError(PydanticValueError):
    code = 'const'

    def __str__(self) -> str:
        permitted = ', '.join(repr(v) for v in self.permitted)  # type: ignore
        return f'unexpected value; permitted: {permitted}'


class NotNoneError(PydanticTypeError):
    code = 'not_none'
    msg_template = 'value is not None'


class BoolError(PydanticTypeError):
    msg_template = 'value could not be parsed to a boolean'


class BytesError(PydanticTypeError):
    msg_template = 'byte type expected'


class DictError(PydanticTypeError):
    msg_template = 'value is not a valid dict'


class EmailError(PydanticValueError):
    msg_template = 'value is not a valid email address'


class UrlError(PydanticValueError):
    code = 'url'


class UrlSchemeError(UrlError):
    code = 'url.scheme'
    msg_template = 'invalid or missing URL scheme'


class UrlSchemePermittedError(UrlError):
    code = 'url.scheme'
    msg_template = 'URL scheme not permitted'

    def __init__(self, allowed_schemes: Set[str]):
        super().__init__(allowed_schemes=allowed_schemes)


class UrlUserInfoError(UrlError):
    code = 'url.userinfo'
    msg_template = 'userinfo required in URL but missing'


class UrlHostError(UrlError):
    code = 'url.host'
    msg_template = 'URL host invalid'


class UrlHostTldError(UrlError):
    code = 'url.host'
    msg_template = 'URL host invalid, top level domain required'


class UrlPortError(UrlError):
    code = 'url.port'
    msg_template = 'URL port invalid, port cannot exceed 65535'


class UrlExtraError(UrlError):
    code = 'url.extra'
    msg_template = 'URL invalid, extra characters found after valid URL: {extra!r}'


class EnumMemberError(PydanticTypeError):
    code = 'enum'

    def __str__(self) -> str:
        permitted = ', '.join(repr(v.value) for v in self.enum_values)  # type: ignore
        return f'value is not a valid enumeration member; permitted: {permitted}'


class IntegerError(PydanticTypeError):
    msg_template = 'value is not a valid integer'


class FloatError(PydanticTypeError):
    msg_template = 'value is not a valid float'


class PathError(PydanticTypeError):
    msg_template = 'value is not a valid path'


class _PathValueError(PydanticValueError):
    def __init__(self, *, path: Path) -> None:
        super().__init__(path=str(path))


class PathNotExistsError(_PathValueError):
    code = 'path.not_exists'
    msg_template = 'file or directory at path "{path}" does not exist'


class PathNotAFileError(_PathValueError):
    code = 'path.not_a_file'
    msg_template = 'path "{path}" does not point to a file'


class PathNotADirectoryError(_PathValueError):
    code = 'path.not_a_directory'
    msg_template = 'path "{path}" does not point to a directory'


class PyObjectError(PydanticTypeError):
    msg_template = 'ensure this value contains valid import path or valid callable: {error_message}'


class SequenceError(PydanticTypeError):
    msg_template = 'value is not a valid sequence'


class IterableError(PydanticTypeError):
    msg_template = 'value is not a valid iterable'


class ListError(PydanticTypeError):
    msg_template = 'value is not a valid list'


class SetError(PydanticTypeError):
    msg_template = 'value is not a valid set'


class FrozenSetError(PydanticTypeError):
    msg_template = 'value is not a valid frozenset'


class DequeError(PydanticTypeError):
    msg_template = 'value is not a valid deque'


class TupleError(PydanticTypeError):
    msg_template = 'value is not a valid tuple'


class TupleLengthError(PydanticValueError):
    code = 'tuple.length'
    msg_template = 'wrong tuple length {actual_length}, expected {expected_length}'

    def __init__(self, *, actual_length: int, expected_length: int) -> None:
        super().__init__(actual_length=actual_length, expected_length=expected_length)


class ListMinLengthError(PydanticValueError):
    code = 'list.min_items'
    msg_template = 'ensure this value has at least {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class ListMaxLengthError(PydanticValueError):
    code = 'list.max_items'
    msg_template = 'ensure this value has at most {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class ListUniqueItemsError(PydanticValueError):
    code = 'list.unique_items'
    msg_template = 'the list has duplicated items'


class SetMinLengthError(PydanticValueError):
    code = 'set.min_items'
    msg_template = 'ensure this value has at least {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class SetMaxLengthError(PydanticValueError):
    code = 'set.max_items'
    msg_template = 'ensure this value has at most {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class FrozenSetMinLengthError(PydanticValueError):
    code = 'frozenset.min_items'
    msg_template = 'ensure this value has at least {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class FrozenSetMaxLengthError(PydanticValueError):
    code = 'frozenset.max_items'
    msg_template = 'ensure this value has at most {limit_value} items'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class AnyStrMinLengthError(PydanticValueError):
    code = 'any_str.min_length'
    msg_template = 'ensure this value has at least {limit_value} characters'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class AnyStrMaxLengthError(PydanticValueError):
    code = 'any_str.max_length'
    msg_template = 'ensure this value has at most {limit_value} characters'

    def __init__(self, *, limit_value: int) -> None:
        super().__init__(limit_value=limit_value)


class StrError(PydanticTypeError):
    msg_template = 'str type expected'


class StrRegexError(PydanticValueError):
    code = 'str.regex'
    msg_template = 'string does not match regex "{pattern}"'

    def __init__(self, *, pattern: str) -> None:
        super().__init__(pattern=pattern)


class _NumberBoundError(PydanticValueError):
    def __init__(self, *, limit_value: Union[int, float, Decimal]) -> None:
        super().__init__(limit_value=limit_value)


class NumberNotGtError(_NumberBoundError):
    code = 'number.not_gt'
    msg_template = 'ensure this value is greater than {limit_value}'


class NumberNotGeError(_NumberBoundError):
    code = 'number.not_ge'
    msg_template = 'ensure this value is greater than or equal to {limit_value}'


class NumberNotLtError(_NumberBoundError):
    code = 'number.not_lt'
    msg_template = 'ensure this value is less than {limit_value}'


class NumberNotLeError(_NumberBoundError):
    code = 'number.not_le'
    msg_template = 'ensure this value is less than or equal to {limit_value}'


class NumberNotFiniteError(PydanticValueError):
    code = 'number.not_finite_number'
    msg_template = 'ensure this value is a finite number'


class NumberNotMultipleError(PydanticValueError):
    code = 'number.not_multiple'
    msg_template = 'ensure this value is a multiple of {multiple_of}'

    def __init__(self, *, multiple_of: Union[int, float, Decimal]) -> None:
        super().__init__(multiple_of=multiple_of)


class DecimalError(PydanticTypeError):
    msg_template = 'value is not a valid decimal'


class DecimalIsNotFiniteError(PydanticValueError):
    code = 'decimal.not_finite'
    msg_template = 'value is not a valid decimal'


class DecimalMaxDigitsError(PydanticValueError):
    code = 'decimal.max_digits'
    msg_template = 'ensure that there are no more than {max_digits} digits in total'

    def __init__(self, *, max_digits: int) -> None:
        super().__init__(max_digits=max_digits)


class DecimalMaxPlacesError(PydanticValueError):
    code = 'decimal.max_places'
    msg_template = 'ensure that there are no more than {decimal_places} decimal places'

    def __init__(self, *, decimal_places: int) -> None:
        super().__init__(decimal_places=decimal_places)


class DecimalWholeDigitsError(PydanticValueError):
    code = 'decimal.whole_digits'
    msg_template = 'ensure that there are no more than {whole_digits} digits before the decimal point'

    def __init__(self, *, whole_digits: int) -> None:
        super().__init__(whole_digits=whole_digits)


class DateTimeError(PydanticValueError):
    msg_template = 'invalid datetime format'


class DateError(PydanticValueError):
    msg_template = 'invalid date format'


class DateNotInThePastError(PydanticValueError):
    code = 'date.not_in_the_past'
    msg_template = 'date is not in the past'


class DateNotInTheFutureError(PydanticValueError):
    code = 'date.not_in_the_future'
    msg_template = 'date is not in the future'


class TimeError(PydanticValueError):
    msg_template = 'invalid time format'


class DurationError(PydanticValueError):
    msg_template = 'invalid duration format'


class HashableError(PydanticTypeError):
    msg_template = 'value is not a valid hashable'


class UUIDError(PydanticTypeError):
    msg_template = 'value is not a valid uuid'


class UUIDVersionError(PydanticValueError):
    code = 'uuid.version'
    msg_template = 'uuid version {required_version} expected'

    def __init__(self, *, required_version: int) -> None:
        super().__init__(required_version=required_version)


class ArbitraryTypeError(PydanticTypeError):
    code = 'arbitrary_type'
    msg_template = 'instance of {expected_arbitrary_type} expected'

    def __init__(self, *, expected_arbitrary_type: Type[Any]) -> None:
        super().__init__(expected_arbitrary_type=display_as_type(expected_arbitrary_type))


class ClassError(PydanticTypeError):
    code = 'class'
    msg_template = 'a class is expected'


class SubclassError(PydanticTypeError):
    code = 'subclass'
    msg_template = 'subclass of {expected_class} expected'

    def __init__(self, *, expected_class: Type[Any]) -> None:
        super().__init__(expected_class=display_as_type(expected_class))


class JsonError(PydanticValueError):
    msg_template = 'Invalid JSON'


class JsonTypeError(PydanticTypeError):
    code = 'json'
    msg_template = 'JSON object must be str, bytes or bytearray'


class PatternError(PydanticValueError):
    code = 'regex_pattern'
    msg_template = 'Invalid regular expression'


class DataclassTypeError(PydanticTypeError):
    code = 'dataclass'
    msg_template = 'instance of {class_name}, tuple or dict expected'


class CallableError(PydanticTypeError):
    msg_template = '{value} is not callable'


class EnumError(PydanticTypeError):
    code = 'enum_instance'
    msg_template = '{value} is not a valid Enum instance'


class IntEnumError(PydanticTypeError):
    code = 'int_enum_instance'
    msg_template = '{value} is not a valid IntEnum instance'


class IPvAnyAddressError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 or IPv6 address'


class IPvAnyInterfaceError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 or IPv6 interface'


class IPvAnyNetworkError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 or IPv6 network'


class IPv4AddressError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 address'


class IPv6AddressError(PydanticValueError):
    msg_template = 'value is not a valid IPv6 address'


class IPv4NetworkError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 network'


class IPv6NetworkError(PydanticValueError):
    msg_template = 'value is not a valid IPv6 network'


class IPv4InterfaceError(PydanticValueError):
    msg_template = 'value is not a valid IPv4 interface'


class IPv6InterfaceError(PydanticValueError):
    msg_template = 'value is not a valid IPv6 interface'


class ColorError(PydanticValueError):
    msg_template = 'value is not a valid color: {reason}'


class StrictBoolError(PydanticValueError):
    msg_template = 'value is not a valid boolean'


class NotDigitError(PydanticValueError):
    code = 'payment_card_number.digits'
    msg_template = 'card number is not all digits'


class LuhnValidationError(PydanticValueError):
    code = 'payment_card_number.luhn_check'
    msg_template = 'card number is not luhn valid'


class InvalidLengthForBrand(PydanticValueError):
    code = 'payment_card_number.invalid_length_for_brand'
    msg_template = 'Length for a {brand} card must be {required_length}'


class InvalidByteSize(PydanticValueError):
    msg_template = 'could not parse value and unit from byte string'


class InvalidByteSizeUnit(PydanticValueError):
    msg_template = 'could not interpret byte unit: {unit}'


class MissingDiscriminator(PydanticValueError):
    code = 'discriminated_union.missing_discriminator'
    msg_template = 'Discriminator {discriminator_key!r} is missing in value'


class InvalidDiscriminator(PydanticValueError):
    code = 'discriminated_union.invalid_discriminator'
    msg_template = (
        'No match for discriminator {discriminator_key!r} and value {discriminator_value!r} '
        '(allowed values: {allowed_values})'
    )

    def __init__(self, *, discriminator_key: str, discriminator_value: Any, allowed_values: Sequence[Any]) -> None:
        super().__init__(
            discriminator_key=discriminator_key,
            discriminator_value=discriminator_value,
            allowed_values=', '.join(map(repr, allowed_values)),
        )
