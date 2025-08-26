from typing import Any, Pattern

from markdown.blockprocessors import OListProcessor, UListProcessor
from markdown.extensions import Extension

class SaneOListProcessor(OListProcessor):
    def __init__(self, parser) -> None: ...

class SaneUListProcessor(UListProcessor):
    def __init__(self, parser) -> None: ...

class SaneListExtension(Extension): ...

def makeExtension(**kwargs): ...
