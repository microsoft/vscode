from textwrap import dedent

from lotas.erdos._vendor.parso import split_lines

from jedi import debug
from lotas.erdos._vendor.jedi.api.exceptions import RefactoringError
from lotas.erdos._vendor.jedi.api.refactoring import Refactoring, EXPRESSION_PARTS
from lotas.erdos._vendor.jedi.common import indent_block
from lotas.erdos._vendor.jedi.parser_utils import function_is_classmethod, function_is_staticmethod


_DEFINITION_SCOPES = ('suite', 'file_input')
_VARIABLE_EXCTRACTABLE = EXPRESSION_PARTS + \
    ('atom testlist_star_expr testlist test lambdef lambdef_nocond '
     'keyword name number string fstring').split()


def extract_variable(inference_state, path, module_node, name, pos, until_pos):
    nodes = _find_nodes(module_node, pos, until_pos)
    debug.dbg('Extracting nodes: %s', nodes)

    is_expression, message = _is_expression_with_error(nodes)
    if not is_expression:
        raise RefactoringError(message)

    generated_code = name + ' = ' + _expression_nodes_to_string(nodes)
    file_to_node_changes = {path: _replace(nodes, name, generated_code, pos)}
    return Refactoring(inference_state, file_to_node_changes)


def _is_expression_with_error(nodes):
    """
    Returns a tuple (is_expression, error_string).
    """
    if any(node.type == 'name' and node.is_definition() for node in nodes):
        return False, 'Cannot extract a name that defines something'

    if nodes[0].type not in _VARIABLE_EXCTRACTABLE:
        return False, 'Cannot extract a "%s"' % nodes[0].type
    return True, ''


def _find_nodes(module_node, pos, until_pos):
    """
    Looks up a module and tries to find the appropriate amount of nodes that
    are in there.
    """
    start_node = module_node.get_leaf_for_position(pos, include_prefixes=True)

    if until_pos is None:
        if start_node.type == 'operator':
            next_leaf = start_node.get_next_leaf()
            if next_leaf is not None and next_leaf.start_pos == pos:
                start_node = next_leaf

        if _is_not_extractable_syntax(start_node):
            start_node = start_node.parent

        if start_node.parent.type == 'trailer':
            start_node = start_node.parent.parent
        while start_node.parent.type in EXPRESSION_PARTS:
            start_node = start_node.parent

        nodes = [start_node]
    else:
        # Get the next leaf if we are at the end of a leaf
        if start_node.end_pos == pos:
            next_leaf = start_node.get_next_leaf()
            if next_leaf is not None:
                start_node = next_leaf

        # Some syntax is not exactable, just use its parent
        if _is_not_extractable_syntax(start_node):
            start_node = start_node.parent

        # Find the end
        end_leaf = module_node.get_leaf_for_position(until_pos, include_prefixes=True)
        if end_leaf.start_pos > until_pos:
            end_leaf = end_leaf.get_previous_leaf()
            if end_leaf is None:
                raise RefactoringError('Cannot extract anything from that')

        parent_node = start_node
        while parent_node.end_pos < end_leaf.end_pos:
            parent_node = parent_node.parent

        nodes = _remove_unwanted_expression_nodes(parent_node, pos, until_pos)

    # If the user marks just a return statement, we return the expression
    # instead of the whole statement, because the user obviously wants to
    # extract that part.
    if len(nodes) == 1 and start_node.type in ('return_stmt', 'yield_expr'):
        return [nodes[0].children[1]]
    return nodes


def _replace(nodes, expression_replacement, extracted, pos,
             insert_before_leaf=None, remaining_prefix=None):
    # Now try to replace the nodes found with a variable and move the code
    # before the current statement.
    definition = _get_parent_definition(nodes[0])
    if insert_before_leaf is None:
        insert_before_leaf = definition.get_first_leaf()
    first_node_leaf = nodes[0].get_first_leaf()

    lines = split_lines(insert_before_leaf.prefix, keepends=True)
    if first_node_leaf is insert_before_leaf:
        if remaining_prefix is not None:
            # The remaining prefix has already been calculated.
            lines[:-1] = remaining_prefix
    lines[-1:-1] = [indent_block(extracted, lines[-1]) + '\n']
    extracted_prefix = ''.join(lines)

    replacement_dct = {}
    if first_node_leaf is insert_before_leaf:
        replacement_dct[nodes[0]] = extracted_prefix + expression_replacement
    else:
        if remaining_prefix is None:
            p = first_node_leaf.prefix
        else:
            p = remaining_prefix + _get_indentation(nodes[0])
        replacement_dct[nodes[0]] = p + expression_replacement
        replacement_dct[insert_before_leaf] = extracted_prefix + insert_before_leaf.value

    for node in nodes[1:]:
        replacement_dct[node] = ''
    return replacement_dct


