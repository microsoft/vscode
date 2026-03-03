"""Shared utilities for visualizer composition in Sculpt-n-Code."""

import ast
import html
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Tuple


# =============================================================================
# Caret (^) utilities
# =============================================================================

# ^ is a rare python infix operator, generally invalid in variable position.
# replace only ^ that are in variable position (not in strings, etc)
# does this by replace-and-check one by one to see if parse succeeds with the ^ retained
ONE_CARET_RE = re.compile(r'(?<!\^)\^(?!\^)')

def replace_caret_in_py_exp(py_exp: str, replace_exp) -> str:
    temp_names = []
    def temp_replacer(m):
        temp_name = f'_caret_{len(temp_names)}_'
        temp_names.append(temp_name)
        return temp_name
    out = ONE_CARET_RE.sub(temp_replacer, py_exp)

    for name in temp_names:
        try:
            temp_str = out.replace(name, '^')
            ast.parse(temp_str)
            out = temp_str
        except SyntaxError:
            out = out.replace(name, replace_exp)

    return out


def strip_leading_caret(name: str) -> str:
    """Remove a single leading ^ for display purposes."""
    if name.startswith('^'):
        return name[1:]
    return name


def eval_caret_expr(field_expr: str, value, eval_in_scope=None, source_expr=None):
    """Evaluate a ^-prefixed field expression against a value.

    When both eval_in_scope and source_expr are provided, evaluates via
    the user's code scope (giving access to user-defined variables).
    Otherwise falls back to local eval with the value bound directly.
    """
    if eval_in_scope is not None and source_expr is not None:
        resolved = replace_caret_in_py_exp(field_expr, source_expr)
        return eval_in_scope(resolved)
    _v = value
    return eval(replace_caret_in_py_exp(field_expr, '_v'))


@dataclass(frozen=True, slots=True)
class ChildEvent:
    """Envelope wrapping a child visualizer's event for parent routing."""
    child_key: str
    py_ev_str: str

def wrap_child_prefix(child_key: str) -> str:
    return f'<span snc-child-key="{html.escape(repr(child_key))}">'

wrap_child_suffix = '</span>'

def wrap_child_html(child_html: str, child_key: str) -> str:
    """Wrap child HTML in a span whose snc-child-key attribute holds repr(child_key).

    The TypeScript frontend reads this attribute at event-dispatch time and
    wraps the pythonEventStr in a envelope: ChildEvent(child_key, pythonEventStr).
    """
    return f"{wrap_child_prefix(child_key)}{child_html}{wrap_child_suffix}"


def route_child_event(
    event: dict,
    model: dict,
    value: Any,
    child_value_getter: Callable[[str], Any],
    get_visualizer: Callable[[Any], Any],
    source_code: str = '',
    source_line: int = 0,
    eval_in_scope=None,
    child_source_expr_getter: Callable[[str], str] | None = None,
) -> Tuple[dict, List[Any]]:
    """Unwrap a ChildEvent and dispatch to the appropriate child visualizer.

    Args:
        event: The raw event dict with pythonEventStr and eventJSON.
        model: Parent model (must have 'children' dict).
        value: The parent's value (e.g. the list or object).
        child_value_getter: Maps child_key -> child value.
        get_visualizer: The standard visualizer resolver.
        source_code: Source code context for the child update.
        source_line: Source line context for the child update.
        eval_in_scope: Evaluator for the user's code scope.
        child_source_expr_getter: Maps child_key -> source_expr string for
            the child.  Each parent provides its own implementation because
            the key format differs (e.g. composite table keys vs plain caret
            expressions).

    Returns:
        (updated_model, commands) with the child's model stored back.
    """
    try:
        make_python_event = eval(event['pythonEventStr'])
    except Exception as e:
        return (model, [])

    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    if not isinstance(msg, ChildEvent):
        return (model, [])

    child_key = msg.child_key
    child_value = child_value_getter(child_key)
    child_vis = get_visualizer(child_value)
    child_source_expr = child_source_expr_getter(child_key) if child_source_expr_getter else None

    children = model.get('children', {})
    child_model = children.get(child_key)
    if child_model is None:
        child_model = child_vis.init_model(child_value, get_visualizer,
                                           eval_in_scope=eval_in_scope, source_expr=child_source_expr)

    inner_event = {'pythonEventStr': msg.py_ev_str, 'eventJSON': event_json}
    new_child_model, commands = child_vis.update(
        inner_event, source_code, source_line, child_model, child_value, get_visualizer,
        eval_in_scope=eval_in_scope, source_expr=child_source_expr,
    )

    children[child_key] = new_child_model
    model['children'] = children
    model['focused_child'] = child_key
    return (model, commands)


def aggregate_handled_keys(
    children_models: Dict[str, Any],
    own_keys: List[str] | None = None,
) -> List[str]:
    """Compute the union of handledKeys from all child models plus parent's own keys.

    Only reads one level deep; nested keys propagate because each child already aggregates its own descendants.
    """
    seen = set()
    result: List[str] = []

    for key in (own_keys or []):
        if key not in seen:
            seen.add(key)
            result.append(key)

    for child_model in children_models.values():
        if not isinstance(child_model, dict):
            continue
        for key in child_model.get('handledKeys', []):
            if key not in seen:
                seen.add(key)
                result.append(key)

    return result
