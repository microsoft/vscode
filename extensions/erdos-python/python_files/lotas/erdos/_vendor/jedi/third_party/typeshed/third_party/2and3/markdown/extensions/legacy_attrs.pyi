from typing import Any, Pattern

from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor

ATTR_RE: Pattern

class LegacyAttrs(Treeprocessor):
    def handleAttributes(self, el, txt): ...

class LegacyAttrExtension(Extension): ...

def makeExtension(**kwargs): ...