def _expression_nodes_to_string(nodes):
    return ''.join(n.get_code(include_prefix=i != 0) for i, n in enumerate(nodes))


def _suite_nodes_to_string(nodes, pos):
    n = nodes[0]
    prefix, part_of_code = _split_prefix_at(n.get_first_leaf(), pos[0] - 1)
    code = part_of_code + n.get_code(include_prefix=False) \
        + ''.join(n.get_code() for n in nodes[1:])
    return prefix, code


def _split_prefix_at(leaf, until_line):
    """
    Returns a tuple of the leaf's prefix, split at the until_line
    position.
    """
    # second means the second returned part
    second_line_count = leaf.start_pos[0] - until_line
    lines = split_lines(leaf.prefix, keepends=True)
    return ''.join(lines[:-second_line_count]), ''.join(lines[-second_line_count:])


def _get_indentation(node):
    return split_lines(node.get_first_leaf().prefix)[-1]


def _get_parent_definition(node):
    """
    Returns the statement where a node is defined.
    """
    while node is not None:
        if node.parent.type in _DEFINITION_SCOPES:
            return node
        node = node.parent
    raise NotImplementedError('We should never even get here')


def _remove_unwanted_expression_nodes(parent_node, pos, until_pos):
    """
    This function makes it so for `1 * 2 + 3` you can extract `2 + 3`, even
    though it is not part of the expression.
    """
    typ = parent_node.type
    is_suite_part = typ in ('suite', 'file_input')
    if typ in EXPRESSION_PARTS or is_suite_part:
        nodes = parent_node.children
        for i, n in enumerate(nodes):
            if n.end_pos > pos:
                start_index = i
                if n.type == 'operator':
                    start_index -= 1
                break
        for i, n in reversed(list(enumerate(nodes))):
            if n.start_pos < until_pos:
                end_index = i
                if n.type == 'operator':
                    end_index += 1

                # Something like `not foo or bar` should not be cut after not
                for n2 in nodes[i:]:
                    if _is_not_extractable_syntax(n2):
                        end_index += 1
                    else:
                        break
                break
        nodes = nodes[start_index:end_index + 1]
        if not is_suite_part:
            nodes[0:1] = _remove_unwanted_expression_nodes(nodes[0], pos, until_pos)
            nodes[-1:] = _remove_unwanted_expression_nodes(nodes[-1], pos, until_pos)
        return nodes
    return [parent_node]


def _is_not_extractable_syntax(node):
    return node.type == 'operator' \
        or node.type == 'keyword' and node.value not in ('None', 'True', 'False')


