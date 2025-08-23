# SPDX-License-Identifier: MIT

from __future__ import annotations

from typing import ClassVar


class FrozenError(AttributeError):
    """
    A frozen/immutable instance or attribute have been attempted to be
    modified.

    It mirrors the behavior of ``namedtuples`` by using the same error message
    and subclassing `AttributeError`.

    .. versionadded:: 20.1.0
    """

    msg = "can't set attribute"
    args: ClassVar[tuple[str]] = [msg]


class FrozenInstanceError(FrozenError):
    """
    A frozen instance has been attempted to be modified.

    .. versionadded:: 16.1.0
    """


class FrozenAttributeError(FrozenError):
    """
    A frozen attribute has been attempted to be modified.

    .. versionadded:: 20.1.0
    """


class AttrsAttributeNotFoundError(ValueError):
    """
    An *attrs* function couldn't find an attribute that the user asked for.

    .. versionadded:: 16.2.0
    """


class NotAnAttrsClassError(ValueError):
    """
    A non-*attrs* class has been passed into an *attrs* function.

    .. versionadded:: 16.2.0
    """


class DefaultAlreadySetError(RuntimeError):
    """
    A default has been set when defining the field and is attempted to be reset
    using the decorator.

    .. versionadded:: 17.1.0
    """


class UnannotatedAttributeError(RuntimeError):
    """
    A class with ``auto_attribs=True`` has a field without a type annotation.

    .. versionadded:: 17.3.0
    """


class PythonTooOldError(RuntimeError):
    """
    It was attempted to use an *attrs* feature that requires a newer Python
    version.

    .. versionadded:: 18.2.0
    """


class NotCallableError(TypeError):
    """
    A field requiring a callable has been set with a value that is not
    callable.

    .. versionadded:: 19.2.0
    """

    def __init__(self, msg, value):
        super(TypeError, self).__init__(msg, value)
        self.msg = msg
        self.value = value

    def __str__(self):
        return str(self.msg)
