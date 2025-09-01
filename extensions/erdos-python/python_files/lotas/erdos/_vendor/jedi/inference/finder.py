"""
Searching for names with given scope and name. This is very central in Jedi and
Python. The name resolution is quite complicated with descripter,
``__getattribute__``, ``__getattr__``, ``global``, etc.

If you want to understand name resolution, please read the first few chapters
in http://blog.ionelmc.ro/2015/02/09/understanding-python-metaclasses/.

Flow checks
+++++++++++

Flow checks are not really mature. There's only a check for ``isinstance``.  It
would check whether a flow has the form of ``if isinstance(a, type_or_tuple)``.
Unfortunately every other thing is being ignored (e.g. a == '' would be easy to
check for -> a is a string). There's big potential in these checks.
"""

from erdos._vendor.parso.tree import search_ancestor
from erdos._vendor.parso.python.tree import Name

from jedi import settings
from erdos._vendor.jedi.inference.arguments import TreeArguments
from erdos._vendor.jedi.inference.value import iterable
from erdos._vendor.jedi.inference.base_value import NO_VALUES
from erdos._vendor.jedi.parser_utils import is_scope


def filter_name(filters, name_or_str):
    """
    Searches names that are defined in a scope (the different
    ``filters``), until a name fits.
    """
    string_name = name_or_str.value if isinstance(name_or_str, Name) else name_or_str
    names = []
    for filter in filters:
        names = filter.get(string_name)
        if names:
            break

    return list(_remove_del_stmt(names))


def _remove_del_stmt(names):
    # Catch del statements and remove them from results.
    for name in names:
        if name.tree_name is not None:
            definition = name.tree_name.get_definition()
            if definition is not None and definition.type == 'del_stmt':
                continue
        yield name


def check_flow_information(value, flow, search_name, pos):
    """ Try to find out the type of a variable just with the information that
    is given by the flows: e.g. It is also responsible for assert checks.::

        if isinstance(k, str):
            k.  # <- completion here

    ensures that `k` is a string.
    """
    if not settings.dynamic_flow_information:
        return None

    result = None
    if is_scope(flow):
        # Check for asserts.
        module_node = flow.get_root_node()
        try:
            names = module_node.get_used_names()[search_name.value]
        except KeyError:
            return None
        names = reversed([
            n for n in names
            if flow.start_pos <= n.start_pos < (pos or flow.end_pos)
        ])

        for name in names:
            ass = search_ancestor(name, 'assert_stmt')
            if ass is not None:
                result = _check_isinstance_type(value, ass.assertion, search_name)
                if result is not None:
                    return result

    if flow.type in ('if_stmt', 'while_stmt'):
        potential_ifs = [c for c in flow.children[1::4] if c != ':']
        for if_test in reversed(potential_ifs):
            if search_name.start_pos > if_test.end_pos:
                return _check_isinstance_type(value, if_test, search_name)
    return result


def _get_isinstance_trailer_arglist(node):
    if node.type in ('power', 'atom_expr') and len(node.children) == 2:
        # This might be removed if we analyze and, etc
        first, trailer = node.children
        if first.type == 'name' and first.value == 'isinstance' \
                and trailer.type == 'trailer' and trailer.children[0] == '(':
            return trailer
    return None


def _check_isinstance_type(value, node, search_name):
    lazy_cls = None
    trailer = _get_isinstance_trailer_arglist(node)
    if trailer is not None and len(trailer.children) == 3:
        arglist = trailer.children[1]
        args = TreeArguments(value.inference_state, value, arglist, trailer)
        param_list = list(args.unpack())
        # Disallow keyword arguments
        if len(param_list) == 2 and len(arglist.children) == 3:
            (key1, _), (key2, lazy_value_cls) = param_list
            if key1 is None and key2 is None:
                call = _get_call_string(search_name)
                is_instance_call = _get_call_string(arglist.children[0])
                # Do a simple get_code comparison of the strings . They should
                # just have the same code, and everything will be all right.
                # There are ways that this is not correct, if some stuff is
                # redefined in between. However here we don't care, because
                # it's a heuristic that works pretty well.
                if call == is_instance_call:
                    lazy_cls = lazy_value_cls
    if lazy_cls is None:
        return None

    value_set = NO_VALUES
    for cls_or_tup in lazy_cls.infer():
        if isinstance(cls_or_tup, iterable.Sequence) and cls_or_tup.array_type == 'tuple':
            for lazy_value in cls_or_tup.py__iter__():
                value_set |= lazy_value.infer().execute_with_values()
        else:
            value_set |= cls_or_tup.execute_with_values()
    return value_set


def _get_call_string(node):
    if node.parent.type == 'atom_expr':
        return _get_call_string(node.parent)

    code = ''
    leaf = node.get_first_leaf()
    end = node.get_last_leaf().end_pos
    while leaf.start_pos < end:
        code += leaf.value
        leaf = leaf.get_next_leaf()
    return code
