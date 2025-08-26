import pydoc
from contextlib import suppress
from typing import Dict, Optional

from lotas.erdos._vendor.jedi.inference.names import AbstractArbitraryName

try:
    from pydoc_data import topics
    pydoc_topics: Optional[Dict[str, str]] = topics.topics
except ImportError:
    # Python 3.6.8 embeddable does not have pydoc_data.
    pydoc_topics = None


class KeywordName(AbstractArbitraryName):
    api_type = 'keyword'

    def py__doc__(self):
        return imitate_pydoc(self.string_name)


def imitate_pydoc(string):
    """
    It's not possible to get the pydoc's without starting the annoying pager
    stuff.
    """
    if pydoc_topics is None:
        return ''

    h = pydoc.help
    with suppress(KeyError):
        # try to access symbols
        string = h.symbols[string]
        string, _, related = string.partition(' ')

    def get_target(s):
        return h.topics.get(s, h.keywords.get(s))

    while isinstance(string, str):
        string = get_target(string)

    try:
        # is a tuple now
        label, related = string
    except TypeError:
        return ''

    try:
        return pydoc_topics[label].strip() if pydoc_topics else ''
    except KeyError:
        return ''
