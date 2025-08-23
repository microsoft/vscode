"""
Functions inferring the syntax tree.
"""
import copy
import itertools

from erdos.erdos._vendor.parso.python import tree

from erdos.erdos._vendor.jedi import debug
from erdos.erdos._vendor.jedi import parser_utils
from erdos.erdos._vendor.jedi.inference.base_value import ValueSet, NO_VALUES, ContextualizedNode, \
    iterator_to_value_set, iterate_values
from erdos.erdos._vendor.jedi.inference.lazy_value import LazyTreeValue
from erdos.erdos._vendor.jedi.inference import compiled
from erdos.erdos._vendor.jedi.inference import recursion
from erdos.erdos._vendor.jedi.inference import analysis
from erdos.erdos._vendor.jedi.inference import imports
from erdos.erdos._vendor.jedi.inference import arguments
from erdos.erdos._vendor.jedi.inference.value import ClassValue, FunctionValue
from erdos.erdos._vendor.jedi.inference.value import iterable
from erdos.erdos._vendor.jedi.inference.value.dynamic_arrays import ListModification, DictModification
from erdos.erdos._vendor.jedi.inference.value import TreeInstance
from erdos.erdos._vendor.jedi.inference.helpers import is_string, is_literal, is_number, \
    get_names_of_node, is_big_annoying_library
from erdos.erdos._vendor.jedi.inference.compiled.access import COMPARISON_OPERATORS
from erdos.erdos._vendor.jedi.inference.cache import inference_state_method_cache
from erdos.erdos._vendor.jedi.inference.gradual.stub_value import VersionInfo
from erdos.erdos._vendor.jedi.inference.gradual import annotation
from erdos.erdos._vendor.jedi.inference.names import TreeNameDefinition
from erdos.erdos._vendor.jedi.inference.context import CompForContext
from erdos.erdos._vendor.jedi.inference.value.decorator import Decoratee
from erdos.erdos._vendor.jedi.plugins import plugin_manager

operator_to_magic_method = {
    '+': '__add__',
    '-': '__sub__',
    '*': '__mul__',
    '@': '__matmul__',
    '/': '__truediv__',
    '//': '__floordiv__',
    '%': '__mod__',
    '**': '__pow__',
    '<<': '__lshift__',
    '>>': '__rshift__',
    '&': '__and__',
    '|': '__or__',
    '^': '__xor__',
}

reverse_operator_to_magic_method = {
    k: '__r' + v[2:] for k, v in operator_to_magic_method.items()
}


def _limit_value_infers(func):
    """
    This is for now the way how we limit type inference going wild. There are
    other ways to ensure recursion limits as well. This is mostly necessary
    because of instance (self) access that can be quite tricky to limit.

    I'm still not sure this is the way to go, but it looks okay for now and we
    can still go anther way in the future. Tests are there. ~ dave
    """
    def wrapper(context, *args, **kwargs):
        n = context.tree_node
        inference_state = context.inference_state
        try:
            inference_state.inferred_element_counts[n] += 1
            maximum = 300
            if context.parent_context is None \
                    and context.get_value() is inference_state.builtins_module:
                # Builtins should have a more generous inference limit.
                # It is important that builtins can be executed, otherwise some
                # functions that depend on certain builtins features would be
                # broken, see e.g. GH #1432
                maximum *= 100

            if inference_state.inferred_element_counts[n] > maximum:
                debug.warning('In value %s there were too many inferences.', n)
                return NO_VALUES
        except KeyError:
            inference_state.inferred_element_counts[n] = 1
        return func(context, *args, **kwargs)

    return wrapper


