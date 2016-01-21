import pydoc
import keyword

from jedi._compatibility import is_py3
from jedi import common
from jedi.evaluate import compiled
from jedi.evaluate.helpers import FakeName
from jedi.parser.tree import Leaf
try:
    from pydoc_data import topics as pydoc_topics
except ImportError:
    # Python 2.6
    import pydoc_topics

if is_py3:
    keys = keyword.kwlist
else:
    keys = keyword.kwlist + ['None', 'False', 'True']


def has_inappropriate_leaf_keyword(pos, module):
    relevant_errors = filter(
        lambda error: error.first_pos[0] == pos[0],
        module.error_statement_stacks)

    for error in relevant_errors:
        if error.next_token in keys:
            return True

    return False

def completion_names(evaluator, stmt, pos, module):
    keyword_list = all_keywords()

    if not isinstance(stmt, Leaf) or has_inappropriate_leaf_keyword(pos, module):
        keyword_list = filter(
            lambda keyword: not keyword.only_valid_as_leaf,
            keyword_list
        )
    return [keyword.name for keyword in keyword_list]


def all_keywords(pos=(0,0)):
    return set([Keyword(k, pos) for k in keys])


def keyword(string, pos=(0,0)):
    if string in keys:
        return Keyword(string, pos)
    else:
        return None


def get_operator(string, pos):
    return Keyword(string, pos)


keywords_only_valid_as_leaf = (
    'continue',
    'break',
)


class Keyword(object):
    def __init__(self, name, pos):
        self.name = FakeName(name, self, pos)
        self.start_pos = pos
        self.parent = compiled.builtin

    def get_parent_until(self):
        return self.parent

    @property
    def only_valid_as_leaf(self):
        return self.name.value in keywords_only_valid_as_leaf

    @property
    def names(self):
        """ For a `parsing.Name` like comparision """
        return [self.name]

    @property
    def docstr(self):
        return imitate_pydoc(self.name)

    def __repr__(self):
        return '<%s: %s>' % (type(self).__name__, self.name)


def imitate_pydoc(string):
    """
    It's not possible to get the pydoc's without starting the annoying pager
    stuff.
    """
    # str needed because of possible unicode stuff in py2k (pydoc doesn't work
    # with unicode strings)
    string = str(string)
    h = pydoc.help
    with common.ignored(KeyError):
        # try to access symbols
        string = h.symbols[string]
        string, _, related = string.partition(' ')

    get_target = lambda s: h.topics.get(s, h.keywords.get(s))
    while isinstance(string, str):
        string = get_target(string)

    try:
        # is a tuple now
        label, related = string
    except TypeError:
        return ''

    try:
        return pydoc_topics.topics[label] if pydoc_topics else ''
    except KeyError:
        return ''
