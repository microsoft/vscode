"""
Docstrings are another source of information for functions and classes.
:mod:`jedi.evaluate.dynamic` tries to find all executions of functions, while
the docstring parsing is much easier. There are two different types of
docstrings that |jedi| understands:

- `Sphinx <http://sphinx-doc.org/markup/desc.html#info-field-lists>`_
- `Epydoc <http://epydoc.sourceforge.net/manual-fields.html>`_

For example, the sphinx annotation ``:type foo: str`` clearly states that the
type of ``foo`` is ``str``.

As an addition to parameter searching, this module also provides return
annotations.
"""

from ast import literal_eval
import re
from itertools import chain
from textwrap import dedent

from jedi.evaluate.cache import memoize_default
from jedi.parser import Parser, load_grammar
from jedi.common import indent_block
from jedi.evaluate.iterable import Array, FakeSequence, AlreadyEvaluated


DOCSTRING_PARAM_PATTERNS = [
    r'\s*:type\s+%s:\s*([^\n]+)',  # Sphinx
    r'\s*:param\s+(\w+)\s+%s:[^\n]+',  # Sphinx param with type
    r'\s*@type\s+%s:\s*([^\n]+)',  # Epydoc
]

DOCSTRING_RETURN_PATTERNS = [
    re.compile(r'\s*:rtype:\s*([^\n]+)', re.M),  # Sphinx
    re.compile(r'\s*@rtype:\s*([^\n]+)', re.M),  # Epydoc
]

REST_ROLE_PATTERN = re.compile(r':[^`]+:`([^`]+)`')


try:
    from numpydoc.docscrape import NumpyDocString
except ImportError:
    def _search_param_in_numpydocstr(docstr, param_str):
        return []
else:
    def _search_param_in_numpydocstr(docstr, param_str):
        """Search `docstr` (in numpydoc format) for type(-s) of `param_str`."""
        params = NumpyDocString(docstr)._parsed_data['Parameters']
        for p_name, p_type, p_descr in params:
            if p_name == param_str:
                m = re.match('([^,]+(,[^,]+)*?)(,[ ]*optional)?$', p_type)
                if m:
                    p_type = m.group(1)

                if p_type.startswith('{'):
                    types = set(type(x).__name__ for x in literal_eval(p_type))
                    return list(types)
                else:
                    return [p_type]
        return []


def _search_param_in_docstr(docstr, param_str):
    """
    Search `docstr` for type(-s) of `param_str`.

    >>> _search_param_in_docstr(':type param: int', 'param')
    ['int']
    >>> _search_param_in_docstr('@type param: int', 'param')
    ['int']
    >>> _search_param_in_docstr(
    ...   ':type param: :class:`threading.Thread`', 'param')
    ['threading.Thread']
    >>> bool(_search_param_in_docstr('no document', 'param'))
    False
    >>> _search_param_in_docstr(':param int param: some description', 'param')
    ['int']

    """
    # look at #40 to see definitions of those params
    patterns = [re.compile(p % re.escape(param_str))
                for p in DOCSTRING_PARAM_PATTERNS]
    for pattern in patterns:
        match = pattern.search(docstr)
        if match:
            return [_strip_rst_role(match.group(1))]

    return (_search_param_in_numpydocstr(docstr, param_str) or
            [])


def _strip_rst_role(type_str):
    """
    Strip off the part looks like a ReST role in `type_str`.

    >>> _strip_rst_role(':class:`ClassName`')  # strip off :class:
    'ClassName'
    >>> _strip_rst_role(':py:obj:`module.Object`')  # works with domain
    'module.Object'
    >>> _strip_rst_role('ClassName')  # do nothing when not ReST role
    'ClassName'

    See also:
    http://sphinx-doc.org/domains.html#cross-referencing-python-objects

    """
    match = REST_ROLE_PATTERN.match(type_str)
    if match:
        return match.group(1)
    else:
        return type_str


def _evaluate_for_statement_string(evaluator, string, module):
    code = dedent("""
    def pseudo_docstring_stuff():
        # Create a pseudo function for docstring statements.
    %s
    """)
    if string is None:
        return []

    for element in re.findall('((?:\w+\.)*\w+)\.', string):
        # Try to import module part in dotted name.
        # (e.g., 'threading' in 'threading.Thread').
        string = 'import %s\n' % element + string

    # Take the default grammar here, if we load the Python 2.7 grammar here, it
    # will be impossible to use `...` (Ellipsis) as a token. Docstring types
    # don't need to conform with the current grammar.
    p = Parser(load_grammar(), code % indent_block(string))
    try:
        pseudo_cls = p.module.subscopes[0]
        # First pick suite, then simple_stmt (-2 for DEDENT) and then the node,
        # which is also not the last item, because there's a newline.
        stmt = pseudo_cls.children[-1].children[-2].children[-2]
    except (AttributeError, IndexError):
        return []

    # Use the module of the param.
    # TODO this module is not the module of the param in case of a function
    # call. In that case it's the module of the function call.
    # stuffed with content from a function call.
    pseudo_cls.parent = module
    return list(_execute_types_in_stmt(evaluator, stmt))


def _execute_types_in_stmt(evaluator, stmt):
    """
    Executing all types or general elements that we find in a statement. This
    doesn't include tuple, list and dict literals, because the stuff they
    contain is executed. (Used as type information).
    """
    definitions = evaluator.eval_element(stmt)
    return chain.from_iterable(_execute_array_values(evaluator, d) for d in definitions)


def _execute_array_values(evaluator, array):
    """
    Tuples indicate that there's not just one return value, but the listed
    ones.  `(str, int)` means that it returns a tuple with both types.
    """
    if isinstance(array, Array):
        values = []
        for typ in array.values():
            objects = _execute_array_values(evaluator, typ)
            values.append(AlreadyEvaluated(objects))
        return [FakeSequence(evaluator, values, array.type)]
    else:
        return evaluator.execute(array)


@memoize_default(None, evaluator_is_first_arg=True)
def follow_param(evaluator, param):
    func = param.parent_function

    return [p
            for param_str in _search_param_in_docstr(func.raw_doc,
                                                     str(param.name))
            for p in _evaluate_for_statement_string(evaluator, param_str,
                                                    param.get_parent_until())]


@memoize_default(None, evaluator_is_first_arg=True)
def find_return_types(evaluator, func):
    def search_return_in_docstr(code):
        for p in DOCSTRING_RETURN_PATTERNS:
            match = p.search(code)
            if match:
                return _strip_rst_role(match.group(1))

    type_str = search_return_in_docstr(func.raw_doc)
    return _evaluate_for_statement_string(evaluator, type_str, func.get_parent_until())
