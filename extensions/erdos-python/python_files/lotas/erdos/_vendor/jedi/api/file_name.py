import os

from erdos._vendor.jedi.api import classes
from erdos._vendor.jedi.api.strings import StringName, get_quote_ending
from erdos._vendor.jedi.api.helpers import match
from erdos._vendor.jedi.inference.helpers import get_str_or_none


class PathName(StringName):
    api_type = 'path'


def complete_file_name(inference_state, module_context, start_leaf, quote, string,
                       like_name, signatures_callback, code_lines, position, fuzzy):
    # First we want to find out what can actually be changed as a name.
    like_name_length = len(os.path.basename(string))

    addition = _get_string_additions(module_context, start_leaf)
    if string.startswith('~'):
        string = os.path.expanduser(string)
    if addition is None:
        return
    string = addition + string

    # Here we use basename again, because if strings are added like
    # `'foo' + 'bar`, it should complete to `foobar/`.
    must_start_with = os.path.basename(string)
    string = os.path.dirname(string)

    sigs = signatures_callback(*position)
    is_in_os_path_join = sigs and all(s.full_name == 'os.path.join' for s in sigs)
    if is_in_os_path_join:
        to_be_added = _add_os_path_join(module_context, start_leaf, sigs[0].bracket_start)
        if to_be_added is None:
            is_in_os_path_join = False
        else:
            string = to_be_added + string
    base_path = os.path.join(inference_state.project.path, string)
    try:
        listed = sorted(os.scandir(base_path), key=lambda e: e.name)
        # OSError: [Errno 36] File name too long: '...'
    except (FileNotFoundError, OSError):
        return
    quote_ending = get_quote_ending(quote, code_lines, position)
    for entry in listed:
        name = entry.name
        if match(name, must_start_with, fuzzy=fuzzy):
            if is_in_os_path_join or not entry.is_dir():
                name += quote_ending
            else:
                name += os.path.sep

            yield classes.Completion(
                inference_state,
                PathName(inference_state, name[len(must_start_with) - like_name_length:]),
                stack=None,
                like_name_length=like_name_length,
                is_fuzzy=fuzzy,
            )


def _get_string_additions(module_context, start_leaf):
    def iterate_nodes():
        node = addition.parent
        was_addition = True
        for child_node in reversed(node.children[:node.children.index(addition)]):
            if was_addition:
                was_addition = False
                yield child_node
                continue

            if child_node != '+':
                break
            was_addition = True

    addition = start_leaf.get_previous_leaf()
    if addition != '+':
        return ''
    context = module_context.create_context(start_leaf)
    return _add_strings(context, reversed(list(iterate_nodes())))


def _add_strings(context, nodes, add_slash=False):
    string = ''
    first = True
    for child_node in nodes:
        values = context.infer_node(child_node)
        if len(values) != 1:
            return None
        c, = values
        s = get_str_or_none(c)
        if s is None:
            return None
        if not first and add_slash:
            string += os.path.sep
        string += s
        first = False
    return string


def _add_os_path_join(module_context, start_leaf, bracket_start):
    def check(maybe_bracket, nodes):
        if maybe_bracket.start_pos != bracket_start:
            return None

        if not nodes:
            return ''
        context = module_context.create_context(nodes[0])
        return _add_strings(context, nodes, add_slash=True) or ''

    if start_leaf.type == 'error_leaf':
        # Unfinished string literal, like `join('`
        value_node = start_leaf.parent
        index = value_node.children.index(start_leaf)
        if index > 0:
            error_node = value_node.children[index - 1]
            if error_node.type == 'error_node' and len(error_node.children) >= 2:
                index = -2
                if error_node.children[-1].type == 'arglist':
                    arglist_nodes = error_node.children[-1].children
                    index -= 1
                else:
                    arglist_nodes = []

                return check(error_node.children[index + 1], arglist_nodes[::2])
        return None

    # Maybe an arglist or some weird error case. Therefore checked below.
    searched_node_child = start_leaf
    while searched_node_child.parent is not None \
            and searched_node_child.parent.type not in ('arglist', 'trailer', 'error_node'):
        searched_node_child = searched_node_child.parent

    if searched_node_child.get_first_leaf() is not start_leaf:
        return None
    searched_node = searched_node_child.parent
    if searched_node is None:
        return None

    index = searched_node.children.index(searched_node_child)
    arglist_nodes = searched_node.children[:index]
    if searched_node.type == 'arglist':
        trailer = searched_node.parent
        if trailer.type == 'error_node':
            trailer_index = trailer.children.index(searched_node)
            assert trailer_index >= 2
            assert trailer.children[trailer_index - 1] == '('
            return check(trailer.children[trailer_index - 1], arglist_nodes[::2])
        elif trailer.type == 'trailer':
            return check(trailer.children[0], arglist_nodes[::2])
    elif searched_node.type == 'trailer':
        return check(searched_node.children[0], [])
    elif searched_node.type == 'error_node':
        # Stuff like `join(""`
        return check(arglist_nodes[-1], [])
