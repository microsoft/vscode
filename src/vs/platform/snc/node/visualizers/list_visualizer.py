"""List visualizer for Sculpt-n-Code.

================================================================================
ARCHITECTURE OVERVIEW
================================================================================

This visualizer follows the Elm architecture with three core functions:

1. visualize(value, model) -> HTML string
   - Renders lists either as inline items or as a table with configurable columns
   - In table mode, shows column management controls (add, edit, remove, reorder)

2. init_model(value) -> dict
   - Returns the initial model state
   - Detects table mode for homogeneous lists with field-bearing items
   - Loads saved column configuration from dotfile

3. update(event, source_code, source_line, model, value) -> (new_model, commands)
   - Processes UI events (click, input, keyboard, drag) and returns updated model
   - Routes child events to cell visualizers
   - Handles column management events in table mode

================================================================================
COLUMN CONFIGURATION (table mode)
================================================================================

Columns shown in the table are configurable and persisted:

1. DOTFILE (.snc_list_columns.json in working directory):
   - JSON mapping {item_type_key: [column_name, ...]}
   - Highest priority: user-customized columns

2. Auto-detection via _detect_table_columns:
   - Samples items and returns union of fields if all support get_fields
   - Fallback when type not in dotfile
================================================================================
"""

import html
import json
import os
import random
from dataclasses import dataclass
from math import sqrt
from typing import Any, List, Tuple

from visualizer_utils import ChildEvent, wrap_child_html, route_child_event, aggregate_handled_keys, wrap_child_prefix, wrap_child_suffix, replace_caret_in_py_exp, strip_leading_caret, eval_caret_expr

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
GRAY = "#808080"
GRAY_HALF_ALPHA = "rgba(128,128,128,0.5)"
INPUT_BG = "#1e1e1e"
INPUT_BORDER = "#3c3c3c"
SUGGESTION_BG = "#252526"

CELL_KEY_SEP = '\x00'

# === Event types ===

@dataclass(frozen=True, slots=True)
class AddColumnClick:
    """User clicked the (+) button to add a new column."""
    pass

@dataclass(frozen=True, slots=True)
class ColumnInput:
    """User typed in the column name input (add or edit mode)."""
    value: str

@dataclass(frozen=True, slots=True)
class ColumnSelect:
    """User clicked an autocomplete suggestion for a column."""
    name: str

@dataclass(frozen=True, slots=True)
class ColumnClick:
    """User clicked on an existing column header (double-click to edit)."""
    index: int

@dataclass(frozen=True, slots=True)
class RemoveColumnClick:
    """User clicked the (x) button to remove a column."""
    index: int

@dataclass(frozen=True, slots=True)
class ColumnDragStart:
    """User pressed mouse down on a column drag handle to start reordering."""
    index: int

@dataclass(frozen=True, slots=True)
class ColumnDragOver:
    """Mouse moved over a column header while dragging (reorder target)."""
    index: int

@dataclass(frozen=True, slots=True)
class ColumnDragEnd:
    """User released mouse to drop a column at the target position."""
    index: int

@dataclass(frozen=True, slots=True)
class ColumnKeyDown:
    """Keyboard event in column management (Enter to commit, Escape to cancel)."""
    pass


# === Dotfile operations ===

COLUMN_DOTFILE_NAME = '.snc_list_columns.json'


def _column_dotfile_path():
    """Return the path to the column dotfile in the current working directory."""
    return os.path.join(os.getcwd(), COLUMN_DOTFILE_NAME)


def _get_item_type_key(lst):
    """Return a type key for the items in the list (based on first item's class)."""
    if not lst:
        return None
    return lst[0].__class__.__module__ + '.' + lst[0].__class__.__qualname__


def load_columns_from_dotfile(type_key: str):
    """Load saved columns for an item type from the dotfile. Returns list or None."""
    try:
        with open(_column_dotfile_path(), 'r') as f:
            data = json.load(f)
        cols = data.get(type_key)
        if isinstance(cols, list):
            return cols
        return None
    except (FileNotFoundError, json.JSONDecodeError, OSError, TypeError):
        return None


def save_columns_to_dotfile(type_key: str, columns: list):
    """Save columns for an item type to the dotfile, preserving other types' entries."""
    path = _column_dotfile_path()
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        data = {}
    data[type_key] = columns
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