def infer_node(context, element):
    if isinstance(context, CompForContext):
        return _infer_node(context, element)

    if_stmt = element
    while if_stmt is not None:
        if_stmt = if_stmt.parent
        if if_stmt.type in ('if_stmt', 'for_stmt'):
            break
        if parser_utils.is_scope(if_stmt):
            if_stmt = None
            break
    predefined_if_name_dict = context.predefined_names.get(if_stmt)
    # TODO there's a lot of issues with this one. We actually should do
    # this in a different way. Caching should only be active in certain
    # cases and this all sucks.
    if predefined_if_name_dict is None and if_stmt \
            and if_stmt.type == 'if_stmt' and context.inference_state.is_analysis:
        if_stmt_test = if_stmt.children[1]
        name_dicts = [{}]
        # If we already did a check, we don't want to do it again -> If
        # value.predefined_names is filled, we stop.
        # We don't want to check the if stmt itself, it's just about
        # the content.
        if element.start_pos > if_stmt_test.end_pos:
            # Now we need to check if the names in the if_stmt match the
            # names in the suite.
            if_names = get_names_of_node(if_stmt_test)
            element_names = get_names_of_node(element)
            str_element_names = [e.value for e in element_names]
            if any(i.value in str_element_names for i in if_names):
                for if_name in if_names:
                    definitions = context.inference_state.infer(context, if_name)
                    # Every name that has multiple different definitions
                    # causes the complexity to rise. The complexity should
                    # never fall below 1.
                    if len(definitions) > 1:
                        if len(name_dicts) * len(definitions) > 16:
                            debug.dbg('Too many options for if branch inference %s.', if_stmt)
                            # There's only a certain amount of branches
                            # Jedi can infer, otherwise it will take to
                            # long.
                            name_dicts = [{}]
                            break

                        original_name_dicts = list(name_dicts)
                        name_dicts = []
                        for definition in definitions:
                            new_name_dicts = list(original_name_dicts)
                            for i, name_dict in enumerate(new_name_dicts):
                                new_name_dicts[i] = name_dict.copy()
                                new_name_dicts[i][if_name.value] = ValueSet([definition])

                            name_dicts += new_name_dicts
                    else:
                        for name_dict in name_dicts:
                            name_dict[if_name.value] = definitions
        if len(name_dicts) > 1:
            result = NO_VALUES
            for name_dict in name_dicts:
                with context.predefine_names(if_stmt, name_dict):
                    result |= _infer_node(context, element)
            return result
        else:
            return _infer_node_if_inferred(context, element)
    else:
        if predefined_if_name_dict:
            return _infer_node(context, element)
        else:
            return _infer_node_if_inferred(context, element)


def _infer_node_if_inferred(context, element):
    """
    TODO This function is temporary: Merge with infer_node.
    """
    parent = element
    while parent is not None:
        parent = parent.parent
        predefined_if_name_dict = context.predefined_names.get(parent)
        if predefined_if_name_dict is not None:
            return _infer_node(context, element)
    return _infer_node_cached(context, element)


@inference_state_method_cache(default=NO_VALUES)
def _infer_node_cached(context, element):
    return _infer_node(context, element)