def extract_function(inference_state, path, module_context, name, pos, until_pos):
    nodes = _find_nodes(module_context.tree_node, pos, until_pos)
    assert len(nodes)

    is_expression, _ = _is_expression_with_error(nodes)
    context = module_context.create_context(nodes[0])
    is_bound_method = context.is_bound_method()
    params, return_variables = list(_find_inputs_and_outputs(module_context, context, nodes))

    # Find variables
    # Is a class method / method
    if context.is_module():
        insert_before_leaf = None  # Leaf will be determined later
    else:
        node = _get_code_insertion_node(context.tree_node, is_bound_method)
        insert_before_leaf = node.get_first_leaf()
    if is_expression:
        code_block = 'return ' + _expression_nodes_to_string(nodes) + '\n'
        remaining_prefix = None
        has_ending_return_stmt = False
    else:
        has_ending_return_stmt = _is_node_ending_return_stmt(nodes[-1])
        if not has_ending_return_stmt:
            # Find the actually used variables (of the defined ones). If none are
            # used (e.g. if the range covers the whole function), return the last
            # defined variable.
            return_variables = list(_find_needed_output_variables(
                context,
                nodes[0].parent,
                nodes[-1].end_pos,
                return_variables
            )) or [return_variables[-1]] if return_variables else []

        remaining_prefix, code_block = _suite_nodes_to_string(nodes, pos)
        after_leaf = nodes[-1].get_next_leaf()
        first, second = _split_prefix_at(after_leaf, until_pos[0])
        code_block += first

        code_block = dedent(code_block)
        if not has_ending_return_stmt:
            output_var_str = ', '.join(return_variables)
            code_block += 'return ' + output_var_str + '\n'

    # Check if we have to raise RefactoringError
    _check_for_non_extractables(nodes[:-1] if has_ending_return_stmt else nodes)

    decorator = ''
    self_param = None
    if is_bound_method:
        if not function_is_staticmethod(context.tree_node):
            function_param_names = context.get_value().get_param_names()
            if len(function_param_names):
                self_param = function_param_names[0].string_name
                params = [p for p in params if p != self_param]

        if function_is_classmethod(context.tree_node):
            decorator = '@classmethod\n'
    else:
        code_block += '\n'

    function_code = '%sdef %s(%s):\n%s' % (
        decorator,
        name,
        ', '.join(params if self_param is None else [self_param] + params),
        indent_block(code_block)
    )

    function_call = '%s(%s)' % (
        ('' if self_param is None else self_param + '.') + name,
        ', '.join(params)
    )
    if is_expression:
        replacement = function_call
    else:
        if has_ending_return_stmt:
            replacement = 'return ' + function_call + '\n'
        else:
            replacement = output_var_str + ' = ' + function_call + '\n'

    replacement_dct = _replace(nodes, replacement, function_code, pos,
                               insert_before_leaf, remaining_prefix)
    if not is_expression:
        replacement_dct[after_leaf] = second + after_leaf.value
    file_to_node_changes = {path: replacement_dct}
    return Refactoring(inference_state, file_to_node_changes)


def _check_for_non_extractables(nodes):
    for n in nodes:
        try:
            children = n.children
        except AttributeError:
            if n.value == 'return':
                raise RefactoringError(
                    'Can only extract return statements if they are at the end.')
            if n.value == 'yield':
                raise RefactoringError('Cannot extract yield statements.')
        else:
            _check_for_non_extractables(children)


def _is_name_input(module_context, names, first, last):
    for name in names:
        if name.api_type == 'param' or not name.parent_context.is_module():
            if name.get_root_context() is not module_context:
                return True
            if name.start_pos is None or not (first <= name.start_pos < last):
                return True
    return False


def _find_inputs_and_outputs(module_context, context, nodes):
    first = nodes[0].start_pos
    last = nodes[-1].end_pos

    inputs = []
    outputs = []
    for name in _find_non_global_names(nodes):
        if name.is_definition():
            if name not in outputs:
                outputs.append(name.value)
        else:
            if name.value not in inputs:
                name_definitions = context.goto(name, name.start_pos)
                if not name_definitions \
                        or _is_name_input(module_context, name_definitions, first, last):
                    inputs.append(name.value)

    # Check if outputs are really needed:
    return inputs, outputs


def _find_non_global_names(nodes):
    for node in nodes:
        try:
            children = node.children
        except AttributeError:
            if node.type == 'name':
                yield node
        else:
            # We only want to check foo in foo.bar
            if node.type == 'trailer' and node.children[0] == '.':
                continue

            yield from _find_non_global_names(children)


def _get_code_insertion_node(node, is_bound_method):
    if not is_bound_method or function_is_staticmethod(node):
        while node.parent.type != 'file_input':
            node = node.parent

    while node.parent.type in ('async_funcdef', 'decorated', 'async_stmt'):
        node = node.parent
    return node


def _find_needed_output_variables(context, search_node, at_least_pos, return_variables):
    """
    Searches everything after at_least_pos in a node and checks if any of the
    return_variables are used in there and returns those.
    """
    for node in search_node.children:
        if node.start_pos < at_least_pos:
            continue

        return_variables = set(return_variables)
        for name in _find_non_global_names([node]):
            if not name.is_definition() and name.value in return_variables:
                return_variables.remove(name.value)
                yield name.value


def _is_node_ending_return_stmt(node):
    t = node.type
    if t == 'simple_stmt':
        return _is_node_ending_return_stmt(node.children[0])
    return t == 'return_stmt'