# === Column autocomplete helpers ===

def _get_all_possible_columns(lst, get_visualizer):
    """Get union of all possible fields from sampled items in the list."""
    if not lst:
        return []

    columns = []
    seen = set()

    sample_indices = set()
    sample_indices.add(0)
    if len(lst) > 1:
        sample_indices.add(len(lst) - 1)
    if len(lst) > 2:
        middle = list(range(1, len(lst) - 1))
        sample_indices.update(random.sample(middle, min(10, len(middle))))

    for idx in sorted(sample_indices):
        vis = get_visualizer(lst[idx])
        item_get_fields = getattr(vis, 'get_fields', None)
        if item_get_fields is None:
            continue
        fields = item_get_fields(lst[idx])
        if fields is None:
            continue
        for f in fields:
            if f not in seen:
                seen.add(f)
                columns.append(f)

    return columns


def _get_column_suggestions(lst, get_visualizer, current_columns, input_value):
    """Return autocomplete suggestions: possible columns not already shown, filtered by prefix."""
    all_cols = _get_all_possible_columns(lst, get_visualizer)
    existing = set(current_columns)
    suggestions = [c for c in all_cols if c not in existing]
    if input_value:
        suggestions = [c for c in suggestions if c.startswith(input_value)]
    return suggestions


# === Child key management helpers ===

def _remove_column_children(model, column_name):
    """Remove all cell children for a given column."""
    children = model.get('children', {})
    keys_to_remove = [k for k in children if CELL_KEY_SEP in k and k.split(CELL_KEY_SEP, 1)[1] == column_name]
    for k in keys_to_remove:
        del children[k]


def _rename_column_children(model, old_name, new_name):
    """Rename cell children from old column name to new column name."""
    children = model.get('children', {})
    keys_to_rename = [(k, k.split(CELL_KEY_SEP, 1)[0]) for k in children
                      if CELL_KEY_SEP in k and k.split(CELL_KEY_SEP, 1)[1] == old_name]
    for old_key, row_idx in keys_to_rename:
        new_key = f"{row_idx}{CELL_KEY_SEP}{new_name}"
        children[new_key] = children.pop(old_key)


def can_visualize(value):
    return isinstance(value, list)


def get_fields(value):
    return [f'^[{i}]' for i in range(len(value))]


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


_COLUMN_MGMT_DEFAULTS = {
    'editing_column_index': None,
    'adding_column': False,
    'column_input_value': '',
    'selected_suggestion_index': None,
    'column_drag_from': None,
    'column_drag_over': None,
}

_OWN_KEYS = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"]


def init_model(lst, get_visualizer=None, eval_in_scope=None, source_expr=None):
    if get_visualizer is None:
        return {'children': {}, 'handledKeys': [], 'display_mode': 'list', 'columns': [],
                **_COLUMN_MGMT_DEFAULTS}

    type_key = _get_item_type_key(lst)
    saved_columns = load_columns_from_dotfile(type_key) if type_key else None

    if saved_columns is not None:
        columns = saved_columns
    else:
        columns = _detect_table_columns(lst, get_visualizer)

    if columns is not None:
        children = {}
        for i, item in enumerate(lst):
            item_source_expr = f"{source_expr}[{i}]" if source_expr else None
            for col in columns:
                try:
                    cell_value = eval_caret_expr(col, item, eval_in_scope, item_source_expr)
                except Exception:
                    cell_value = None
                if cell_value is not None:
                    cell_vis = get_visualizer(cell_value)
                    cell_source_expr = replace_caret_in_py_exp(col, item_source_expr) if item_source_expr else None
                    children[f"{i}{CELL_KEY_SEP}{col}"] = cell_vis.init_model(cell_value, get_visualizer,
                                                                              eval_in_scope=eval_in_scope, source_expr=cell_source_expr)

        handled_keys = aggregate_handled_keys(children, _OWN_KEYS)
        return {
            'children': children,
            'handledKeys': handled_keys,
            'display_mode': 'table',
            'columns': columns,
            **_COLUMN_MGMT_DEFAULTS,
        }

    children = {}
    for i, item in enumerate(lst):
        vis = get_visualizer(item)
        child_source_expr = f"{source_expr}[{i}]" if source_expr else None
        children[f'^[{i}]'] = vis.init_model(item, get_visualizer,
                                              eval_in_scope=eval_in_scope, source_expr=child_source_expr)

    handled_keys = aggregate_handled_keys(children)
    return {'children': children, 'handledKeys': handled_keys, 'display_mode': 'list', 'columns': [],
            **_COLUMN_MGMT_DEFAULTS}


