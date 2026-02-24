"""List visualizer for Sculpt-n-Code."""

import html
import random
from typing import Any, Callable, List, Tuple

from visualizer_utils import ChildEvent, wrap_child_html, route_child_event, aggregate_handled_keys

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


def _visualize_table(lst, model, get_visualizer):
    children = model.get('children', {})
    columns = model.get('columns', [])

    header_cells = [f'<th style="padding:0 8px;"></th>', *[f'<th style="padding:0 8px;color:{BLUE};text-align:left;">{html.escape(col)}</th>' for col in columns]]
    header_row = f'<tr>{"".join(header_cells)}</tr>'

    body_rows = []
    for i, item in enumerate(lst):
        vis = get_visualizer(item)
        item_get_field_value = getattr(vis, 'get_field_value', None)

        row_cells = [f'<td style="color:{GRAY};padding:0 8px;text-align:right;">{i}</td>']
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
                cell_html = cell_vis.visualize(cell_value, cell_model, get_visualizer)
                wrapped = wrap_child_html(cell_html, composite_key)
                row_cells.append(f'<td style="padding:0 8px;">{wrapped}</td>')
            else:
                row_cells.append(f'<td style="padding:0 8px;"></td>')

        body_rows.append(f'<tr>{"".join(row_cells)}</tr>')

    return (
        f'<table style="border-collapse:collapse;font-family:monospace;">'
        f'{header_row}'
        f'{"".join(body_rows)}'
        f'</table>'
    )


def visualize(lst: list, model: dict, get_visualizer):
    if model.get('display_mode') == 'table':
        return _visualize_table(lst, model, get_visualizer)

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
