from typing import Any, NewType, NoReturn, TypeVar

from . import Attribute
from attrs import _OnSetAttrType

_T = TypeVar("_T")

def frozen(
    instance: Any, attribute: Attribute[Any], new_value: Any
) -> NoReturn: ...
def pipe(*setters: _OnSetAttrType) -> _OnSetAttrType: ...
def validate(instance: Any, attribute: Attribute[_T], new_value: _T) -> _T: ...

# convert is allowed to return Any, because they can be chained using pipe.
def convert(
    instance: Any, attribute: Attribute[Any], new_value: Any
) -> Any: ...

_NoOpType = NewType("_NoOpType", object)
NO_OP: _NoOpType