def _render_column_header(col, index, model):
    """Render a normal column header with drag handle, remove button, and column name."""
    click_event = repr(ColumnClick(index=index))
    remove_event = repr(RemoveColumnClick(index=index))
    drag_start_event = repr(ColumnDragStart(index=index))
    drag_over_event = repr(ColumnDragOver(index=index))
    drag_end_event = repr(ColumnDragEnd(index=index))

    drag_from = model.get('column_drag_from')
    drag_over = model.get('column_drag_over')
    is_drag_source = (drag_from == index)
    is_drag_target = (drag_from is not None and drag_over == index and drag_from != index)

    th_style = 'padding:0 8px;text-align:left;'
    if is_drag_source:
        th_style += 'opacity:0.3;'
    if is_drag_target:
        if drag_from > drag_over:
            th_style += f'border-left:2px solid {BLUE};'
        else:
            th_style += f'border-right:2px solid {BLUE};'

    return (
        f'<th class="snc-hover-hidden-parent" '
        f'snc-mouse-move="{html.escape(drag_over_event)}" '
        f'snc-mouse-up="{html.escape(drag_end_event)}" '
        f'style="{th_style}">'
        f'<span snc-mouse-down="{html.escape(drag_start_event)}" '
        f'style="color:{GRAY};cursor:grab;opacity:0.5;user-select:none;'
        f'font-size:8px;font-style:normal;" '
        f'title="Drag to reorder" class="snc-hover-hidden full-opacity-on-hover">U</span>'
        f'<span snc-mouse-down="{html.escape(remove_event)}" '
        f'style="color:{GRAY};cursor:pointer;opacity:0.5;user-select:none;" '
        f'title="Remove column" class="snc-hover-hidden full-opacity-on-hover">U</span>'
        f'<span snc-mouse-down="{html.escape(click_event)}" '
        f'style="color:{BLUE};cursor:pointer;">'
        f'{html.escape(strip_leading_caret(col))}</span>'
        f'</th>'
    )


def _render_column_input(lst, model, get_visualizer, is_editing, editing_index=-1):
    """Render a column header with input for adding or editing a column name."""
    input_value = model.get('column_input_value', '')
    input_event = "lambda e: ColumnInput(value=e.get('value', ''))"

    current_columns = model.get('columns', [])
    if get_visualizer is not None:
        suggestions = _get_column_suggestions(lst, get_visualizer, current_columns, input_value)
    else:
        suggestions = []
    selected_idx = model.get('selected_suggestion_index')

    suggestion_html = ''
    if suggestions:
        items = []
        for i, suggestion in enumerate(suggestions[:10]):
            select_event = repr(ColumnSelect(name=suggestion))
            is_selected = (selected_idx == i)
            bg = '#094771' if is_selected else SUGGESTION_BG
            scroll_attr = ' snc-scroll-into-view' if is_selected else ''
            items.append(
                f'<div snc-mouse-down="{html.escape(select_event)}" '
                f'class="snc-dropdown-option"'
                f'{scroll_attr} '
                f'style="padding:2px 6px;cursor:pointer;color:{BLUE};white-space:nowrap;'
                f'background:{bg};"'
                f'>{html.escape(suggestion)}</div>'
            )
        suggestion_html = (
            f'<div class="snc-dropdown-panel" snc-dropdown-align="left" style="'
            f'position:absolute;left:0;top:100%;'
            f'border:1px solid {INPUT_BORDER};'
            f'max-height:200px;overflow-y:auto;background:{SUGGESTION_BG};'
            f'min-width:150px;font-size:12px;">'
            + '\n'.join(items)
            + '</div>'
        )

    extra_attrs = ' autofocus'
    if is_editing:
        extra_attrs += ' snc-select-all'

    input_html = (
        f'<span class="snc-dropdown-trigger" style="position:relative;display:inline-block;">'
        f'<input type="text" snc-input="{html.escape(input_event)}" '
        f'value="{html.escape(input_value)}" '
        f'placeholder="column name" '
        f'spellcheck="false"'
        f'{extra_attrs} '
        f'style="background:{INPUT_BG};color:{BLUE};border:1px solid {INPUT_BORDER};'
        f'padding:1px 4px;font-family:inherit;font-size:inherit;'
        f'outline:none;width:120px;" />'
        f'{suggestion_html}'
        f'</span>'
    )

    return f'<th style="padding:0 8px;">{input_html}</th>'


