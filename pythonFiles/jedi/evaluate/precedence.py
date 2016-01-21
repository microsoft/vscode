"""
Handles operator precedence.
"""
import operator

from jedi._compatibility import unicode
from jedi.parser import tree
from jedi import debug
from jedi.evaluate.compiled import (CompiledObject, create, builtin,
                                    keyword_from_value, true_obj, false_obj)
from jedi.evaluate import analysis

# Maps Python syntax to the operator module.
COMPARISON_OPERATORS = {
    '==': operator.eq,
    '!=': operator.ne,
    'is': operator.is_,
    'is not': operator.is_not,
    '<': operator.lt,
    '<=': operator.le,
    '>': operator.gt,
    '>=': operator.ge,
}


def _literals_to_types(evaluator, result):
    # Changes literals ('a', 1, 1.0, etc) to its type instances (str(),
    # int(), float(), etc).
    for i, r in enumerate(result):
        if is_literal(r):
            # Literals are only valid as long as the operations are
            # correct. Otherwise add a value-free instance.
            cls = builtin.get_by_name(r.name.get_code())
            result[i] = evaluator.execute(cls)[0]
    return list(set(result))


def calculate_children(evaluator, children):
    """
    Calculate a list of children with operators.
    """
    iterator = iter(children)
    types = evaluator.eval_element(next(iterator))
    for operator in iterator:
        right = next(iterator)
        if tree.is_node(operator, 'comp_op'):  # not in / is not
            operator = ' '.join(str(c.value) for c in operator.children)

        # handle lazy evaluation of and/or here.
        if operator in ('and', 'or'):
            left_bools = set([left.py__bool__() for left in types])
            if left_bools == set([True]):
                if operator == 'and':
                    types = evaluator.eval_element(right)
            elif left_bools == set([False]):
                if operator != 'and':
                    types = evaluator.eval_element(right)
            # Otherwise continue, because of uncertainty.
        else:
            types = calculate(evaluator, types, operator,
                              evaluator.eval_element(right))
    debug.dbg('calculate_children types %s', types)
    return types


def calculate(evaluator, left_result, operator, right_result):
    result = []
    if not left_result or not right_result:
        # illegal slices e.g. cause left/right_result to be None
        result = (left_result or []) + (right_result or [])
        result = _literals_to_types(evaluator, result)
    else:
        # I don't think there's a reasonable chance that a string
        # operation is still correct, once we pass something like six
        # objects.
        if len(left_result) * len(right_result) > 6:
            result = _literals_to_types(evaluator, left_result + right_result)
        else:
            for left in left_result:
                for right in right_result:
                    result += _element_calculate(evaluator, left, operator, right)
    return result


def factor_calculate(evaluator, types, operator):
    """
    Calculates `+`, `-`, `~` and `not` prefixes.
    """
    for typ in types:
        if operator == '-':
            if _is_number(typ):
                yield create(evaluator, -typ.obj)
        elif operator == 'not':
            value = typ.py__bool__()
            if value is None:  # Uncertainty.
                return
            yield keyword_from_value(not value)
        else:
            yield typ


def _is_number(obj):
    return isinstance(obj, CompiledObject) \
        and isinstance(obj.obj, (int, float))


def is_string(obj):
    return isinstance(obj, CompiledObject) \
        and isinstance(obj.obj, (str, unicode))


def is_literal(obj):
    return _is_number(obj) or is_string(obj)


def _is_tuple(obj):
    from jedi.evaluate import iterable
    return isinstance(obj, iterable.Array) and obj.type == 'tuple'


def _is_list(obj):
    from jedi.evaluate import iterable
    return isinstance(obj, iterable.Array) and obj.type == 'list'


def _element_calculate(evaluator, left, operator, right):
    from jedi.evaluate import iterable, representation as er
    l_is_num = _is_number(left)
    r_is_num = _is_number(right)
    if operator == '*':
        # for iterables, ignore * operations
        if isinstance(left, iterable.Array) or is_string(left):
            return [left]
        elif isinstance(right, iterable.Array) or is_string(right):
            return [right]
    elif operator == '+':
        if l_is_num and r_is_num or is_string(left) and is_string(right):
            return [create(evaluator, left.obj + right.obj)]
        elif _is_tuple(left) and _is_tuple(right) or _is_list(left) and _is_list(right):
            return [iterable.MergedArray(evaluator, (left, right))]
    elif operator == '-':
        if l_is_num and r_is_num:
            return [create(evaluator, left.obj - right.obj)]
    elif operator == '%':
        # With strings and numbers the left type typically remains. Except for
        # `int() % float()`.
        return [left]
    elif operator in COMPARISON_OPERATORS:
        operation = COMPARISON_OPERATORS[operator]
        if isinstance(left, CompiledObject) and isinstance(right, CompiledObject):
            # Possible, because the return is not an option. Just compare.
            left = left.obj
            right = right.obj

        try:
            return [keyword_from_value(operation(left, right))]
        except TypeError:
            # Could be True or False.
            return [true_obj, false_obj]
    elif operator == 'in':
        return []

    def check(obj):
        """Checks if a Jedi object is either a float or an int."""
        return isinstance(obj, er.Instance) and obj.name.get_code() in ('int', 'float')

    # Static analysis, one is a number, the other one is not.
    if operator in ('+', '-') and l_is_num != r_is_num \
            and not (check(left) or check(right)):
        message = "TypeError: unsupported operand type(s) for +: %s and %s"
        analysis.add(evaluator, 'type-error-operation', operator,
                     message % (left, right))

    return [left, right]