@debug.increase_indent
@_limit_value_infers
def _infer_node(context, element):
    debug.dbg('infer_node %s@%s in %s', element, element.start_pos, context)
    inference_state = context.inference_state
    typ = element.type
    if typ in ('name', 'number', 'string', 'atom', 'strings', 'keyword', 'fstring'):
        return infer_atom(context, element)
    elif typ == 'lambdef':
        return ValueSet([FunctionValue.from_context(context, element)])
    elif typ == 'expr_stmt':
        return infer_expr_stmt(context, element)
    elif typ in ('power', 'atom_expr'):
        first_child = element.children[0]
        children = element.children[1:]
        had_await = False
        if first_child.type == 'keyword' and first_child.value == 'await':
            had_await = True
            first_child = children.pop(0)

        value_set = context.infer_node(first_child)
        for (i, trailer) in enumerate(children):
            if trailer == '**':  # has a power operation.
                right = context.infer_node(children[i + 1])
                value_set = _infer_comparison(
                    context,
                    value_set,
                    trailer,
                    right
                )
                break
            value_set = infer_trailer(context, value_set, trailer)

        if had_await:
            return value_set.py__await__().py__stop_iteration_returns()
        return value_set
    elif typ in ('testlist_star_expr', 'testlist',):
        # The implicit tuple in statements.
        return ValueSet([iterable.SequenceLiteralValue(inference_state, context, element)])
    elif typ in ('not_test', 'factor'):
        value_set = context.infer_node(element.children[-1])
        for operator in element.children[:-1]:
            value_set = infer_factor(value_set, operator)
        return value_set
    elif typ == 'test':
        # `x if foo else y` case.
        return (context.infer_node(element.children[0])
                | context.infer_node(element.children[-1]))
    elif typ == 'operator':
        # Must be an ellipsis, other operators are not inferred.
        if element.value != '...':
            origin = element.parent
            raise AssertionError("unhandled operator %s in %s " % (repr(element.value), origin))
        return ValueSet([compiled.builtin_from_name(inference_state, 'Ellipsis')])
    elif typ == 'dotted_name':
        value_set = infer_atom(context, element.children[0])
        for next_name in element.children[2::2]:
            value_set = value_set.py__getattribute__(next_name, name_context=context)
        return value_set
    elif typ == 'eval_input':
        return context.infer_node(element.children[0])
    elif typ == 'annassign':
        return annotation.infer_annotation(context, element.children[1]) \
            .execute_annotation()
    elif typ == 'yield_expr':
        if len(element.children) and element.children[1].type == 'yield_arg':
            # Implies that it's a yield from.
            element = element.children[1].children[1]
            generators = context.infer_node(element) \
                .py__getattribute__('__iter__').execute_with_values()
            return generators.py__stop_iteration_returns()

        # Generator.send() is not implemented.
        return NO_VALUES
    elif typ == 'namedexpr_test':
        return context.infer_node(element.children[2])
    else:
        return infer_or_test(context, element)


def infer_trailer(context, atom_values, trailer):
    trailer_op, node = trailer.children[:2]
    if node == ')':  # `arglist` is optional.
        node = None

    if trailer_op == '[':
        trailer_op, node, _ = trailer.children
        return atom_values.get_item(
            _infer_subscript_list(context, node),
            ContextualizedNode(context, trailer)
        )
    else:
        debug.dbg('infer_trailer: %s in %s', trailer, atom_values)
        if trailer_op == '.':
            return atom_values.py__getattribute__(
                name_context=context,
                name_or_str=node
            )
        else:
            assert trailer_op == '(', 'trailer_op is actually %s' % trailer_op
            args = arguments.TreeArguments(context.inference_state, context, node, trailer)
            return atom_values.execute(args)


