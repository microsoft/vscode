import re
from textwrap import dedent
from inspect import Parameter

from lotas.erdos._vendor.parso.python.token import PythonTokenTypes
from lotas.erdos._vendor.parso.python import tree
from lotas.erdos._vendor.parso.tree import search_ancestor, Leaf
from lotas.erdos._vendor.parso import split_lines

from jedi import debug
from jedi import settings
from lotas.erdos._vendor.jedi.api import classes
from lotas.erdos._vendor.jedi.api import helpers
from lotas.erdos._vendor.jedi.api import keywords
from lotas.erdos._vendor.jedi.api.strings import complete_dict
from lotas.erdos._vendor.jedi.api.file_name import complete_file_name
from lotas.erdos._vendor.jedi.inference import imports
from lotas.erdos._vendor.jedi.inference.base_value import ValueSet
from lotas.erdos._vendor.jedi.inference.helpers import infer_call_of_leaf, parse_dotted_names
from lotas.erdos._vendor.jedi.inference.context import get_global_filters
from lotas.erdos._vendor.jedi.inference.value import TreeInstance
from lotas.erdos._vendor.jedi.inference.docstring_utils import DocstringModule
from lotas.erdos._vendor.jedi.inference.names import ParamNameWrapper, SubModuleName
from lotas.erdos._vendor.jedi.inference.gradual.conversion import convert_values, convert_names
from lotas.erdos._vendor.jedi.parser_utils import cut_value_at_position
from lotas.erdos._vendor.jedi.plugins import plugin_manager


class ParamNameWithEquals(ParamNameWrapper):
    def get_public_name(self):
        return self.string_name + '='


def _get_signature_param_names(signatures, positional_count, used_kwargs):
    # Add named params
    for call_sig in signatures:
        for i, p in enumerate(call_sig.params):
            kind = p.kind
            if i < positional_count and kind == Parameter.POSITIONAL_OR_KEYWORD:
                continue
            if kind in (Parameter.POSITIONAL_OR_KEYWORD, Parameter.KEYWORD_ONLY) \
                    and p.name not in used_kwargs:
                yield ParamNameWithEquals(p._name)


def _must_be_kwarg(signatures, positional_count, used_kwargs):
    if used_kwargs:
        return True

    must_be_kwarg = True
    for signature in signatures:
        for i, p in enumerate(signature.params):
            kind = p.kind
            if kind is Parameter.VAR_POSITIONAL:
                # In case there were not already kwargs, the next param can
                # always be a normal argument.
                return False

            if i >= positional_count and kind in (Parameter.POSITIONAL_OR_KEYWORD,
                                                  Parameter.POSITIONAL_ONLY):
                must_be_kwarg = False
                break
        if not must_be_kwarg:
            break
    return must_be_kwarg


def filter_names(inference_state, completion_names, stack, like_name, fuzzy,
                 imported_names, cached_name):
    comp_dct = set()
    if settings.case_insensitive_completion:
        like_name = like_name.lower()
    for name in completion_names:
        string = name.string_name
        if string in imported_names and string != like_name:
            continue
        if settings.case_insensitive_completion:
            string = string.lower()
        if helpers.match(string, like_name, fuzzy=fuzzy):
            new = classes.Completion(
                inference_state,
                name,
                stack,
                len(like_name),
                is_fuzzy=fuzzy,
                cached_name=cached_name,
            )
            k = (new.name, new.complete)  # key
            if k not in comp_dct:
                comp_dct.add(k)
                tree_name = name.tree_name
                if tree_name is not None:
                    definition = tree_name.get_definition()
                    if definition is not None and definition.type == 'del_stmt':
                        continue
                yield new


def _remove_duplicates(completions, other_completions):
    names = {d.name for d in other_completions}
    return [c for c in completions if c.name not in names]


def get_user_context(module_context, position):
    """
    Returns the scope in which the user resides. This includes flows.
    """
    leaf = module_context.tree_node.get_leaf_for_position(position, include_prefixes=True)
    return module_context.create_context(leaf)


