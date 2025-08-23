# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

import ast
import json
import re
import sys
import textwrap
from typing import Iterable

attach_bracket_paste = sys.version_info >= (3, 13)


def split_lines(source):
    """
    Split selection lines in a version-agnostic way.

    Python grammar only treats \r, \n, and \r\n as newlines.
    But splitlines() in Python 3 has a much larger list: for example, it also includes \v, \f.
    As such, this function will split lines across all Python versions.
    """
    return re.split(r"[\n\r]+", source)


def _get_statements(selection):
    """Process a multiline selection into a list of its top-level statements.

    This will remove empty newlines around and within the selection, dedent it,
    and split it using the result of `ast.parse()`.
    """
    # Remove blank lines within the selection to prevent the REPL from thinking the block is finished.
    lines = (line for line in split_lines(selection) if line.strip() != "")

    # Dedent the selection and parse it using the ast module.
    # Note that leading comments in the selection will be discarded during parsing.
    source = textwrap.dedent("\n".join(lines))
    tree = ast.parse(source)

    # We'll need the dedented lines to rebuild the selection.
    lines = split_lines(source)

    # Get the line ranges for top-level blocks returned from parsing the dedented text
    # and split the selection accordingly.
    # tree.body is a list of AST objects, which we rely on to extract top-level statements.
    # If we supported Python 3.8+ only we could use the lineno and end_lineno attributes of each object
    # to get the boundaries of each block.
    # However, earlier Python versions only have the lineno attribute, which is the range start position (1-indexed).
    # Therefore, to retrieve the end line of each block in a version-agnostic way we need to do
    # `end = next_block.lineno - 1`
    # for all blocks except the last one, which will will just run until the last line.
    ends = []
    for node in tree.body[1:]:
        line_end = node.lineno - 1
        # Special handling of decorators:
        # In Python 3.8 and higher, decorators are not taken into account in the value returned by lineno,
        # and we have to use the length of the decorator_list array to compute the actual start line.
        # Before that, lineno takes into account decorators, so this offset check is unnecessary.
        # Also, not all AST objects can have decorators.
        if hasattr(node, "decorator_list") and sys.version_info >= (3, 8):
            # Using getattr instead of node.decorator_list or pyright will complain about an unknown member.
            line_end -= len(getattr(node, "decorator_list"))  # noqa: B009
        ends.append(line_end)
    ends.append(len(lines))

    for node, end in zip(tree.body, ends):
        # Given this selection:
        # 1: if (m > 0 and
        # 2:        n < 3):
        # 3:     print('foo')
        # 4: value = 'bar'
        #
        # The first block would have lineno = 1,and the second block lineno = 4
        start = node.lineno - 1

        # Special handling of decorators similar to what's above.
        if hasattr(node, "decorator_list") and sys.version_info >= (3, 8):
            # Using getattr instead of node.decorator_list or pyright will complain about an unknown member.
            start -= len(getattr(node, "decorator_list"))  # noqa: B009
        block = "\n".join(lines[start:end])

        # If the block is multiline, add an extra newline character at its end.
        # This way, when joining blocks back together, there will be a blank line between each multiline statement
        # and no blank lines between single-line statements, or it would look like this:
        # >>> x = 22
        # >>>
        # >>> total = x + 30
        # >>>
        # Note that for the multiline parentheses case this newline is redundant,
        # since the closing parenthesis terminates the statement already.
        # This means that for this pattern we'll end up with:
        # >>> x = [
        # ...   1
        # ... ]
        # >>>
        # >>> y = [
        # ...   2
        # ...]
        if end - start > 1:
            block += "\n"

        yield block


def normalize_lines(selection):
    """
    Normalize the text selection received from the extension.

    If it is a single line selection, dedent it and append a newline and
    send it back to the extension.
    Otherwise, sanitize the multiline selection before returning it:
    split it in a list of top-level statements
    and add newlines between each of them so the REPL knows where each block ends.
    """
    try:
        # Parse the selection into a list of top-level blocks.
        # We don't differentiate between single and multiline statements
        # because it's not a perf bottleneck,
        # and the overhead from splitting and rejoining strings in the multiline case is one-off.
        statements = _get_statements(selection)

        # Insert a newline between each top-level statement, and append a newline to the selection.
        source = "\n".join(statements) + "\n"
        # If selection ends with trailing dictionary or list, remove last unnecessary newline.
        if selection[-2] == "}" or selection[-2] == "]":
            source = source[:-1]
        # If the selection contains trailing return dictionary, insert newline to trigger execute.
        if check_end_with_return_dict(selection):
            source = source + "\n"
    except Exception:
        # If there's a problem when parsing statements,
        # append a blank line to end the block and send it as-is.
        source = selection + "\n\n"

    return source


top_level_nodes = []
min_key = None


def check_end_with_return_dict(code):
    stripped_code = code.strip()
    return stripped_code.endswith("}") and "return {" in stripped_code.strip()


def check_exact_exist(top_level_nodes, start_line, end_line):
    return [
        node
        for node in top_level_nodes
        if node.lineno == start_line and node.end_lineno == end_line
    ]


