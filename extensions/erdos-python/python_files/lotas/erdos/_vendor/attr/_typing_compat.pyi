from typing import Any, ClassVar, Protocol

# MYPY is a special constant in mypy which works the same way as `TYPE_CHECKING`.
MYPY = False

if MYPY:
    # A protocol to be able to statically accept an attrs class.
    class AttrsInstance_(Protocol):
        __attrs_attrs__: ClassVar[Any]

else:
    # For type checkers without plug-in support use an empty protocol that
    # will (hopefully) be combined into a union.
    class AttrsInstance_(Protocol):
        pass