def get_flow_scope_node(module_node, position):
    node = module_node.get_leaf_for_position(position, include_prefixes=True)
    while not isinstance(node, (tree.Scope, tree.Flow)):
        node = node.parent

    return node


@plugin_manager.decorate()
def complete_param_names(context, function_name, decorator_nodes):
    # Basically there's no way to do param completion. The plugins are
    # responsible for this.
    return []


class Completion:
    def __init__(self, inference_state, module_context, code_lines, position,
                 signatures_callback, fuzzy=False):
        self._inference_state = inference_state
        self._module_context = module_context
        self._module_node = module_context.tree_node
        self._code_lines = code_lines

        # The first step of completions is to get the name
        self._like_name = helpers.get_on_completion_name(self._module_node, code_lines, position)
        # The actual cursor position is not what we need to calculate
        # everything. We want the start of the name we're on.
        self._original_position = position
        self._signatures_callback = signatures_callback

        self._fuzzy = fuzzy

    # Return list of completions in this order:
    # - Beginning with what user is typing
    # - Public (alphabet)
    # - Private ("_xxx")
    # - Dunder ("__xxx")
    def complete(self):
        leaf = self._module_node.get_leaf_for_position(
            self._original_position,
            include_prefixes=True
        )
        string, start_leaf, quote = _extract_string_while_in_string(leaf, self._original_position)

        prefixed_completions = complete_dict(
            self._module_context,
            self._code_lines,
            start_leaf or leaf,
            self._original_position,
            None if string is None else quote + string,
            fuzzy=self._fuzzy,
        )

        if string is not None and not prefixed_completions:
            prefixed_completions = list(complete_file_name(
                self._inference_state, self._module_context, start_leaf, quote, string,
                self._like_name, self._signatures_callback,
                self._code_lines, self._original_position,
                self._fuzzy
            ))
        if string is not None:
            if not prefixed_completions and '\n' in string:
                # Complete only multi line strings
                prefixed_completions = self._complete_in_string(start_leaf, string)
            return prefixed_completions

        cached_name, completion_names = self._complete_python(leaf)

        imported_names = []
        if leaf.parent is not None and leaf.parent.type in ['import_as_names', 'dotted_as_names']:
            imported_names.extend(extract_imported_names(leaf.parent))

        completions = list(filter_names(self._inference_state, completion_names,
                                        self.stack, self._like_name,
                                        self._fuzzy, imported_names, cached_name=cached_name))

        return (
            # Removing duplicates mostly to remove False/True/None duplicates.
            _remove_duplicates(prefixed_completions, completions)
            + sorted(completions, key=lambda x: (not x.name.startswith(self._like_name),
                                                 x.name.startswith('__'),
                                                 x.name.startswith('_'),
                                                 x.name.lower()))
        )

    def _complete_python(self, leaf):
        """
        Analyzes the current context of a completion and decides what to
        return.

        Technically this works by generating a parser stack and analysing the
        current stack for possible grammar nodes.

        Possible enhancements:
        - global/nonlocal search global
        - yield from / raise from <- could be only exceptions/generators
        - In args: */**: no completion
        - In params (also lambda): no completion before =
        """
        grammar = self._inference_state.grammar
        self.stack = stack = None
        self._position = (
            self._original_position[0],
            self._original_position[1] - len(self._like_name)
        )
        cached_name = None

        try:
            self.stack = stack = helpers.get_stack_at_position(
                grammar, self._code_lines, leaf, self._position
            )
        except helpers.OnErrorLeaf as e:
            value = e.error_leaf.value
            if value == '.':
                # After ErrorLeaf's that are dots, we will not do any
                # completions since this probably just confuses the user.
                return cached_name, []

            # If we don't have a value, just use global completion.
            return cached_name, self._complete_global_scope()

        allowed_transitions = \
            list(stack._allowed_transition_names_and_token_types())

        if 'if' in allowed_transitions:
            leaf = self._module_node.get_leaf_for_position(self._position, include_prefixes=True)
            previous_leaf = leaf.get_previous_leaf()

            indent = self._position[1]
            if not (leaf.start_pos <= self._position <= leaf.end_pos):
                indent = leaf.start_pos[1]

            if previous_leaf is not None:
                stmt = previous_leaf
                while True:
                    stmt = search_ancestor(
                        stmt, 'if_stmt', 'for_stmt', 'while_stmt', 'try_stmt',
                        'error_node',
                    )
                    if stmt is None:
                        break

                    type_ = stmt.type
                    if type_ == 'error_node':
                        first = stmt.children[0]
                        if isinstance(first, Leaf):
                            type_ = first.value + '_stmt'
                    # Compare indents
                    if stmt.start_pos[1] == indent:
                        if type_ == 'if_stmt':
                            allowed_transitions += ['elif', 'else']
                        elif type_ == 'try_stmt':
                            allowed_transitions += ['except', 'finally', 'else']
                        elif type_ == 'for_stmt':
                            allowed_transitions.append('else')

        completion_names = []

        kwargs_only = False
        if any(t in allowed_transitions for t in (PythonTokenTypes.NAME,
                                                  PythonTokenTypes.INDENT)):
            # This means that we actually have to do type inference.

            nonterminals = [stack_node.nonterminal for stack_node in stack]

            nodes = _gather_nodes(stack)
            if nodes and nodes[-1] in ('as', 'def', 'class'):
                # No completions for ``with x as foo`` and ``import x as foo``.
                # Also true for defining names as a class or function.
                return cached_name, list(self._complete_inherited(is_function=True))
            elif "import_stmt" in nonterminals:
                level, names = parse_dotted_names(nodes, "import_from" in nonterminals)

                only_modules = not ("import_from" in nonterminals and 'import' in nodes)
                completion_names += self._get_importer_names(
                    names,
                    level,
                    only_modules=only_modules,
                )
            elif nonterminals[-1] in ('trailer', 'dotted_name') and nodes[-1] == '.':
                dot = self._module_node.get_leaf_for_position(self._position)
                if dot.type == "endmarker":
                    # This is a bit of a weird edge case, maybe we can somehow
                    # generalize this.
                    dot = leaf.get_previous_leaf()
                cached_name, n = self._complete_trailer(dot.get_previous_leaf())
                completion_names += n
            elif self._is_parameter_completion():
                completion_names += self._complete_params(leaf)
            else:
                # Apparently this looks like it's good enough to filter most cases
                # so that signature completions don't randomly appear.
                # To understand why this works, three things are important:
                # 1. trailer with a `,` in it is either a subscript or an arglist.
                # 2. If there's no `,`, it's at the start and only signatures start
                #    with `(`. Other trailers could start with `.` or `[`.
                # 3. Decorators are very primitive and have an optional `(` with
                #    optional arglist in them.
                if nodes[-1] in ['(', ','] \
                        and nonterminals[-1] in ('trailer', 'arglist', 'decorator'):
                    signatures = self._signatures_callback(*self._position)
                    if signatures:
                        call_details = signatures[0]._call_details
                        used_kwargs = list(call_details.iter_used_keyword_arguments())
                        positional_count = call_details.count_positional_arguments()

                        completion_names += _get_signature_param_names(
                            signatures,
                            positional_count,
                            used_kwargs,
                        )

                        kwargs_only = _must_be_kwarg(signatures, positional_count, used_kwargs)

                if not kwargs_only:
                    completion_names += self._complete_global_scope()
                    completion_names += self._complete_inherited(is_function=False)

        if not kwargs_only:
            current_line = self._code_lines[self._position[0] - 1][:self._position[1]]
            completion_names += self._complete_keywords(
                allowed_transitions,
                only_values=not (not current_line or current_line[-1] in ' \t.;'
                                 and current_line[-3:] != '...')
            )

        return cached_name, completion_names

    def _is_parameter_completion(self):
        tos = self.stack[-1]
        if tos.nonterminal == 'lambdef' and len(tos.nodes) == 1:
            # We are at the position `lambda `, where basically the next node
            # is a param.
            return True
        if tos.nonterminal in 'parameters':
            # Basically we are at the position `foo(`, there's nothing there
            # yet, so we have no `typedargslist`.
            return True
        # var args is for lambdas and typed args for normal functions
        return tos.nonterminal in ('typedargslist', 'varargslist') and tos.nodes[-1] == ','

    def _complete_params(self, leaf):
        stack_node = self.stack[-2]
        if stack_node.nonterminal == 'parameters':
            stack_node = self.stack[-3]
        if stack_node.nonterminal == 'funcdef':
            context = get_user_context(self._module_context, self._position)
            node = search_ancestor(leaf, 'error_node', 'funcdef')
            if node is not None:
                if node.type == 'error_node':
                    n = node.children[0]
                    if n.type == 'decorators':
                        decorators = n.children
                    elif n.type == 'decorator':
                        decorators = [n]
                    else:
                        decorators = []
                else:
                    decorators = node.get_decorators()
                function_name = stack_node.nodes[1]

                return complete_param_names(context, function_name.value, decorators)
        return []

    def _complete_keywords(self, allowed_transitions, only_values):
        for k in allowed_transitions:
            if isinstance(k, str) and k.isalpha():
                if not only_values or k in ('True', 'False', 'None'):
                    yield keywords.KeywordName(self._inference_state, k)

    def _complete_global_scope(self):
        context = get_user_context(self._module_context, self._position)
        debug.dbg('global completion scope: %s', context)
        flow_scope_node = get_flow_scope_node(self._module_node, self._position)
        filters = get_global_filters(
            context,
            self._position,
            flow_scope_node
        )
        completion_names = []
        for filter in filters:
            completion_names += filter.values()
        return completion_names

    def _complete_trailer(self, previous_leaf):
        inferred_context = self._module_context.create_context(previous_leaf)
        values = infer_call_of_leaf(inferred_context, previous_leaf)
        debug.dbg('trailer completion values: %s', values, color='MAGENTA')

        # The cached name simply exists to make speed optimizations for certain
        # modules.
        cached_name = None
        if len(values) == 1:
            v, = values
            if v.is_module():
                if len(v.string_names) == 1:
                    module_name = v.string_names[0]
                    if module_name in ('numpy', 'tensorflow', 'matplotlib', 'pandas'):
                        cached_name = module_name

        return cached_name, self._complete_trailer_for_values(values)

    def _complete_trailer_for_values(self, values):
        user_context = get_user_context(self._module_context, self._position)

        return complete_trailer(user_context, values)

    def _get_importer_names(self, names, level=0, only_modules=True):
        names = [n.value for n in names]
        i = imports.Importer(self._inference_state, names, self._module_context, level)
        return i.completion_names(self._inference_state, only_modules=only_modules)

    def _complete_inherited(self, is_function=True):
        """
        Autocomplete inherited methods when overriding in child class.
        """
        leaf = self._module_node.get_leaf_for_position(self._position, include_prefixes=True)
        cls = tree.search_ancestor(leaf, 'classdef')
        if cls is None:
            return

        # Complete the methods that are defined in the super classes.
        class_value = self._module_context.create_value(cls)

        if cls.start_pos[1] >= leaf.start_pos[1]:
            return

        filters = class_value.get_filters(is_instance=True)
        # The first dict is the dictionary of class itself.
        next(filters)
        for filter in filters:
            for name in filter.values():
                # TODO we should probably check here for properties
                if (name.api_type == 'function') == is_function:
                    yield name

    def _complete_in_string(self, start_leaf, string):
        """
        To make it possible for people to have completions in doctests or
        generally in "Python" code in docstrings, we use the following
        heuristic:

        - Having an indented block of code
        - Having some doctest code that starts with `>>>`
        - Having backticks that doesn't have whitespace inside it
        """

        def iter_relevant_lines(lines):
            include_next_line = False
            for l in code_lines:
                if include_next_line or l.startswith('>>>') or l.startswith(' '):
                    yield re.sub(r'^( *>>> ?| +)', '', l)
                else:
                    yield None

                include_next_line = bool(re.match(' *>>>', l))

        string = dedent(string)
        code_lines = split_lines(string, keepends=True)
        relevant_code_lines = list(iter_relevant_lines(code_lines))
        if relevant_code_lines[-1] is not None:
            # Some code lines might be None, therefore get rid of that.
            relevant_code_lines = ['\n' if c is None else c for c in relevant_code_lines]
            return self._complete_code_lines(relevant_code_lines)
        match = re.search(r'`([^`\s]+)', code_lines[-1])
        if match:
            return self._complete_code_lines([match.group(1)])
        return []

    def _complete_code_lines(self, code_lines):
        module_node = self._inference_state.grammar.parse(''.join(code_lines))
        module_value = DocstringModule(
            in_module_context=self._module_context,
            inference_state=self._inference_state,
            module_node=module_node,
            code_lines=code_lines,
        )
        return Completion(
            self._inference_state,
            module_value.as_context(),
            code_lines=code_lines,
            position=module_node.end_pos,
            signatures_callback=lambda *args, **kwargs: [],
            fuzzy=self._fuzzy
        ).complete()


