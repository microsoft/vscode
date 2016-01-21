"""
Helpers for the API
"""
import re

from jedi.parser import tree as pt
from jedi.evaluate import imports


def completion_parts(path_until_cursor):
    """
    Returns the parts for the completion
    :return: tuple - (path, dot, like)
    """
    match = re.match(r'^(.*?)(\.|)(\w?[\w\d]*)$', path_until_cursor, flags=re.S)
    return match.groups()


def sorted_definitions(defs):
    # Note: `or ''` below is required because `module_path` could be
    return sorted(defs, key=lambda x: (x.module_path or '', x.line or 0, x.column or 0))


def get_on_import_stmt(evaluator, user_context, user_stmt, is_like_search=False):
    """
    Resolve the user statement, if it is an import. Only resolve the
    parts until the user position.
    """
    name = user_stmt.name_for_position(user_context.position)
    if name is None:
        return None, None

    i = imports.ImportWrapper(evaluator, name)
    return i, name


def check_error_statements(module, pos):
    for error_statement in module.error_statement_stacks:
        if error_statement.first_type in ('import_from', 'import_name') \
                and error_statement.first_pos < pos <= error_statement.next_start_pos:
            return importer_from_error_statement(error_statement, pos)
    return None, 0, False, False


def importer_from_error_statement(error_statement, pos):
    def check_dotted(children):
        for name in children[::2]:
            if name.start_pos <= pos:
                yield name

    names = []
    level = 0
    only_modules = True
    unfinished_dotted = False
    for typ, nodes in error_statement.stack:
        if typ == 'dotted_name':
            names += check_dotted(nodes)
            if nodes[-1] == '.':
                # An unfinished dotted_name
                unfinished_dotted = True
        elif typ == 'import_name':
            if nodes[0].start_pos <= pos <= nodes[0].end_pos:
                # We are on the import.
                return None, 0, False, False
        elif typ == 'import_from':
            for node in nodes:
                if node.start_pos >= pos:
                    break
                elif isinstance(node, pt.Node) and node.type == 'dotted_name':
                    names += check_dotted(node.children)
                elif node in ('.', '...'):
                    level += len(node.value)
                elif isinstance(node, pt.Name):
                    names.append(node)
                elif node == 'import':
                    only_modules = False

    return names, level, only_modules, unfinished_dotted
