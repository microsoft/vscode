"""Shared utilities for visualizer composition in Sculpt-n-Code."""

import html
import re as re_module
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Tuple


@dataclass(frozen=True, slots=True)
class ChildEvent:
    """Envelope wrapping a child visualizer's event for parent routing."""
    child_key: str
    py_ev_str: str


_SNC_ATTR_RE = re_module.compile(
    r'\b(snc-(?:mouse-down|mouse-move|mouse-up|key-down|input))="([^"]*)"'
)


def wrap_child_html(child_html: str, child_key: str) -> str:
    """Rewrite snc-* attributes in child HTML to wrap values in ChildEvent envelopes.

    For each snc-* attribute found:
      1. HTML-unescape the attribute value to recover the raw Python expression.
      2. Wrap it: ChildEvent(child_key=<repr>, py_ev_str=<repr>)
      3. HTML-escape the wrapped string and substitute back.

    This allows the parent visualizer's update() to receive a ChildEvent
    that it can dispatch to the correct child.
    """
    def _replacer(match: re_module.Match) -> str:
        attr_name = match.group(1)
        original_escaped = match.group(2)
        original = html.unescape(original_escaped)
        wrapped = f"ChildEvent({child_key!r}, {original!r})"
        return f'{attr_name}="{html.escape(wrapped)}"'

    return _SNC_ATTR_RE.sub(_replacer, child_html)


def route_child_event(
    event: dict,
    model: dict,
    value: Any,
    child_value_getter: Callable[[str], Any],
    get_visualizer: Callable[[Any], Any],
    source_code: str = '',
    source_line: int = 0,
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

    Returns:
        (updated_model, commands) with the child's model stored back.
    """
    make_python_event = eval(event['pythonEventStr'])
    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    if not isinstance(msg, ChildEvent):
        return (model, [])

    child_key = msg.child_key
    child_value = child_value_getter(child_key)
    child_vis = get_visualizer(child_value)

    children = model.get('children', {})
    child_model = children.get(child_key)
    if child_model is None:
        child_model = child_vis.init_model(child_value, get_visualizer)

    inner_event = {'pythonEventStr': msg.py_ev_str, 'eventJSON': event_json}
    new_child_model, commands = child_vis.update(
        inner_event, source_code, source_line, child_model, child_value, get_visualizer
    )

    children[child_key] = new_child_model
    model['children'] = children
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
