"""List visualizer for Sculpt-n-Code."""

import html
import random
from math import sqrt
from typing import Any, List, Tuple

from visualizer_utils import wrap_child_html, route_child_event, aggregate_handled_keys, wrap_child_prefix, wrap_child_suffix

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
GRAY = "#808080"

CELL_KEY_SEP = '\x00'


def can_visualize(value):
    return isinstance(value, list)


def get_fields(value):
    return [str(i) for i in range(len(value))]


def get_field_value(value, field):
    return value[int(field)]


def _detect_table_columns(lst, get_visualizer):
    """Sample items and return union of fields if all sampled items are tabular, else None."""
    if len(lst) == 0:
        return None

    sample_indices = set()
    sample_indices.add(0)
    sample_indices.add(len(lst) - 1)
    if len(lst) > 2:
        middle = list(range(1, len(lst) - 1))
        sample_indices.update(random.sample(middle, min(10, len(middle))))

    columns = []
    seen = set()

    for idx in sorted(sample_indices):
        vis = get_visualizer(lst[idx])
        item_get_fields = getattr(vis, 'get_fields', None)
        if item_get_fields is None:
            return None
        fields = item_get_fields(lst[idx])
        if fields is None:
            return None
        for f in fields:
            if f not in seen:
                seen.add(f)
                columns.append(f)

    return columns


def init_model(lst, get_visualizer=None):
    if get_visualizer is None:
        return {'children': {}, 'handledKeys': [], 'display_mode': 'list', 'columns': []}

    columns = _detect_table_columns(lst, get_visualizer)

    if columns is not None:
        children = {}
        for i, item in enumerate(lst):
            vis = get_visualizer(item)
            item_get_field_value = getattr(vis, 'get_field_value', None)
            for col in columns:
                try:
                    cell_value = item_get_field_value(item, col) if item_get_field_value else None
                except Exception:
                    cell_value = None
                if cell_value is not None:
                    cell_vis = get_visualizer(cell_value)
                    children[f"{i}{CELL_KEY_SEP}{col}"] = cell_vis.init_model(cell_value, get_visualizer)

        handled_keys = aggregate_handled_keys(children)
        return {
            'children': children,
            'handledKeys': handled_keys,
            'display_mode': 'table',
            'columns': columns,
        }

    children = {}
    for i, item in enumerate(lst):
        vis = get_visualizer(item)
        children[str(i)] = vis.init_model(item, get_visualizer)

    handled_keys = aggregate_handled_keys(children)
    return {'children': children, 'handledKeys': handled_keys, 'display_mode': 'list', 'columns': []}


def _visualize_table(lst, model, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False):
    children = model.get('children', {})
    columns = model.get('columns', [])
    focused_child = model.get('focused_child')

    max_column_width = round(800 / sqrt(len(columns)))

    strs = ['<table style="border-collapse:collapse;font-family:monospace;"><tr><th style="padding:0 8px;"></th>']
    for col in columns:
        strs.append('<th style="padding:0 8px;color:')
        strs.append(BLUE)
        strs.append(';text-align:left;">')
        strs.append(html.escape(col))
        strs.append('</th>')
    strs.append('</tr>')

    for i, item in enumerate(lst):
        vis = get_visualizer(item)
        item_get_field_value = getattr(vis, 'get_field_value', None)

        strs.append('<tr><td style="color:')
        strs.append(GRAY)
        strs.append(';padding:0 8px;text-align:right;">')
        strs.append(str(i))
        strs.append('</td>')

        for col in columns:
            composite_key = f"{i}{CELL_KEY_SEP}{col}"
            try:
                cell_value = item_get_field_value(item, col) if item_get_field_value else None
            except Exception:
                cell_value = None

            if cell_value is not None:
                cell_vis = get_visualizer(cell_value)
                cell_model = children.get(composite_key)
                if cell_model is None:
                    cell_model = cell_vis.init_model(cell_value, get_visualizer)
                child_small = (composite_key != focused_child)
                if hasattr(cell_vis, 'visualize_els'):
                    cell_htmls = cell_vis.visualize_els(cell_value, cell_model, get_visualizer, eval_in_scope, max_width=max_column_width, max_height=80, small=child_small)
                else:
                    cell_htmls = [cell_vis.visualize(cell_value, cell_model, get_visualizer, eval_in_scope, max_width=max_column_width, max_height=80, small=child_small)]
                strs.append('<td style="padding:0 8px;">')
                strs.append(wrap_child_prefix(composite_key))
                strs.extend(cell_htmls)
                strs.append(wrap_child_suffix)
                strs.append('</td>')
            else:
                strs.append('<td style="padding:0 8px;"></td>')

        strs.append('</tr>')

    strs.append('</table>')
    return ''.join(strs)


def visualize(lst: list, model: dict, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False):
    if model.get('display_mode') == 'table':
        return _visualize_table(lst, model, get_visualizer, eval_in_scope, max_width=max_width, max_height=max_height, small=small)

    children = model.get('children', {})
    focused_child = model.get('focused_child')
    items_html_parts = []

    for i, item in enumerate(lst):
        key = str(i)
        vis = get_visualizer(item)
        child_model = children.get(key)
        if child_model is None:
            child_model = vis.init_model(item, get_visualizer)
        child_small = (key != focused_child)
        child_html = vis.visualize(item, child_model, get_visualizer, eval_in_scope, small=child_small)
        items_html_parts.append(wrap_child_html(child_html, key))

    items_html = '\n'.join(items_html_parts)
    return f'[{items_html}]'


def _table_child_value_getter(key, lst, get_visualizer):
    row_key, field_key = key.split(CELL_KEY_SEP, 1)
    item = lst[int(row_key)]
    vis = get_visualizer(item)
    item_get_field_value = getattr(vis, 'get_field_value', None)
    if item_get_field_value is None:
        return None
    return item_get_field_value(item, field_key)


def update(event, source_code: str, source_line: int, model: Any, value, get_visualizer=None) -> Tuple[Any, List[Any]]:
    if event is None or not isinstance(event, dict) or not event.get('pythonEventStr'):
        return (model, [])

    if model is None:
        model = {'children': {}, 'handledKeys': [], 'display_mode': 'list', 'columns': []}

    is_table = model.get('display_mode') == 'table'

    if is_table:
        child_value_getter = lambda key: _table_child_value_getter(key, value, get_visualizer)
    else:
        child_value_getter = lambda key: value[int(key)]

    new_model, commands = route_child_event(
        event, model, value,
        child_value_getter=child_value_getter,
        get_visualizer=get_visualizer,
        source_code=source_code,
        source_line=source_line,
    )

    new_model['handledKeys'] = aggregate_handled_keys(new_model.get('children', {}))
    return (new_model, commands)