def infer_atom(context, atom):
    """
    Basically to process ``atom`` nodes. The parser sometimes doesn't
    generate the node (because it has just one child). In that case an atom
    might be a name or a literal as well.
    """
    state = context.inference_state
    if atom.type == 'name':
        # This is the first global lookup.
        stmt = tree.search_ancestor(atom, 'expr_stmt', 'lambdef', 'if_stmt') or atom
        if stmt.type == 'if_stmt':
            if not any(n.start_pos <= atom.start_pos < n.end_pos for n in stmt.get_test_nodes()):
                stmt = atom
        elif stmt.type == 'lambdef':
            stmt = atom
        position = stmt.start_pos
        if _is_annotation_name(atom):
            # Since Python 3.7 (with from __future__ import annotations),
            # annotations are essentially strings and can reference objects
            # that are defined further down in code. Therefore just set the
            # position to None, so the finder will not try to stop at a certain
            # position in the module.
            position = None
        return context.py__getattribute__(atom, position=position)
    elif atom.type == 'keyword':
        # For False/True/None
        if atom.value in ('False', 'True', 'None'):
            return ValueSet([compiled.builtin_from_name(state, atom.value)])
        elif atom.value == 'yield':
            # Contrary to yield from, yield can just appear alone to return a
            # value when used with `.send()`.
            return NO_VALUES
        assert False, 'Cannot infer the keyword %s' % atom

    elif isinstance(atom, tree.Literal):
        string = state.compiled_subprocess.safe_literal_eval(atom.value)
        return ValueSet([compiled.create_simple_object(state, string)])
    elif atom.type == 'strings':
        # Will be multiple string.
        value_set = infer_atom(context, atom.children[0])
        for string in atom.children[1:]:
            right = infer_atom(context, string)
            value_set = _infer_comparison(context, value_set, '+', right)
        return value_set
    elif atom.type == 'fstring':
        return compiled.get_string_value_set(state)
    else:
        c = atom.children
        # Parentheses without commas are not tuples.
        if c[0] == '(' and not len(c) == 2 \
                and not (c[1].type == 'testlist_comp'
                         and len(c[1].children) > 1):
            return context.infer_node(c[1])

        try:
            comp_for = c[1].children[1]
        except (IndexError, AttributeError):
            pass
        else:
            if comp_for == ':':
                # Dict comprehensions have a colon at the 3rd index.
                try:
                    comp_for = c[1].children[3]
                except IndexError:
                    pass

            if comp_for.type in ('comp_for', 'sync_comp_for'):
                return ValueSet([iterable.comprehension_from_atom(
                    state, context, atom
                )])

        # It's a dict/list/tuple literal.
        array_node = c[1]
        try:
            array_node_c = array_node.children
        except AttributeError:
            array_node_c = []
        if c[0] == '{' and (array_node == '}' or ':' in array_node_c
                            or '**' in array_node_c):
            new_value = iterable.DictLiteralValue(state, context, atom)
        else:
            new_value = iterable.SequenceLiteralValue(state, context, atom)
        return ValueSet([new_value])


@_limit_value_infers
def infer_expr_stmt(context, stmt, seek_name=None):
    with recursion.execution_allowed(context.inference_state, stmt) as allowed:
        if allowed:
            if seek_name is not None:
                pep0484_values = \
                    annotation.find_type_from_comment_hint_assign(context, stmt, seek_name)
                if pep0484_values:
                    return pep0484_values

            return _infer_expr_stmt(context, stmt, seek_name)
    return NO_VALUES


@debug.increase_indent
def _infer_expr_stmt(context, stmt, seek_name=None):
    """
    The starting point of the completion. A statement always owns a call
    list, which are the calls, that a statement does. In case multiple
    names are defined in the statement, `seek_name` returns the result for
    this name.

    expr_stmt: testlist_star_expr (annassign | augassign (yield_expr|testlist) |
                     ('=' (yield_expr|testlist_star_expr))*)
    annassign: ':' test ['=' test]
    augassign: ('+=' | '-=' | '*=' | '@=' | '/=' | '%=' | '&=' | '|=' | '^=' |
                '<<=' | '>>=' | '**=' | '//=')

    :param stmt: A `tree.ExprStmt`.
    """
    def check_setitem(stmt):
        atom_expr = stmt.children[0]
        if atom_expr.type not in ('atom_expr', 'power'):
            return False, None
        name = atom_expr.children[0]
        if name.type != 'name' or len(atom_expr.children) != 2:
            return False, None
        trailer = atom_expr.children[-1]
        return trailer.children[0] == '[', trailer.children[1]

    debug.dbg('infer_expr_stmt %s (%s)', stmt, seek_name)
    rhs = stmt.get_rhs()

    value_set = context.infer_node(rhs)

    if seek_name:
        n = TreeNameDefinition(context, seek_name)
        value_set = check_tuple_assignments(n, value_set)

    first_operator = next(stmt.yield_operators(), None)
    is_setitem, subscriptlist = check_setitem(stmt)
    is_annassign = first_operator not in ('=', None) and first_operator.type == 'operator'
    if is_annassign or is_setitem:
        # `=` is always the last character in aug assignments -> -1
        name = stmt.get_defined_names(include_setitem=True)[0].value
        left_values = context.py__getattribute__(name, position=stmt.start_pos)

        if is_setitem:
            def to_mod(v):
                c = ContextualizedSubscriptListNode(context, subscriptlist)
                if v.array_type == 'dict':
                    return DictModification(v, value_set, c)
                elif v.array_type == 'list':
                    return ListModification(v, value_set, c)
                return v

            value_set = ValueSet(to_mod(v) for v in left_values)
        else:
            operator = copy.copy(first_operator)
            operator.value = operator.value[:-1]
            for_stmt = tree.search_ancestor(stmt, 'for_stmt')
            if for_stmt is not None and for_stmt.type == 'for_stmt' and value_set \
                    and parser_utils.for_stmt_defines_one_name(for_stmt):
                # Iterate through result and add the values, that's possible
                # only in for loops without clutter, because they are
                # predictable. Also only do it, if the variable is not a tuple.
                node = for_stmt.get_testlist()
                cn = ContextualizedNode(context, node)
                ordered = list(cn.infer().iterate(cn))

                for lazy_value in ordered:
                    dct = {for_stmt.children[1].value: lazy_value.infer()}
                    with context.predefine_names(for_stmt, dct):
                        t = context.infer_node(rhs)
                        left_values = _infer_comparison(context, left_values, operator, t)
                value_set = left_values
            else:
                value_set = _infer_comparison(context, left_values, operator, value_set)
    debug.dbg('infer_expr_stmt result %s', value_set)
    return value_set


