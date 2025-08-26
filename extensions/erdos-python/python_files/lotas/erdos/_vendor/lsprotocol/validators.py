# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import attrs

INTEGER_MIN_VALUE = -(2**31)
INTEGER_MAX_VALUE = 2**31 - 1


def integer_validator(
    instance: Any,
    attribute: "attrs.Attribute[int]",
    value: Any,
) -> bool:
    """Validates that integer value belongs in the range expected by LSP."""
    if not isinstance(value, int) or not (
        INTEGER_MIN_VALUE <= value <= INTEGER_MAX_VALUE
    ):
        name = attribute.name if hasattr(attribute, "name") else str(attribute)
        raise ValueError(
            f"{instance.__class__.__qualname__}.{name} should be in range [{INTEGER_MIN_VALUE}:{INTEGER_MAX_VALUE}], but was {value}."
        )
    return True


UINTEGER_MIN_VALUE = 0
UINTEGER_MAX_VALUE = 2**31 - 1


def uinteger_validator(
    instance: Any,
    attribute: "attrs.Attribute[int]",
    value: Any,
) -> bool:
    """Validates that unsigned integer value belongs in the range expected by LSP."""
    if not isinstance(value, int) or not (
        UINTEGER_MIN_VALUE <= value <= UINTEGER_MAX_VALUE
    ):
        name = attribute.name if hasattr(attribute, "name") else str(attribute)
        raise ValueError(
            f"{instance.__class__.__qualname__}.{name} should be in range [{UINTEGER_MIN_VALUE}:{UINTEGER_MAX_VALUE}], but was {value}."
        )
    return True