def traverse_file(whole_file_content, start_line, end_line, was_highlighted):  # noqa: ARG001
    """Intended to traverse through a user's given file content and find, collect all appropriate lines that should be sent to the REPL in case of smart selection.

    This could be exact statement such as just a single line print statement,
    or a multiline dictionary, or differently styled multi-line list comprehension, etc.
    Then call the normalize_lines function to normalize our smartly selected code block.
    """
    parsed_file_content = None

    try:
        parsed_file_content = ast.parse(whole_file_content)
    except Exception:
        # Handle case where user is attempting to run code where file contains deprecated Python code.
        # Let typescript side know and show warning message.
        return {
            "normalized_smart_result": "deprecated",
            "which_line_next": 0,
        }

    smart_code = ""
    should_run_top_blocks = []

    # Purpose of this loop is to fetch and collect all the
    # AST top level nodes, and its node.body as child nodes.
    # Individual nodes will contain information like
    # the start line, end line and get source segment information
    # that will be used to smartly select, and send normalized code.
    for node in ast.iter_child_nodes(parsed_file_content):
        top_level_nodes.append(node)

        ast_types_with_nodebody = (
            ast.Module,
            ast.Interactive,
            ast.Expression,
            ast.FunctionDef,
            ast.AsyncFunctionDef,
            ast.ClassDef,
            ast.For,
            ast.AsyncFor,
            ast.While,
            ast.If,
            ast.With,
            ast.AsyncWith,
            ast.Try,
            ast.Lambda,
            ast.IfExp,
            ast.ExceptHandler,
        )
        if isinstance(node, ast_types_with_nodebody) and isinstance(node.body, Iterable):
            top_level_nodes.extend(node.body)

    exact_nodes = check_exact_exist(top_level_nodes, start_line, end_line)

    # Just return the exact top level line, if present.
    if len(exact_nodes) > 0:
        which_line_next = 0
        for same_line_node in exact_nodes:
            should_run_top_blocks.append(same_line_node)
            smart_code += f"{ast.get_source_segment(whole_file_content, same_line_node)}\n"
            which_line_next = get_next_block_lineno(should_run_top_blocks)
        return {
            "normalized_smart_result": smart_code,
            "which_line_next": which_line_next,
        }

    # For each of the nodes in the parsed file content,
    # add the appropriate source code line(s) to be sent to the REPL, dependent on
    # user is trying to send and execute single line/statement or multiple with smart selection.
    for top_node in ast.iter_child_nodes(parsed_file_content):
        if start_line == top_node.lineno and end_line == top_node.end_lineno:
            should_run_top_blocks.append(top_node)

            smart_code += f"{ast.get_source_segment(whole_file_content, top_node)}\n"
            break  # If we found exact match, don't waste computation in parsing extra nodes.
        elif start_line >= top_node.lineno and end_line <= top_node.end_lineno:
            # Case to apply smart selection for multiple line.
            # This is the case for when we have to add multiple lines that should be included in the smart send.
            # For example:
            #    'my_dictionary': {
            #      'Audi': 'Germany',
            #      'BMW': 'Germany',
            #      'Genesis': 'Korea',
            #     }
            # with the mouse cursor at 'BMW': 'Germany', should send all of the lines that pertains to my_dictionary.

            should_run_top_blocks.append(top_node)

            smart_code += str(ast.get_source_segment(whole_file_content, top_node))
            smart_code += "\n"

    normalized_smart_result = normalize_lines(smart_code)
    which_line_next = get_next_block_lineno(should_run_top_blocks)
    return {
        "normalized_smart_result": normalized_smart_result,
        "which_line_next": which_line_next,
    }


# Look at the last top block added, find lineno for the next upcoming block,
# This will be used in calculating lineOffset to move cursor in VS Code.
def get_next_block_lineno(which_line_next):
    last_ran_lineno = int(which_line_next[-1].end_lineno)
    next_lineno = int(which_line_next[-1].end_lineno)

    for reverse_node in top_level_nodes:
        if reverse_node.lineno > last_ran_lineno:
            next_lineno = reverse_node.lineno
            break
    return next_lineno


if __name__ == "__main__":
    # Content is being sent from the extension as a JSON object.
    # Decode the data from the raw bytes.
    stdin = sys.stdin if sys.version_info < (3,) else sys.stdin.buffer
    raw = stdin.read()
    contents = json.loads(raw.decode("utf-8"))
    # Empty highlight means user has not explicitly selected specific text.
    empty_highlight = contents.get("emptyHighlight", False)

    # We also get the activeEditor selection start line and end line from the typescript VS Code side.
    # Remember to add 1 to each of the received since vscode starts line counting from 0 .
    vscode_start_line = contents["startLine"] + 1
    vscode_end_line = contents["endLine"] + 1

    # Send the normalized code back to the extension in a JSON object.
    data = None
    which_line_next = 0

    if empty_highlight and contents.get("smartSendSettingsEnabled"):
        result = traverse_file(
            contents["wholeFileContent"],
            vscode_start_line,
            vscode_end_line,
            not empty_highlight,
        )
        normalized = result["normalized_smart_result"]
        which_line_next = result["which_line_next"]
        if normalized == "deprecated":
            data = json.dumps(
                {"normalized": normalized, "attach_bracket_paste": attach_bracket_paste}
            )
        else:
            data = json.dumps(
                {
                    "normalized": normalized,
                    "nextBlockLineno": result["which_line_next"],
                    "attach_bracket_paste": attach_bracket_paste,
                }
            )
    else:
        normalized = normalize_lines(contents["code"])
        data = json.dumps({"normalized": normalized, "attach_bracket_paste": attach_bracket_paste})

    stdout = sys.stdout if sys.version_info < (3,) else sys.stdout.buffer
    stdout.write(data.encode("utf-8"))
    stdout.close()