def infer_or_test(context, or_test):
    iterator = iter(or_test.children)
    types = context.infer_node(next(iterator))
    for operator in iterator:
        right = next(iterator)
        if operator.type == 'comp_op':  # not in / is not
            operator = ' '.join(c.value for c in operator.children)

        # handle type inference of and/or here.
        if operator in ('and', 'or'):
            left_bools = set(left.py__bool__() for left in types)
            if left_bools == {True}:
                if operator == 'and':
                    types = context.infer_node(right)
            elif left_bools == {False}:
                if operator != 'and':
                    types = context.infer_node(right)
            # Otherwise continue, because of uncertainty.
        else:
            types = _infer_comparison(context, types, operator,
                                      context.infer_node(right))
    debug.dbg('infer_or_test types %s', types)
    return types


@iterator_to_value_set
def infer_factor(value_set, operator):
    """
    Calculates `+`, `-`, `~` and `not` prefixes.
    """
    for value in value_set:
        if operator == '-':
            if is_number(value):
                yield value.negate()
        elif operator == 'not':
            b = value.py__bool__()
            if b is None:  # Uncertainty.
                yield list(value.inference_state.builtins_module.py__getattribute__('bool')
                           .execute_annotation()).pop()
            else:
                yield compiled.create_simple_object(value.inference_state, not b)
        else:
            yield value


def _literals_to_types(inference_state, result):
    # Changes literals ('a', 1, 1.0, etc) to its type instances (str(),
    # int(), float(), etc).
    new_result = NO_VALUES
    for typ in result:
        if is_literal(typ):
            # Literals are only valid as long as the operations are
            # correct. Otherwise add a value-free instance.
            cls = compiled.builtin_from_name(inference_state, typ.name.string_name)
            new_result |= cls.execute_with_values()
        else:
            new_result |= ValueSet([typ])
    return new_result


def _infer_comparison(context, left_values, operator, right_values):
    state = context.inference_state
    if isinstance(operator, str):
        operator_str = operator
    else:
        operator_str = str(operator.value)
    if not left_values or not right_values:
        # illegal slices e.g. cause left/right_result to be None
        result = (left_values or NO_VALUES) | (right_values or NO_VALUES)
        return _literals_to_types(state, result)
    elif operator_str == "|" and all(
        value.is_class() or value.is_compiled()
        for value in itertools.chain(left_values, right_values)
    ):
        # ^^^ A naive hack for PEP 604
        return ValueSet.from_sets((left_values, right_values))
    else:
        # I don't think there's a reasonable chance that a string
        # operation is still correct, once we pass something like six
        # objects.
        if len(left_values) * len(right_values) > 6:
            return _literals_to_types(state, left_values | right_values)
        else:
            return ValueSet.from_sets(
                _infer_comparison_part(state, context, left, operator, right)
                for left in left_values
                for right in right_values
            )


