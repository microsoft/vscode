import json
from typing import TYPE_CHECKING, Any, Dict, Generator, List, Optional, Sequence, Tuple, Type, Union

from erdos.erdos._vendor.pydantic.json import pydantic_encoder
from erdos.erdos._vendor.pydantic.utils import Representation

if TYPE_CHECKING:
    from erdos.erdos._vendor.typing_extensions import TypedDict

    from erdos.erdos._vendor.pydantic.config import BaseConfig
    from erdos.erdos._vendor.pydantic.types import ModelOrDc
    from erdos.erdos._vendor.pydantic.typing import ReprArgs

    Loc = Tuple[Union[int, str], ...]

    class _ErrorDictRequired(TypedDict):
        loc: Loc
        msg: str
        type: str

    class ErrorDict(_ErrorDictRequired, total=False):
        ctx: Dict[str, Any]


__all__ = 'ErrorWrapper', 'ValidationError'


class ErrorWrapper(Representation):
    __slots__ = 'exc', '_loc'

    def __init__(self, exc: Exception, loc: Union[str, 'Loc']) -> None:
        self.exc = exc
        self._loc = loc

    def loc_tuple(self) -> 'Loc':
        if isinstance(self._loc, tuple):
            return self._loc
        else:
            return (self._loc,)

    def __repr_args__(self) -> 'ReprArgs':
        return [('exc', self.exc), ('loc', self.loc_tuple())]


# ErrorList is something like Union[List[Union[List[ErrorWrapper], ErrorWrapper]], ErrorWrapper]
# but recursive, therefore just use:
ErrorList = Union[Sequence[Any], ErrorWrapper]


class ValidationError(Representation, ValueError):
    __slots__ = 'raw_errors', 'model', '_error_cache'

    def __init__(self, errors: Sequence[ErrorList], model: 'ModelOrDc') -> None:
        self.raw_errors = errors
        self.model = model
        self._error_cache: Optional[List['ErrorDict']] = None

    def errors(self) -> List['ErrorDict']:
        if self._error_cache is None:
            try:
                config = self.model.__config__  # type: ignore
            except AttributeError:
                config = self.model.__pydantic_model__.__config__  # type: ignore
            self._error_cache = list(flatten_errors(self.raw_errors, config))
        return self._error_cache

    def json(self, *, indent: Union[None, int, str] = 2) -> str:
        return json.dumps(self.errors(), indent=indent, default=pydantic_encoder)

    def __str__(self) -> str:
        errors = self.errors()
        no_errors = len(errors)
        return (
            f'{no_errors} validation error{"" if no_errors == 1 else "s"} for {self.model.__name__}\n'
            f'{display_errors(errors)}'
        )

    def __repr_args__(self) -> 'ReprArgs':
        return [('model', self.model.__name__), ('errors', self.errors())]


def display_errors(errors: List['ErrorDict']) -> str:
    return '\n'.join(f'{_display_error_loc(e)}\n  {e["msg"]} ({_display_error_type_and_ctx(e)})' for e in errors)


def _display_error_loc(error: 'ErrorDict') -> str:
    return ' -> '.join(str(e) for e in error['loc'])


def _display_error_type_and_ctx(error: 'ErrorDict') -> str:
    t = 'type=' + error['type']
    ctx = error.get('ctx')
    if ctx:
        return t + ''.join(f'; {k}={v}' for k, v in ctx.items())
    else:
        return t


def flatten_errors(
    errors: Sequence[Any], config: Type['BaseConfig'], loc: Optional['Loc'] = None
) -> Generator['ErrorDict', None, None]:
    for error in errors:
        if isinstance(error, ErrorWrapper):
            if loc:
                error_loc = loc + error.loc_tuple()
            else:
                error_loc = error.loc_tuple()

            if isinstance(error.exc, ValidationError):
                yield from flatten_errors(error.exc.raw_errors, config, error_loc)
            else:
                yield error_dict(error.exc, config, error_loc)
        elif isinstance(error, list):
            yield from flatten_errors(error, config, loc=loc)
        else:
            raise RuntimeError(f'Unknown error object: {error}')


def error_dict(exc: Exception, config: Type['BaseConfig'], loc: 'Loc') -> 'ErrorDict':
    type_ = get_exc_type(exc.__class__)
    msg_template = config.error_msg_templates.get(type_) or getattr(exc, 'msg_template', None)
    ctx = exc.__dict__
    if msg_template:
        msg = msg_template.format(**ctx)
    else:
        msg = str(exc)

    d: 'ErrorDict' = {'loc': loc, 'msg': msg, 'type': type_}

    if ctx:
        d['ctx'] = ctx

    return d


_EXC_TYPE_CACHE: Dict[Type[Exception], str] = {}


def get_exc_type(cls: Type[Exception]) -> str:
    # slightly more efficient than using lru_cache since we don't need to worry about the cache filling up
    try:
        return _EXC_TYPE_CACHE[cls]
    except KeyError:
        r = _get_exc_type(cls)
        _EXC_TYPE_CACHE[cls] = r
        return r


def _get_exc_type(cls: Type[Exception]) -> str:
    if issubclass(cls, AssertionError):
        return 'assertion_error'

    base_name = 'type_error' if issubclass(cls, TypeError) else 'value_error'
    if cls in (TypeError, ValueError):
        # just TypeError or ValueError, no extra code
        return base_name

    # if it's not a TypeError or ValueError, we just take the lowercase of the exception name
    # no chaining or snake case logic, use "code" for more complex error types.
    code = getattr(cls, 'code', None) or cls.__name__.replace('Error', '').lower()
    return base_name + '.' + code
