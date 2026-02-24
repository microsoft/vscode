"""List visualizer for Sculpt-n-Code."""

import html
from typing import Any, Callable, List, Tuple

from visualizer_utils import ChildEvent, wrap_child_html, route_child_event, aggregate_handled_keys

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
GRAY = "#808080"


def can_visualize(value):
    return isinstance(value, list)


def init_model(lst, get_visualizer=None):
    if get_visualizer is None:
        return {'children': {}, 'handledKeys': []}

    children = {}
    for i, item in enumerate(lst):
        vis = get_visualizer(item)
        children[str(i)] = vis.init_model(item, get_visualizer)

    handled_keys = aggregate_handled_keys(children)
    return {'children': children, 'handledKeys': handled_keys}


def visualize(lst: list, model: dict, get_visualizer):
    children = model.get('children', {})
    items_html_parts = []

    for i, item in enumerate(lst):
        key = str(i)
        vis = get_visualizer(item)
        child_model = children.get(key)
        if child_model is None:
            child_model = vis.init_model(item, get_visualizer)
        child_html = vis.visualize(item, child_model, get_visualizer)
        items_html_parts.append(wrap_child_html(child_html, key))

    items_html = '\n'.join(items_html_parts)
    return f'[{items_html}]'


def update(event, source_code: str, source_line: int, model: Any, value, get_visualizer=None) -> Tuple[Any, List[Any]]:
    if event is None or not isinstance(event, dict) or not event.get('pythonEventStr'):
        return (model, [])

    if model is None:
        model = {'children': {}, 'handledKeys': []}

    new_model, commands = route_child_event(
        event, model, value,
        child_value_getter=lambda key: value[int(key)],
        get_visualizer=get_visualizer,
        source_code=source_code,
        source_line=source_line,
    )

    new_model['handledKeys'] = aggregate_handled_keys(new_model.get('children', {}))
    return (new_model, commands)