def _is_annotation_name(name):
    ancestor = tree.search_ancestor(name, 'param', 'funcdef', 'expr_stmt')
    if ancestor is None:
        return False

    if ancestor.type in ('param', 'funcdef'):
        ann = ancestor.annotation
        if ann is not None:
            return ann.start_pos <= name.start_pos < ann.end_pos
    elif ancestor.type == 'expr_stmt':
        c = ancestor.children
        if len(c) > 1 and c[1].type == 'annassign':
            return c[1].start_pos <= name.start_pos < c[1].end_pos
    return False


def _is_list(value):
    return value.array_type == 'list'


def _is_tuple(value):
    return value.array_type == 'tuple'


def _bool_to_value(inference_state, bool_):
    return compiled.builtin_from_name(inference_state, str(bool_))


def _get_tuple_ints(value):
    if not isinstance(value, iterable.SequenceLiteralValue):
        return None
    numbers = []
    for lazy_value in value.py__iter__():
        if not isinstance(lazy_value, LazyTreeValue):
            return None
        node = lazy_value.data
        if node.type != 'number':
            return None
        try:
            numbers.append(int(node.value))
        except ValueError:
            return None
    return numbers


def _infer_comparison_part(inference_state, context, left, operator, right):
    l_is_num = is_number(left)
    r_is_num = is_number(right)
    if isinstance(operator, str):
        str_operator = operator
    else:
        str_operator = str(operator.value)

    if str_operator == '*':
        # for iterables, ignore * operations
        if isinstance(left, iterable.Sequence) or is_string(left):
            return ValueSet([left])
        elif isinstance(right, iterable.Sequence) or is_string(right):
            return ValueSet([right])
    elif str_operator == '+':
        if l_is_num and r_is_num or is_string(left) and is_string(right):
            return left.execute_operation(right, str_operator)
        elif _is_list(left) and _is_list(right) or _is_tuple(left) and _is_tuple(right):
            return ValueSet([iterable.MergedArray(inference_state, (left, right))])
    elif str_operator == '-':
        if l_is_num and r_is_num:
            return left.execute_operation(right, str_operator)
    elif str_operator == '%':
        # With strings and numbers the left type typically remains. Except for
        # `int() % float()`.
        return ValueSet([left])
    elif str_operator in COMPARISON_OPERATORS:
        if left.is_compiled() and right.is_compiled():
            # Possible, because the return is not an option. Just compare.
            result = left.execute_operation(right, str_operator)
            if result:
                return result
        else:
            if str_operator in ('is', '!=', '==', 'is not'):
                operation = COMPARISON_OPERATORS[str_operator]
                bool_ = operation(left, right)
                # Only if == returns True or != returns False, we can continue.
                # There's no guarantee that they are not equal. This can help
                # in some cases, but does not cover everything.
                if (str_operator in ('is', '==')) == bool_:
                    return ValueSet([_bool_to_value(inference_state, bool_)])

            if isinstance(left, VersionInfo):
                version_info = _get_tuple_ints(right)
                if version_info is not None:
                    bool_result = compiled.access.COMPARISON_OPERATORS[operator](
                        inference_state.environment.version_info,
                        tuple(version_info)
                    )
                    return ValueSet([_bool_to_value(inference_state, bool_result)])

        return ValueSet([
            _bool_to_value(inference_state, True),
            _bool_to_value(inference_state, False)
        ])
    elif str_operator in ('in', 'not in'):
        return inference_state.builtins_module.py__getattribute__('bool').execute_annotation()

    def check(obj):
        """Checks if a Jedi object is either a float or an int."""
        return isinstance(obj, TreeInstance) and \
            obj.name.string_name in ('int', 'float')

    # Static analysis, one is a number, the other one is not.
    if str_operator in ('+', '-') and l_is_num != r_is_num \
            and not (check(left) or check(right)):
        message = "TypeError: unsupported operand type(s) for +: %s and %s"
        analysis.add(context, 'type-error-operation', operator,
                     message % (left, right))

    if left.is_class() or right.is_class():
        return NO_VALUES

    method_name = operator_to_magic_method[str_operator]
    magic_methods = left.py__getattribute__(method_name)
    if magic_methods:
        result = magic_methods.execute_with_values(right)
        if result:
            return result

    if not magic_methods:
        reverse_method_name = reverse_operator_to_magic_method[str_operator]
        magic_methods = right.py__getattribute__(reverse_method_name)

        result = magic_methods.execute_with_values(left)
        if result:
            return result

    result = ValueSet([left, right])
    debug.dbg('Used operator %s resulting in %s', operator, result)
    return result