def _visualize_table(lst, model, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False, source_expr=None):
    children = model.get('children', {})
    columns = model.get('columns', [])
    focused_child = model.get('focused_child')

    max_column_width = round(800 / sqrt(max(len(columns), 1)))

    key_handler = repr(ColumnKeyDown())
    strs = [
        f'<div tabindex="0" snc-key-down="{html.escape(key_handler)}" '
        f'style="font-family:monospace;overflow-x:auto;outline:none;">'
    ]
    strs.append('<table style="border-collapse:collapse;font-family:monospace;"><tr>')
    strs.append('<th style="padding:0 8px;"></th>')

    for ci, col in enumerate(columns):
        if model.get('editing_column_index') == ci:
            strs.append(_render_column_input(lst, model, get_visualizer, is_editing=True, editing_index=ci))
        else:
            strs.append(_render_column_header(col, ci, model))

    if model.get('adding_column'):
        strs.append(_render_column_input(lst, model, get_visualizer, is_editing=False))

    add_event = repr(AddColumnClick())
    strs.append(
        f'<th class="snc-hover-hidden-parent" '
        f'snc-mouse-down="{html.escape(add_event)}" '
        f'style="padding:0 4px;cursor:pointer;vertical-align:middle;">'
        f'<span class="snc-hover-hidden full-opacity-on-hover" '
        f'style="color:{GRAY};opacity:0.5;font-size:8px;font-style:normal;">+</span>'
        f'</th>'
    )

    strs.append('</tr>')

    for i, item in enumerate(lst):
        strs.append('<tr><td style="color:')
        strs.append(GRAY)
        strs.append(';padding:0 8px;text-align:right;">')
        strs.append(str(i))
        strs.append('</td>')

        item_source_expr = f"{source_expr}[{i}]" if source_expr else None

        for col in columns:
            composite_key = f"{i}{CELL_KEY_SEP}{col}"
            try:
                cell_value = eval_caret_expr(col, item, eval_in_scope, item_source_expr)
            except Exception:
                cell_value = None

            if cell_value is not None:
                cell_vis = get_visualizer(cell_value)
                cell_model = children.get(composite_key)
                cell_source_expr = replace_caret_in_py_exp(col, item_source_expr) if item_source_expr else None
                if cell_model is None:
                    cell_model = cell_vis.init_model(cell_value, get_visualizer,
                                                     eval_in_scope=eval_in_scope, source_expr=cell_source_expr)
                child_small = (composite_key != focused_child)
                if hasattr(cell_vis, 'visualize_els'):
                    cell_htmls = cell_vis.visualize_els(cell_value, cell_model, get_visualizer, eval_in_scope, max_width=max_column_width, max_height=80, small=child_small, source_expr=cell_source_expr)
                else:
                    cell_htmls = [cell_vis.visualize(cell_value, cell_model, get_visualizer, eval_in_scope, max_width=max_column_width, max_height=80, small=child_small, source_expr=cell_source_expr)]
                strs.append('<td style="padding:0 8px;">')
                strs.append(wrap_child_prefix(composite_key))
                strs.extend(cell_htmls)
                strs.append(wrap_child_suffix)
                strs.append('</td>')
            else:
                strs.append('<td style="padding:0 8px;"></td>')

        strs.append('</tr>')

    strs.append('</table>')
    strs.append('</div>')
    return ''.join(strs)


