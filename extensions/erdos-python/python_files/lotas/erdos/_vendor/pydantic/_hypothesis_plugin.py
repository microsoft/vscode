"""
Register Hypothesis strategies for Pydantic custom types.

This enables fully-automatic generation of test data for most Pydantic classes.

Note that this module has *no* runtime impact on Pydantic itself; instead it
is registered as a setuptools entry point and Hypothesis will import it if
Pydantic is installed.  See also:

https://hypothesis.readthedocs.io/en/latest/strategies.html#registering-strategies-via-setuptools-entry-points
https://hypothesis.readthedocs.io/en/latest/data.html#hypothesis.strategies.register_type_strategy
https://hypothesis.readthedocs.io/en/latest/strategies.html#interaction-with-pytest-cov
https://docs.pydantic.dev/usage/types/#pydantic-types

Note that because our motivation is to *improve user experience*, the strategies
are always sound (never generate invalid data) but sacrifice completeness for
maintainability (ie may be unable to generate some tricky but valid data).

Finally, this module makes liberal use of `# type: ignore[<code>]` pragmas.
This is because Hypothesis annotates `register_type_strategy()` with
`(T, SearchStrategy[T])`, but in most cases we register e.g. `ConstrainedInt`
to generate instances of the builtin `int` type which match the constraints.
"""

import contextlib
import datetime
import ipaddress
import json
import math
from fractions import Fraction
from typing import Callable, Dict, Type, Union, cast, overload

import hypothesis.strategies as st

import pydantic
import erdos._vendor.pydantic.color
import erdos._vendor.pydantic.types
from erdos._vendor.pydantic.utils import lenient_issubclass

# FilePath and DirectoryPath are explicitly unsupported, as we'd have to create
# them on-disk, and that's unsafe in general without being told *where* to do so.
#
# URLs are unsupported because it's easy for users to define their own strategy for
# "normal" URLs, and hard for us to define a general strategy which includes "weird"
# URLs but doesn't also have unpredictable performance problems.
#
# conlist() and conset() are unsupported for now, because the workarounds for
# Cython and Hypothesis to handle parametrized generic types are incompatible.
# We are rethinking Hypothesis compatibility in Pydantic v2.

# Emails
try:
    import email_validator
except ImportError:  # pragma: no cover
    pass
else:

    def is_valid_email(s: str) -> bool:
        # Hypothesis' st.emails() occasionally generates emails like 0@A0--0.ac
        # that are invalid according to email-validator, so we filter those out.
        try:
            email_validator.validate_email(s, check_deliverability=False)
            return True
        except email_validator.EmailNotValidError:  # pragma: no cover
            return False

    # Note that these strategies deliberately stay away from any tricky Unicode
    # or other encoding issues; we're just trying to generate *something* valid.
    st.register_type_strategy(pydantic.EmailStr, st.emails().filter(is_valid_email))  # type: ignore[arg-type]
    st.register_type_strategy(
        pydantic.NameEmail,
        st.builds(
            '{} <{}>'.format,  # type: ignore[arg-type]
            st.from_regex('[A-Za-z0-9_]+( [A-Za-z0-9_]+){0,5}', fullmatch=True),
            st.emails().filter(is_valid_email),
        ),
    )

# PyObject - dotted names, in this case taken from the math module.
st.register_type_strategy(
    pydantic.PyObject,  # type: ignore[arg-type]
    st.sampled_from(
        [cast(pydantic.PyObject, f'math.{name}') for name in sorted(vars(math)) if not name.startswith('_')]
    ),
)