@plugin_manager.decorate()
def tree_name_to_values(inference_state, context, tree_name):
    value_set = NO_VALUES
    module_node = context.get_root_context().tree_node
    # First check for annotations, like: `foo: int = 3`
    if module_node is not None:
        names = module_node.get_used_names().get(tree_name.value, [])
        found_annotation = False
        for name in names:
            expr_stmt = name.parent

            if expr_stmt.type == "expr_stmt" and expr_stmt.children[1].type == "annassign":
                correct_scope = parser_utils.get_parent_scope(name) == context.tree_node
                ann_assign = expr_stmt.children[1]
                if correct_scope:
                    found_annotation = True
                    if (
                        (ann_assign.children[1].type == 'name')
                        and (ann_assign.children[1].value == tree_name.value)
                        and context.parent_context
                    ):
                        context = context.parent_context
                    value_set |= annotation.infer_annotation(
                        context, expr_stmt.children[1].children[1]
                    ).execute_annotation()
        if found_annotation:
            return value_set

    types = []
    node = tree_name.get_definition(import_name_always=True, include_setitem=True)
    if node is None:
        node = tree_name.parent
        if node.type == 'global_stmt':
            c = context.create_context(tree_name)
            if c.is_module():
                # In case we are already part of the module, there is no point
                # in looking up the global statement anymore, because it's not
                # valid at that point anyway.
                return NO_VALUES
            # For global_stmt lookups, we only need the first possible scope,
            # which means the function itself.
            filter = next(c.get_filters())
            names = filter.get(tree_name.value)
            return ValueSet.from_sets(name.infer() for name in names)
        elif node.type not in ('import_from', 'import_name'):
            c = context.create_context(tree_name)
            return infer_atom(c, tree_name)

    typ = node.type
    if typ == 'for_stmt':
        types = annotation.find_type_from_comment_hint_for(context, node, tree_name)
        if types:
            return types
    if typ == 'with_stmt':
        types = annotation.find_type_from_comment_hint_with(context, node, tree_name)
        if types:
            return types

    if typ in ('for_stmt', 'comp_for', 'sync_comp_for'):
        try:
            types = context.predefined_names[node][tree_name.value]
        except KeyError:
            cn = ContextualizedNode(context, node.children[3])
            for_types = iterate_values(
                cn.infer(),
                contextualized_node=cn,
                is_async=node.parent.type == 'async_stmt',
            )
            n = TreeNameDefinition(context, tree_name)
            types = check_tuple_assignments(n, for_types)
    elif typ == 'expr_stmt':
        types = infer_expr_stmt(context, node, tree_name)
    elif typ == 'with_stmt':
        value_managers = context.infer_node(node.get_test_node_from_name(tree_name))
        if node.parent.type == 'async_stmt':
            # In the case of `async with` statements, we need to
            # first get the coroutine from the `__aenter__` method,
            # then "unwrap" via the `__await__` method
            enter_methods = value_managers.py__getattribute__('__aenter__')
            coro = enter_methods.execute_with_values()
            return coro.py__await__().py__stop_iteration_returns()
        enter_methods = value_managers.py__getattribute__('__enter__')
        return enter_methods.execute_with_values()
    elif typ in ('import_from', 'import_name'):
        types = imports.infer_import(context, tree_name)
    elif typ in ('funcdef', 'classdef'):
        types = _apply_decorators(context, node)
    elif typ == 'try_stmt':
        # TODO an exception can also be a tuple. Check for those.
        # TODO check for types that are not classes and add it to
        # the static analysis report.
        exceptions = context.infer_node(tree_name.get_previous_sibling().get_previous_sibling())
        types = exceptions.execute_with_values()
    elif typ == 'param':
        types = NO_VALUES
    elif typ == 'del_stmt':
        types = NO_VALUES
    elif typ == 'namedexpr_test':
        types = infer_node(context, node)
    else:
        raise ValueError("Should not happen. type: %s" % typ)
    return types


