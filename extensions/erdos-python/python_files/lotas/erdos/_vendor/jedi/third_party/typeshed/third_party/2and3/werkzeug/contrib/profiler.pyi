from _typeshed import SupportsWrite
from typing import AnyStr, Generic, Tuple

from ..middleware.profiler import *

class MergeStream(Generic[AnyStr]):
    streams: Tuple[SupportsWrite[AnyStr], ...]
    def __init__(self, *streams: SupportsWrite[AnyStr]) -> None: ...
    def write(self, data: AnyStr) -> None: ...