def visualize(lst: list, model: dict, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False, source_expr=None):
    if model.get('display_mode') == 'table':
        return _visualize_table(lst, model, get_visualizer, eval_in_scope, max_width=max_width, max_height=max_height, small=small, source_expr=source_expr)

    children = model.get('children', {})
    focused_child = model.get('focused_child')
    items_html_parts = []

    for i, item in enumerate(lst):
        key = f'^[{i}]'
        vis = get_visualizer(item)
        child_model = children.get(key)
        child_source_expr = f"{source_expr}[{i}]" if source_expr else None
        if child_model is None:
            child_model = vis.init_model(item, get_visualizer,
                                         eval_in_scope=eval_in_scope, source_expr=child_source_expr)
        child_small = (key != focused_child)
        child_html = vis.visualize(item, child_model, get_visualizer, eval_in_scope, small=child_small, source_expr=child_source_expr)
        items_html_parts.append(wrap_child_html(child_html, key))

    items_html = '\n'.join(items_html_parts)
    return f'[{items_html}]'


def _table_child_value_getter(key, lst, eval_in_scope=None, source_expr=None):
    row_key, field_key = key.split(CELL_KEY_SEP, 1)
    item = lst[int(row_key)]
    item_source_expr = f"{source_expr}[{row_key}]" if source_expr else None
    return eval_caret_expr(field_key, item, eval_in_scope, item_source_expr)