# We don't want to have functions/classes that are created by the same
# tree_node.
@inference_state_method_cache()
def _apply_decorators(context, node):
    """
    Returns the function, that should to be executed in the end.
    This is also the places where the decorators are processed.
    """
    if node.type == 'classdef':
        decoratee_value = ClassValue(
            context.inference_state,
            parent_context=context,
            tree_node=node
        )
    else:
        decoratee_value = FunctionValue.from_context(context, node)
    initial = values = ValueSet([decoratee_value])

    if is_big_annoying_library(context):
        return values

    for dec in reversed(node.get_decorators()):
        debug.dbg('decorator: %s %s', dec, values, color="MAGENTA")
        with debug.increase_indent_cm():
            dec_values = context.infer_node(dec.children[1])
            trailer_nodes = dec.children[2:-1]
            if trailer_nodes:
                # Create a trailer and infer it.
                trailer = tree.PythonNode('trailer', trailer_nodes)
                trailer.parent = dec
                dec_values = infer_trailer(context, dec_values, trailer)

            if not len(dec_values):
                code = dec.get_code(include_prefix=False)
                # For the short future, we don't want to hear about the runtime
                # decorator in typing that was intentionally omitted. This is not
                # "correct", but helps with debugging.
                if code != '@runtime\n':
                    debug.warning('decorator not found: %s on %s', dec, node)
                return initial

            values = dec_values.execute(arguments.ValuesArguments([values]))
            if not len(values):
                debug.warning('not possible to resolve wrappers found %s', node)
                return initial

        debug.dbg('decorator end %s', values, color="MAGENTA")
    if values != initial:
        return ValueSet([Decoratee(c, decoratee_value) for c in values])
    return values


def check_tuple_assignments(name, value_set):
    """
    Checks if tuples are assigned.
    """
    lazy_value = None
    for index, node in name.assignment_indexes():
        cn = ContextualizedNode(name.parent_context, node)
        iterated = value_set.iterate(cn)
        if isinstance(index, slice):
            # For no star unpacking is not possible.
            return NO_VALUES
        i = 0
        while i <= index:
            try:
                lazy_value = next(iterated)
            except StopIteration:
                # We could do this with the default param in next. But this
                # would allow this loop to run for a very long time if the
                # index number is high. Therefore break if the loop is
                # finished.
                return NO_VALUES
            else:
                i += lazy_value.max
        value_set = lazy_value.infer()
    return value_set


class ContextualizedSubscriptListNode(ContextualizedNode):
    def infer(self):
        return _infer_subscript_list(self.context, self.node)


def _infer_subscript_list(context, index):
    """
    Handles slices in subscript nodes.
    """
    if index == ':':
        # Like array[:]
        return ValueSet([iterable.Slice(context, None, None, None)])

    elif index.type == 'subscript' and not index.children[0] == '.':
        # subscript basically implies a slice operation
        # e.g. array[:3]
        result = []
        for el in index.children:
            if el == ':':
                if not result:
                    result.append(None)
            elif el.type == 'sliceop':
                if len(el.children) == 2:
                    result.append(el.children[1])
            else:
                result.append(el)
        result += [None] * (3 - len(result))

        return ValueSet([iterable.Slice(context, *result)])
    elif index.type == 'subscriptlist':
        return ValueSet([iterable.SequenceLiteralValue(context.inference_state, context, index)])

    # No slices
    return context.infer_node(index)