# CSS3 Colors; as name, hex, rgb(a) tuples or strings, or hsl strings
_color_regexes = (
    '|'.join(
        (
            pydantic.color.r_hex_short,
            pydantic.color.r_hex_long,
            pydantic.color.r_rgb,
            pydantic.color.r_rgba,
            pydantic.color.r_hsl,
            pydantic.color.r_hsla,
        )
    )
    # Use more precise regex patterns to avoid value-out-of-range errors
    .replace(pydantic.color._r_sl, r'(?:(\d\d?(?:\.\d+)?|100(?:\.0+)?)%)')
    .replace(pydantic.color._r_alpha, r'(?:(0(?:\.\d+)?|1(?:\.0+)?|\.\d+|\d{1,2}%))')
    .replace(pydantic.color._r_255, r'(?:((?:\d|\d\d|[01]\d\d|2[0-4]\d|25[0-4])(?:\.\d+)?|255(?:\.0+)?))')
)
st.register_type_strategy(
    pydantic.color.Color,
    st.one_of(
        st.sampled_from(sorted(pydantic.color.COLORS_BY_NAME)),
        st.tuples(
            st.integers(0, 255),
            st.integers(0, 255),
            st.integers(0, 255),
            st.none() | st.floats(0, 1) | st.floats(0, 100).map('{}%'.format),
        ),
        st.from_regex(_color_regexes, fullmatch=True),
    ),
)


# Card numbers, valid according to the Luhn algorithm


def add_luhn_digit(card_number: str) -> str:
    # See https://en.wikipedia.org/wiki/Luhn_algorithm
    for digit in '0123456789':
        with contextlib.suppress(Exception):
            pydantic.PaymentCardNumber.validate_luhn_check_digit(card_number + digit)
            return card_number + digit
    raise AssertionError('Unreachable')  # pragma: no cover


card_patterns = (
    # Note that these patterns omit the Luhn check digit; that's added by the function above
    '4[0-9]{14}',  # Visa
    '5[12345][0-9]{13}',  # Mastercard
    '3[47][0-9]{12}',  # American Express
    '[0-26-9][0-9]{10,17}',  # other (incomplete to avoid overlap)
)
st.register_type_strategy(
    pydantic.PaymentCardNumber,
    st.from_regex('|'.join(card_patterns), fullmatch=True).map(add_luhn_digit),  # type: ignore[arg-type]
)

# UUIDs
st.register_type_strategy(pydantic.UUID1, st.uuids(version=1))
st.register_type_strategy(pydantic.UUID3, st.uuids(version=3))
st.register_type_strategy(pydantic.UUID4, st.uuids(version=4))
st.register_type_strategy(pydantic.UUID5, st.uuids(version=5))

# Secrets
st.register_type_strategy(pydantic.SecretBytes, st.binary().map(pydantic.SecretBytes))
st.register_type_strategy(pydantic.SecretStr, st.text().map(pydantic.SecretStr))

# IP addresses, networks, and interfaces
st.register_type_strategy(pydantic.IPvAnyAddress, st.ip_addresses())  # type: ignore[arg-type]
st.register_type_strategy(
    pydantic.IPvAnyInterface,
    st.from_type(ipaddress.IPv4Interface) | st.from_type(ipaddress.IPv6Interface),  # type: ignore[arg-type]
)
st.register_type_strategy(
    pydantic.IPvAnyNetwork,
    st.from_type(ipaddress.IPv4Network) | st.from_type(ipaddress.IPv6Network),  # type: ignore[arg-type]
)

# We hook into the con***() functions and the ConstrainedNumberMeta metaclass,
# so here we only have to register subclasses for other constrained types which
# don't go via those mechanisms.  Then there are the registration hooks below.
st.register_type_strategy(pydantic.StrictBool, st.booleans())
st.register_type_strategy(pydantic.StrictStr, st.text())


# FutureDate, PastDate
st.register_type_strategy(pydantic.FutureDate, st.dates(min_value=datetime.date.today() + datetime.timedelta(days=1)))
st.register_type_strategy(pydantic.PastDate, st.dates(max_value=datetime.date.today() - datetime.timedelta(days=1)))


# Constrained-type resolver functions
#
# For these ones, we actually want to inspect the type in order to work out a
# satisfying strategy.  First up, the machinery for tracking resolver functions:

RESOLVERS: Dict[type, Callable[[type], st.SearchStrategy]] = {}  # type: ignore[type-arg]


@overload
def _registered(typ: Type[pydantic.types.T]) -> Type[pydantic.types.T]:
    pass