def _gather_nodes(stack):
    nodes = []
    for stack_node in stack:
        if stack_node.dfa.from_rule == 'small_stmt':
            nodes = []
        else:
            nodes += stack_node.nodes
    return nodes


_string_start = re.compile(r'^\w*(\'{3}|"{3}|\'|")')


def _extract_string_while_in_string(leaf, position):
    def return_part_of_leaf(leaf):
        kwargs = {}
        if leaf.line == position[0]:
            kwargs['endpos'] = position[1] - leaf.column
        match = _string_start.match(leaf.value, **kwargs)
        if not match:
            return None, None, None
        start = match.group(0)
        if leaf.line == position[0] and position[1] < leaf.column + match.end():
            return None, None, None
        return cut_value_at_position(leaf, position)[match.end():], leaf, start

    if position < leaf.start_pos:
        return None, None, None

    if leaf.type == 'string':
        return return_part_of_leaf(leaf)

    leaves = []
    while leaf is not None:
        if leaf.type == 'error_leaf' and ('"' in leaf.value or "'" in leaf.value):
            if len(leaf.value) > 1:
                return return_part_of_leaf(leaf)
            prefix_leaf = None
            if not leaf.prefix:
                prefix_leaf = leaf.get_previous_leaf()
                if prefix_leaf is None or prefix_leaf.type != 'name' \
                        or not all(c in 'rubf' for c in prefix_leaf.value.lower()):
                    prefix_leaf = None

            return (
                ''.join(cut_value_at_position(l, position) for l in leaves),
                prefix_leaf or leaf,
                ('' if prefix_leaf is None else prefix_leaf.value)
                + cut_value_at_position(leaf, position),
            )
        if leaf.line != position[0]:
            # Multi line strings are always simple error leaves and contain the
            # whole string, single line error leaves are atherefore important
            # now and since the line is different, it's not really a single
            # line string anymore.
            break
        leaves.insert(0, leaf)
        leaf = leaf.get_previous_leaf()
    return None, None, None


