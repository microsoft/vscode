import selectors
from typing import Optional

from . import base_events

class BaseSelectorEventLoop(base_events.BaseEventLoop):
    def __init__(self, selector: Optional[selectors.BaseSelector] = ...) -> None: ...