@overload
def _registered(typ: pydantic.types.ConstrainedNumberMeta) -> pydantic.types.ConstrainedNumberMeta:
    pass


def _registered(
    typ: Union[Type[pydantic.types.T], pydantic.types.ConstrainedNumberMeta]
) -> Union[Type[pydantic.types.T], pydantic.types.ConstrainedNumberMeta]:
    # This function replaces the version in `pydantic.types`, in order to
    # effect the registration of new constrained types so that Hypothesis
    # can generate valid examples.
    pydantic.types._DEFINED_TYPES.add(typ)
    for supertype, resolver in RESOLVERS.items():
        if issubclass(typ, supertype):
            st.register_type_strategy(typ, resolver(typ))  # type: ignore
            return typ
    raise NotImplementedError(f'Unknown type {typ!r} has no resolver to register')  # pragma: no cover


def resolves(
    typ: Union[type, pydantic.types.ConstrainedNumberMeta]
) -> Callable[[Callable[..., st.SearchStrategy]], Callable[..., st.SearchStrategy]]:  # type: ignore[type-arg]
    def inner(f):  # type: ignore
        assert f not in RESOLVERS
        RESOLVERS[typ] = f
        return f

    return inner


# Type-to-strategy resolver functions


@resolves(pydantic.JsonWrapper)
def resolve_json(cls):  # type: ignore[no-untyped-def]
    try:
        inner = st.none() if cls.inner_type is None else st.from_type(cls.inner_type)
    except Exception:  # pragma: no cover
        finite = st.floats(allow_infinity=False, allow_nan=False)
        inner = st.recursive(
            base=st.one_of(st.none(), st.booleans(), st.integers(), finite, st.text()),
            extend=lambda x: st.lists(x) | st.dictionaries(st.text(), x),  # type: ignore
        )
    inner_type = getattr(cls, 'inner_type', None)
    return st.builds(
        cls.inner_type.json if lenient_issubclass(inner_type, pydantic.BaseModel) else json.dumps,
        inner,
        ensure_ascii=st.booleans(),
        indent=st.none() | st.integers(0, 16),
        sort_keys=st.booleans(),
    )


@resolves(pydantic.ConstrainedBytes)
def resolve_conbytes(cls):  # type: ignore[no-untyped-def]  # pragma: no cover
    min_size = cls.min_length or 0
    max_size = cls.max_length
    if not cls.strip_whitespace:
        return st.binary(min_size=min_size, max_size=max_size)
    # Fun with regex to ensure we neither start nor end with whitespace
    repeats = '{{{},{}}}'.format(
        min_size - 2 if min_size > 2 else 0,
        max_size - 2 if (max_size or 0) > 2 else '',
    )
    if min_size >= 2:
        pattern = rf'\W.{repeats}\W'
    elif min_size == 1:
        pattern = rf'\W(.{repeats}\W)?'
    else:
        assert min_size == 0
        pattern = rf'(\W(.{repeats}\W)?)?'
    return st.from_regex(pattern.encode(), fullmatch=True)


@resolves(pydantic.ConstrainedDecimal)
def resolve_condecimal(cls):  # type: ignore[no-untyped-def]
    min_value = cls.ge
    max_value = cls.le
    if cls.gt is not None:
        assert min_value is None, 'Set `gt` or `ge`, but not both'
        min_value = cls.gt
    if cls.lt is not None:
        assert max_value is None, 'Set `lt` or `le`, but not both'
        max_value = cls.lt
    s = st.decimals(min_value, max_value, allow_nan=False, places=cls.decimal_places)
    if cls.lt is not None:
        s = s.filter(lambda d: d < cls.lt)
    if cls.gt is not None:
        s = s.filter(lambda d: cls.gt < d)
    return s