def complete_trailer(user_context, values):
    completion_names = []
    for value in values:
        for filter in value.get_filters(origin_scope=user_context.tree_node):
            completion_names += filter.values()

        if not value.is_stub() and isinstance(value, TreeInstance):
            completion_names += _complete_getattr(user_context, value)

    python_values = convert_values(values)
    for c in python_values:
        if c not in values:
            for filter in c.get_filters(origin_scope=user_context.tree_node):
                completion_names += filter.values()
    return completion_names


def _complete_getattr(user_context, instance):
    """
    A heuristic to make completion for proxy objects work. This is not
    intended to work in all cases. It works exactly in this case:

        def __getattr__(self, name):
            ...
            return getattr(any_object, name)

    It is important that the return contains getattr directly, otherwise it
    won't work anymore. It's really just a stupid heuristic. It will not
    work if you write e.g. `return (getatr(o, name))`, because of the
    additional parentheses. It will also not work if you move the getattr
    to some other place that is not the return statement itself.

    It is intentional that it doesn't work in all cases. Generally it's
    really hard to do even this case (as you can see below). Most people
    will write it like this anyway and the other ones, well they are just
    out of luck I guess :) ~dave.
    """
    names = (instance.get_function_slot_names('__getattr__')
             or instance.get_function_slot_names('__getattribute__'))
    functions = ValueSet.from_sets(
        name.infer()
        for name in names
    )
    for func in functions:
        tree_node = func.tree_node
        if tree_node is None or tree_node.type != 'funcdef':
            continue

        for return_stmt in tree_node.iter_return_stmts():
            # Basically until the next comment we just try to find out if a
            # return statement looks exactly like `return getattr(x, name)`.
            if return_stmt.type != 'return_stmt':
                continue
            atom_expr = return_stmt.children[1]
            if atom_expr.type != 'atom_expr':
                continue
            atom = atom_expr.children[0]
            trailer = atom_expr.children[1]
            if len(atom_expr.children) != 2 or atom.type != 'name' \
                    or atom.value != 'getattr':
                continue
            arglist = trailer.children[1]
            if arglist.type != 'arglist' or len(arglist.children) < 3:
                continue
            context = func.as_context()
            object_node = arglist.children[0]

            # Make sure it's a param: foo in __getattr__(self, foo)
            name_node = arglist.children[2]
            name_list = context.goto(name_node, name_node.start_pos)
            if not any(n.api_type == 'param' for n in name_list):
                continue

            # Now that we know that these are most probably completion
            # objects, we just infer the object and return them as
            # completions.
            objects = context.infer_node(object_node)
            return complete_trailer(user_context, objects)
    return []


