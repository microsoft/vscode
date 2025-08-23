"""Cattrs validation."""

from typing import Callable, List, Union

from .errors import (
    ClassValidationError,
    ForbiddenExtraKeysError,
    IterableValidationError,
)

__all__ = ["format_exception", "transform_error"]


def format_exception(exc: BaseException, type: Union[type, None]) -> str:
    """The default exception formatter, handling the most common exceptions.

    The following exceptions are handled specially:

    * `KeyErrors` (`required field missing`)
    * `ValueErrors` (`invalid value for type, expected <type>` or just `invalid value`)
    * `TypeErrors` (`invalid value for type, expected <type>` and a couple special
      cases for iterables)
    * `cattrs.ForbiddenExtraKeysError`
    * some `AttributeErrors` (special cased for structing mappings)
    """
    if isinstance(exc, KeyError):
        res = "required field missing"
    elif isinstance(exc, ValueError):
        if type is not None:
            tn = type.__name__ if hasattr(type, "__name__") else repr(type)
            res = f"invalid value for type, expected {tn}"
        else:
            res = "invalid value"
    elif isinstance(exc, TypeError):
        if type is None:
            if exc.args[0].endswith("object is not iterable"):
                res = "invalid value for type, expected an iterable"
            else:
                res = f"invalid type ({exc})"
        else:
            tn = type.__name__ if hasattr(type, "__name__") else repr(type)
            res = f"invalid value for type, expected {tn}"
    elif isinstance(exc, ForbiddenExtraKeysError):
        res = f"extra fields found ({', '.join(exc.extra_fields)})"
    elif isinstance(exc, AttributeError) and exc.args[0].endswith(
        "object has no attribute 'items'"
    ):
        # This was supposed to be a mapping (and have .items()) but it something else.
        res = "expected a mapping"
    elif isinstance(exc, AttributeError) and exc.args[0].endswith(
        "object has no attribute 'copy'"
    ):
        # This was supposed to be a mapping (and have .copy()) but it something else.
        # Used for TypedDicts.
        res = "expected a mapping"
    else:
        res = f"unknown error ({exc})"

    return res


def transform_error(
    exc: Union[ClassValidationError, IterableValidationError, BaseException],
    path: str = "$",
    format_exception: Callable[
        [BaseException, Union[type, None]], str
    ] = format_exception,
) -> List[str]:
    """Transform an exception into a list of error messages.

    To get detailed error messages, the exception should be produced by a converter
    with `detailed_validation` set.

    By default, the error messages are in the form of `{description} @ {path}`.

    While traversing the exception and subexceptions, the path is formed:

    * by appending `.{field_name}` for fields in classes
    * by appending `[{int}]` for indices in iterables, like lists
    * by appending `[{str}]` for keys in mappings, like dictionaries

    :param exc: The exception to transform into error messages.
    :param path: The root path to use.
    :param format_exception: A callable to use to transform `Exceptions` into
        string descriptions of errors.

    .. versionadded:: 23.1.0
    """
    errors = []
    if isinstance(exc, IterableValidationError):
        with_notes, without = exc.group_exceptions()
        for exc, note in with_notes:
            p = f"{path}[{note.index!r}]"
            if isinstance(exc, (ClassValidationError, IterableValidationError)):
                errors.extend(transform_error(exc, p, format_exception))
            else:
                errors.append(f"{format_exception(exc, note.type)} @ {p}")
        for exc in without:
            errors.append(f"{format_exception(exc, None)} @ {path}")
    elif isinstance(exc, ClassValidationError):
        with_notes, without = exc.group_exceptions()
        for exc, note in with_notes:
            p = f"{path}.{note.name}"
            if isinstance(exc, (ClassValidationError, IterableValidationError)):
                errors.extend(transform_error(exc, p, format_exception))
            else:
                errors.append(f"{format_exception(exc, note.type)} @ {p}")
        for exc in without:
            errors.append(f"{format_exception(exc, None)} @ {path}")
    else:
        errors.append(f"{format_exception(exc, None)} @ {path}")
    return errors