@resolves(pydantic.ConstrainedFloat)
def resolve_confloat(cls):  # type: ignore[no-untyped-def]
    min_value = cls.ge
    max_value = cls.le
    exclude_min = False
    exclude_max = False

    if cls.gt is not None:
        assert min_value is None, 'Set `gt` or `ge`, but not both'
        min_value = cls.gt
        exclude_min = True
    if cls.lt is not None:
        assert max_value is None, 'Set `lt` or `le`, but not both'
        max_value = cls.lt
        exclude_max = True

    if cls.multiple_of is None:
        return st.floats(min_value, max_value, exclude_min=exclude_min, exclude_max=exclude_max, allow_nan=False)

    if min_value is not None:
        min_value = math.ceil(min_value / cls.multiple_of)
        if exclude_min:
            min_value = min_value + 1
    if max_value is not None:
        assert max_value >= cls.multiple_of, 'Cannot build model with max value smaller than multiple of'
        max_value = math.floor(max_value / cls.multiple_of)
        if exclude_max:
            max_value = max_value - 1

    return st.integers(min_value, max_value).map(lambda x: x * cls.multiple_of)


@resolves(pydantic.ConstrainedInt)
def resolve_conint(cls):  # type: ignore[no-untyped-def]
    min_value = cls.ge
    max_value = cls.le
    if cls.gt is not None:
        assert min_value is None, 'Set `gt` or `ge`, but not both'
        min_value = cls.gt + 1
    if cls.lt is not None:
        assert max_value is None, 'Set `lt` or `le`, but not both'
        max_value = cls.lt - 1

    if cls.multiple_of is None or cls.multiple_of == 1:
        return st.integers(min_value, max_value)

    # These adjustments and the .map handle integer-valued multiples, while the
    # .filter handles trickier cases as for confloat.
    if min_value is not None:
        min_value = math.ceil(Fraction(min_value) / Fraction(cls.multiple_of))
    if max_value is not None:
        max_value = math.floor(Fraction(max_value) / Fraction(cls.multiple_of))
    return st.integers(min_value, max_value).map(lambda x: x * cls.multiple_of)


@resolves(pydantic.ConstrainedDate)
def resolve_condate(cls):  # type: ignore[no-untyped-def]
    if cls.ge is not None:
        assert cls.gt is None, 'Set `gt` or `ge`, but not both'
        min_value = cls.ge
    elif cls.gt is not None:
        min_value = cls.gt + datetime.timedelta(days=1)
    else:
        min_value = datetime.date.min
    if cls.le is not None:
        assert cls.lt is None, 'Set `lt` or `le`, but not both'
        max_value = cls.le
    elif cls.lt is not None:
        max_value = cls.lt - datetime.timedelta(days=1)
    else:
        max_value = datetime.date.max
    return st.dates(min_value, max_value)


@resolves(pydantic.ConstrainedStr)
def resolve_constr(cls):  # type: ignore[no-untyped-def]  # pragma: no cover
    min_size = cls.min_length or 0
    max_size = cls.max_length

    if cls.regex is None and not cls.strip_whitespace:
        return st.text(min_size=min_size, max_size=max_size)

    if cls.regex is not None:
        strategy = st.from_regex(cls.regex)
        if cls.strip_whitespace:
            strategy = strategy.filter(lambda s: s == s.strip())
    elif cls.strip_whitespace:
        repeats = '{{{},{}}}'.format(
            min_size - 2 if min_size > 2 else 0,
            max_size - 2 if (max_size or 0) > 2 else '',
        )
        if min_size >= 2:
            strategy = st.from_regex(rf'\W.{repeats}\W')
        elif min_size == 1:
            strategy = st.from_regex(rf'\W(.{repeats}\W)?')
        else:
            assert min_size == 0
            strategy = st.from_regex(rf'(\W(.{repeats}\W)?)?')

    if min_size == 0 and max_size is None:
        return strategy
    elif max_size is None:
        return strategy.filter(lambda s: min_size <= len(s))
    return strategy.filter(lambda s: min_size <= len(s) <= max_size)


# Finally, register all previously-defined types, and patch in our new function
for typ in list(pydantic.types._DEFINED_TYPES):
    _registered(typ)
pydantic.types._registered = _registered
st.register_type_strategy(pydantic.Json, resolve_json)