def search_in_module(inference_state, module_context, names, wanted_names,
                     wanted_type, complete=False, fuzzy=False,
                     ignore_imports=False, convert=False):
    for s in wanted_names[:-1]:
        new_names = []
        for n in names:
            if s == n.string_name:
                if n.tree_name is not None and n.api_type in ('module', 'namespace') \
                        and ignore_imports:
                    continue
                new_names += complete_trailer(
                    module_context,
                    n.infer()
                )
        debug.dbg('dot lookup on search %s from %s', new_names, names[:10])
        names = new_names

    last_name = wanted_names[-1].lower()
    for n in names:
        string = n.string_name.lower()
        if complete and helpers.match(string, last_name, fuzzy=fuzzy) \
                or not complete and string == last_name:
            if isinstance(n, SubModuleName):
                names = [v.name for v in n.infer()]
            else:
                names = [n]
            if convert:
                names = convert_names(names)
            for n2 in names:
                if complete:
                    def_ = classes.Completion(
                        inference_state, n2,
                        stack=None,
                        like_name_length=len(last_name),
                        is_fuzzy=fuzzy,
                    )
                else:
                    def_ = classes.Name(inference_state, n2)
                if not wanted_type or wanted_type == def_.type:
                    yield def_


def extract_imported_names(node):
    imported_names = []

    if node.type in ['import_as_names', 'dotted_as_names', 'import_as_name']:
        for index, child in enumerate(node.children):
            if child.type == 'name':
                if (index > 0 and node.children[index - 1].type == "keyword"
                        and node.children[index - 1].value == "as"):
                    continue
                imported_names.append(child.value)
            elif child.type == 'import_as_name':
                imported_names.extend(extract_imported_names(child))

    return imported_names