def update(event, source_code: str, source_line: int, model: Any, value, get_visualizer=None, eval_in_scope=None, source_expr=None) -> Tuple[Any, List[Any]]:
    if event is None or not isinstance(event, dict) or not event.get('pythonEventStr'):
        return (model, [])

    if model is None:
        model = {'children': {}, 'handledKeys': [], 'display_mode': 'list', 'columns': [],
                 **_COLUMN_MGMT_DEFAULTS}

    try:
        make_python_event = eval(event['pythonEventStr'])
    except Exception:
        return (model, [])

    event_json = event.get('eventJSON', {})
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    if msg is None:
        return (model, [])

    # Route child events (both list and table mode)
    if isinstance(msg, ChildEvent):
        is_table = model.get('display_mode') == 'table'
        if is_table:
            child_value_getter = lambda key: _table_child_value_getter(key, value, eval_in_scope, source_expr)
            def _table_child_se_getter(key):
                if not source_expr:
                    return None
                row_key, field_key = key.split(CELL_KEY_SEP, 1)
                return replace_caret_in_py_exp(field_key, f"{source_expr}[{row_key}]")
            child_se_getter = _table_child_se_getter
        else:
            child_value_getter = lambda key, _val=value: eval_caret_expr(key, _val, eval_in_scope, source_expr)
            child_se_getter = (lambda key: replace_caret_in_py_exp(key, source_expr)) if source_expr else None

        new_model, commands = route_child_event(
            event, model, value,
            child_value_getter=child_value_getter,
            get_visualizer=get_visualizer,
            source_code=source_code,
            source_line=source_line,
            eval_in_scope=eval_in_scope,
            child_source_expr_getter=child_se_getter,
        )

        if is_table:
            new_model['handledKeys'] = aggregate_handled_keys(new_model.get('children', {}), _OWN_KEYS)
        else:
            new_model['handledKeys'] = aggregate_handled_keys(new_model.get('children', {}))
        return (new_model, commands)

    # Column management events (table mode only)
    commands: List[Any] = []
    is_table = model.get('display_mode') == 'table'

    if not is_table:
        return (model, commands)

    type_key = _get_item_type_key(value) if value else None

    match msg:
        case AddColumnClick():
            model['adding_column'] = True
            model['column_input_value'] = ''
            model['editing_column_index'] = None

        case ColumnInput(value=val):
            model['column_input_value'] = val
            if val and get_visualizer is not None:
                suggestions = _get_column_suggestions(value, get_visualizer, model.get('columns', []), val)
                model['selected_suggestion_index'] = 0 if suggestions else None
            else:
                model['selected_suggestion_index'] = None

        case ColumnSelect(name=name):
            if model.get('adding_column'):
                model['columns'].append(name)
                model['adding_column'] = False
                model['column_input_value'] = ''
                if type_key:
                    save_columns_to_dotfile(type_key, model['columns'])
            elif model.get('editing_column_index') is not None:
                idx = model['editing_column_index']
                if 0 <= idx < len(model['columns']):
                    old_name = model['columns'][idx]
                    model['columns'][idx] = name
                    if old_name != name:
                        _rename_column_children(model, old_name, name)
                model['editing_column_index'] = None
                model['column_input_value'] = ''
                if type_key:
                    save_columns_to_dotfile(type_key, model['columns'])

        case ColumnClick(index=idx):
            detail = event_json.get('detail', 1)
            if detail >= 2:
                if 0 <= idx < len(model['columns']):
                    model['editing_column_index'] = idx
                    model['column_input_value'] = model['columns'][idx]
                    model['adding_column'] = False

        case RemoveColumnClick(index=idx):
            if 0 <= idx < len(model['columns']):
                removed_col = model['columns'].pop(idx)
                _remove_column_children(model, removed_col)
                if model.get('editing_column_index') is not None:
                    if model['editing_column_index'] == idx:
                        model['editing_column_index'] = None
                        model['column_input_value'] = ''
                    elif model['editing_column_index'] > idx:
                        model['editing_column_index'] -= 1
                if type_key:
                    save_columns_to_dotfile(type_key, model['columns'])

        case ColumnDragStart(index=idx):
            if 0 <= idx < len(model['columns']):
                model['column_drag_from'] = idx
                model['column_drag_over'] = idx

        case ColumnDragOver(index=idx):
            if model.get('column_drag_from') is not None:
                if event_json.get('buttons', 0) == 0:
                    model['column_drag_from'] = None
                    model['column_drag_over'] = None
                else:
                    model['column_drag_over'] = idx

        case ColumnDragEnd(index=idx):
            drag_from = model.get('column_drag_from')
            if drag_from is not None and 0 <= drag_from < len(model['columns']):
                target = idx
                if drag_from != target:
                    col = model['columns'].pop(drag_from)
                    model['columns'].insert(target, col)
                    if type_key:
                        save_columns_to_dotfile(type_key, model['columns'])
            model['column_drag_from'] = None
            model['column_drag_over'] = None

        case ColumnKeyDown():
            key = event_json.get('key', '')
            is_input_active = model.get('adding_column') or model.get('editing_column_index') is not None

            if key == 'ArrowDown' and is_input_active:
                suggestions = _get_column_suggestions(value, get_visualizer, model.get('columns', []), model.get('column_input_value', '')) if get_visualizer else []
                if suggestions:
                    cur = model.get('selected_suggestion_index')
                    if cur is None:
                        model['selected_suggestion_index'] = 0
                    else:
                        model['selected_suggestion_index'] = (cur + 1) % min(len(suggestions), 10)

            elif key == 'ArrowUp' and is_input_active:
                suggestions = _get_column_suggestions(value, get_visualizer, model.get('columns', []), model.get('column_input_value', '')) if get_visualizer else []
                if suggestions:
                    cur = model.get('selected_suggestion_index')
                    count = min(len(suggestions), 10)
                    if cur is None:
                        model['selected_suggestion_index'] = count - 1
                    else:
                        model['selected_suggestion_index'] = (cur - 1) % count

            elif key in ('Enter', 'Tab'):
                sel_idx = model.get('selected_suggestion_index')
                if sel_idx is not None and is_input_active:
                    suggestions = _get_column_suggestions(value, get_visualizer, model.get('columns', []), model.get('column_input_value', '')) if get_visualizer else []
                    capped = suggestions[:10]
                    if 0 <= sel_idx < len(capped):
                        commit_val = capped[sel_idx]
                    else:
                        commit_val = model.get('column_input_value', '').strip()
                else:
                    commit_val = model.get('column_input_value', '').strip()

                if model.get('adding_column'):
                    if commit_val:
                        model['columns'].append(commit_val)
                        if type_key:
                            save_columns_to_dotfile(type_key, model['columns'])
                    model['adding_column'] = False
                    model['column_input_value'] = ''
                    model['selected_suggestion_index'] = None
                elif model.get('editing_column_index') is not None:
                    idx = model['editing_column_index']
                    if commit_val and 0 <= idx < len(model['columns']):
                        old_name = model['columns'][idx]
                        model['columns'][idx] = commit_val
                        if old_name != commit_val:
                            _rename_column_children(model, old_name, commit_val)
                        if type_key:
                            save_columns_to_dotfile(type_key, model['columns'])
                    model['editing_column_index'] = None
                    model['column_input_value'] = ''
                    model['selected_suggestion_index'] = None

            elif key == 'Escape':
                model['adding_column'] = False
                model['editing_column_index'] = None
                model['column_input_value'] = ''
                model['selected_suggestion_index'] = None

    return (model, commands)
