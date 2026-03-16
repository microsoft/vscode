"""Object visualizer for Sculpt-n-Code. z because that makes it last in priority.

This visualizer displays Python objects with configurable field inspection.

================================================================================
ARCHITECTURE OVERVIEW
================================================================================

This visualizer follows the Elm architecture with three core functions:

1. visualize(value, model) -> HTML string
   - Renders the object as a table of accessor → value rows
   - Shows a (+) button to add new fields
   - Shows autocomplete suggestions when adding/editing fields

2. init_model(value) -> dict
   - Returns the initial model state, loading saved fields from dotfile
   - Falls back to DEFAULT_FIELDS_FOR_TYPE, then non-trivial dir() names

3. update(event, source_code, source_line, model, value) -> (new_model, commands)
   - Processes UI events (click, input, keyboard) and returns updated model
   - Saves field configuration to dotfile on commit

================================================================================
FIELD CONFIGURATION
================================================================================

Fields shown for each type are configurable and persisted:

1. DOTFILE (.snc_object_fields.json in working directory):
   - JSON mapping {full_class_name: [accessor_code, ...]}
   - Highest priority: user-customized fields

2. DEFAULT_FIELDS_FOR_TYPE:
   - Hardcoded defaults for known types (e.g., re.Match)
   - Used when type not in dotfile

3. Non-trivial dir() names:
   - Fallback: all attributes not in dir(object())
   - Used when type not in dotfile or DEFAULT_FIELDS_FOR_TYPE

================================================================================
"""

import html
import json
import os

from dataclasses import dataclass
from typing import List, Tuple, Any

from visualizer_utils import ChildEvent, wrap_child_html, route_child_event, aggregate_handled_keys, replace_caret_in_py_exp, strip_leading_caret, eval_caret_expr

# VS Code theme colors
BLUE = "#569cd6"
GRAY = "#808080"
GRAY_HALF_ALPHA = "rgba(128,128,128,0.5)"
ADD_GREEN = "#89d185"
INPUT_BG = "#1e1e1e"
INPUT_BORDER = "#3c3c3c"
SUGGESTION_BG = "#252526"
SUGGESTION_HOVER = "#2a2d2e"

# === Event types ===

@dataclass(frozen=True, slots=True)
class AddFieldClick:
    """User clicked the (+) button to add a new field."""
    pass

@dataclass(frozen=True, slots=True)
class FieldInput:
    """User typed in the field name input (add or edit mode)."""
    value: str

@dataclass(frozen=True, slots=True)
class FieldSelect:
    """User clicked an autocomplete suggestion."""
    accessor: str

@dataclass(frozen=True, slots=True)
class FieldClick:
    """User clicked on an existing field name (double-click to edit)."""
    index: int

@dataclass(frozen=True, slots=True)
class RemoveFieldClick:
    """User clicked the (×) button to remove a field."""
    index: int

@dataclass(frozen=True, slots=True)
class DragStart:
    """User pressed mouse down on a drag handle to start reordering."""
    index: int

@dataclass(frozen=True, slots=True)
class DragOver:
    """Mouse moved over a row while dragging (reorder target)."""
    index: int

@dataclass(frozen=True, slots=True)
class DragEnd:
    """User released mouse to drop a field at the target position."""
    index: int

@dataclass(frozen=True, slots=True)
class KeyDown:
    """Keyboard event (Enter to commit, Escape to cancel)."""
    pass


# === Constants ===

TRIVIAL_NAMES = set(dir(object()))

DEFAULT_FIELDS_FOR_TYPE = {
    're.Match': ['^[0]', '^.start(0)', '^.end(0)'],
}

DOTFILE_NAME = '.snc_object_fields.json'


def can_visualize(value):
    return True


def get_fields(value):
    if value is None or isinstance(value, (int, float)):
        return None
    full_class_name = _get_full_class_name(value)
    fields = load_fields_from_dotfile(full_class_name)
    if fields is None:
        fields = DEFAULT_FIELDS_FOR_TYPE.get(full_class_name)
    if fields is None:
        fields = _get_non_trivial_names(value)
    return list(fields)


# === Dotfile operations ===

def _dotfile_path():
    """Return the path to the dotfile in the current working directory."""
    return os.path.join(os.getcwd(), DOTFILE_NAME)


def load_fields_from_dotfile(full_class_name: str):
    """
    Load saved fields for a type from the dotfile.

    Returns the list of accessor codes, or None if not found.
    """
    try:
        with open(_dotfile_path(), 'r') as f:
            data = json.load(f)
        fields = data.get(full_class_name)
        if isinstance(fields, list):
            return [f if f.startswith('^') else f'^{f}' for f in fields]
        return None
    except (FileNotFoundError, json.JSONDecodeError, OSError, TypeError):
        return None


def save_fields_to_dotfile(full_class_name: str, fields: list):
    """
    Save fields for a type to the dotfile, preserving other types' entries.
    """
    path = _dotfile_path()
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        data = {}
    data[full_class_name] = fields
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


# === Helper functions ===

def _get_full_class_name(obj) -> str:
    """Return the full module.qualname for an object's class."""
    return obj.__class__.__module__ + '.' + obj.__class__.__qualname__


def _get_non_trivial_names(obj) -> list:
    """Return sorted list of attribute accessors (e.g. '^.x') for non-trivial names."""
    return sorted([f"^.{name}" for name in dir(obj) if name not in TRIVIAL_NAMES])


def _get_autocomplete_suggestions(obj, current_fields: list, input_value: str) -> list:
    """
    Return autocomplete suggestions: non-trivial names not already shown,
    filtered by input_value prefix.
    """
    all_names = _get_non_trivial_names(obj)
    existing = set(current_fields)
    suggestions = [name for name in all_names if name not in existing]
    if input_value:
        suggestions = [name for name in suggestions if name.startswith(input_value)]
    return suggestions


def _eval_field(obj, accessor_code: str, eval_in_scope=None, source_expr=None):
    """
    Evaluate an accessor code against an object.

    Returns (placeholder_args, value_str, raw_value, is_error) tuple.
    placeholder_args suggest what the arguments are for callables.
    raw_value is the actual Python value (None on error or callable).
    is_error is True if evaluation raised an exception.
    """
    try:
        val = eval_caret_expr(accessor_code, obj, eval_in_scope, source_expr)
        val_str = None
    except Exception as e:
        return ('', str(e), None, True)

    if callable(val):
        placeholder_args = getattr(val, '__text_signature__', None) or '(...)'
        val_str = val.__doc__.split('\n', 1)[0] if val.__doc__ else None
        if val_str is None:
            val_str = repr(val)[:200]
        return (placeholder_args, val_str, None, False)

    placeholder_args = ''
    if val_str is None:
        val_str = repr(val)[:200]

    return (placeholder_args, val_str, val, False)


# === Elm architecture functions ===

def init_model(value, get_visualizer=None, eval_in_scope=None, source_expr=None):
    """
    Initialize the model state for a new visualization.

    Priority for fields: dotfile > DEFAULT_FIELDS_FOR_TYPE > non-trivial dir() names.
    """
    own_keys = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"]

    if value is None or isinstance(value, (int, float)):
        return {
            "fields": [],
            "editing_index": None,
            "adding_field": False,
            "input_value": "",
            "selected_suggestion_index": None,
            "drag_from_index": None,
            "drag_over_index": None,
            "children": {},
            "handledKeys": own_keys,
        }

    full_class_name = _get_full_class_name(value)

    fields = load_fields_from_dotfile(full_class_name)
    if fields is None:
        fields = DEFAULT_FIELDS_FOR_TYPE.get(full_class_name)
    if fields is None:
        fields = _get_non_trivial_names(value)

    fields = list(fields)

    children = {}
    if get_visualizer is not None:
        for accessor_code in fields:
            placeholder_args, val_str, raw_value, is_error = _eval_field(value, accessor_code, eval_in_scope, source_expr)
            if not is_error and not placeholder_args and raw_value is not None:
                child_vis = get_visualizer(raw_value)
                child_source_expr = replace_caret_in_py_exp(accessor_code, source_expr) if source_expr else None
                children[accessor_code] = child_vis.init_model(raw_value, get_visualizer,
                                                               eval_in_scope=eval_in_scope, source_expr=child_source_expr)

    handled_keys = aggregate_handled_keys(children, own_keys)

    return {
        "fields": fields,
        "editing_index": None,
        "adding_field": False,
        "input_value": "",
        "selected_suggestion_index": None,
        "drag_from_index": None,
        "drag_over_index": None,
        "children": children,
        "handledKeys": handled_keys,
    }


def update(event, source_code: str, source_line: int, model: dict, value, get_visualizer=None, eval_in_scope=None, source_expr=None) -> Tuple[dict, List[Any]]:
    """
    Update model based on event. Returns (new_model, commands) tuple.

    Args:
        event: The UI event to process
        source_code: The full source code of the file
        source_line: The line number where this value is visualized
        model: The current model state
        value: The object being visualized
    """
    commands: List[Any] = []

    if event is None or event.get('pythonEventStr', '') == '' or event.get('eventJSON', '') == '':
        return (model, commands)

    make_python_event = eval(event['pythonEventStr'])
    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    if msg is None:
        return (model, commands)

    if isinstance(msg, ChildEvent) and get_visualizer is not None:
        _obj_ref = value
        def _child_value_getter(accessor_key, _obj=_obj_ref):
            return eval_caret_expr(accessor_key, _obj, eval_in_scope, source_expr)
        child_se_getter = (lambda key: replace_caret_in_py_exp(key, source_expr)) if source_expr else None
        new_model, child_cmds = route_child_event(
            event, model, value, _child_value_getter, get_visualizer,
            source_code=source_code, source_line=source_line,
            eval_in_scope=eval_in_scope, child_source_expr_getter=child_se_getter,
        )
        own_keys = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"]
        new_model['handledKeys'] = aggregate_handled_keys(new_model.get('children', {}), own_keys)
        return (new_model, child_cmds)

    full_class_name = _get_full_class_name(value) if value is not None and not isinstance(value, (int, float)) else None

    match msg:
        case AddFieldClick():
            model['adding_field'] = True
            model['input_value'] = ''
            model['editing_index'] = None

        case FieldInput(value=val):
            model['input_value'] = val
            # Auto-highlight first matching suggestion so user can Tab/Enter immediately
            if val and value is not None:
                suggestions = _get_autocomplete_suggestions(value, model.get('fields', []), val)
                model['selected_suggestion_index'] = 0 if suggestions else None
            else:
                model['selected_suggestion_index'] = None

        case FieldSelect(accessor=accessor):
            if model.get('adding_field'):
                model['fields'].append(accessor)
                model['adding_field'] = False
                model['input_value'] = ''
                if full_class_name:
                    save_fields_to_dotfile(full_class_name, model['fields'])
            elif model.get('editing_index') is not None:
                idx = model['editing_index']
                if 0 <= idx < len(model['fields']):
                    model['fields'][idx] = accessor
                model['editing_index'] = None
                model['input_value'] = ''
                if full_class_name:
                    save_fields_to_dotfile(full_class_name, model['fields'])

        case RemoveFieldClick(index=idx):
            if 0 <= idx < len(model['fields']):
                removed_accessor = model['fields'].pop(idx)
                # Clean up child model for the removed field
                children = model.get('children', {})
                children.pop(removed_accessor, None)
                # Cancel editing if the removed field was being edited
                if model.get('editing_index') is not None:
                    if model['editing_index'] == idx:
                        model['editing_index'] = None
                        model['input_value'] = ''
                    elif model['editing_index'] > idx:
                        model['editing_index'] -= 1
                if full_class_name:
                    save_fields_to_dotfile(full_class_name, model['fields'])

        case DragStart(index=idx):
            if 0 <= idx < len(model['fields']):
                model['drag_from_index'] = idx
                model['drag_over_index'] = idx

        case DragOver(index=idx):
            if model.get('drag_from_index') is not None:
                if event_json.get('buttons', 0) == 0:
                    # Mouse released outside a DragEnd target — cancel drag
                    model['drag_from_index'] = None
                    model['drag_over_index'] = None
                else:
                    model['drag_over_index'] = idx

        case DragEnd(index=idx):
            drag_from = model.get('drag_from_index')
            if drag_from is not None and 0 <= drag_from < len(model['fields']):
                target = idx
                if drag_from != target:
                    field = model['fields'].pop(drag_from)
                    model['fields'].insert(target, field)
                    if full_class_name:
                        save_fields_to_dotfile(full_class_name, model['fields'])
            model['drag_from_index'] = None
            model['drag_over_index'] = None

        case FieldClick(index=idx):
            detail = event_json.get('detail', 1)
            if detail >= 2:
                # Double-click: start editing this field
                if 0 <= idx < len(model['fields']):
                    model['editing_index'] = idx
                    model['input_value'] = model['fields'][idx]
                    model['adding_field'] = False

        case KeyDown():
            key = event_json.get('key', '')
            is_input_active = model.get('adding_field') or model.get('editing_index') is not None

            if key == 'ArrowDown' and is_input_active:
                # Compute suggestions to know the count
                suggestions = _get_autocomplete_suggestions(value, model.get('fields', []), model.get('input_value', '')) if value is not None else []
                if suggestions:
                    cur = model.get('selected_suggestion_index')
                    if cur is None:
                        model['selected_suggestion_index'] = 0
                    else:
                        model['selected_suggestion_index'] = (cur + 1) % min(len(suggestions), 10)

            elif key == 'ArrowUp' and is_input_active:
                suggestions = _get_autocomplete_suggestions(value, model.get('fields', []), model.get('input_value', '')) if value is not None else []
                if suggestions:
                    cur = model.get('selected_suggestion_index')
                    count = min(len(suggestions), 10)
                    if cur is None:
                        model['selected_suggestion_index'] = count - 1
                    else:
                        model['selected_suggestion_index'] = (cur - 1) % count

            elif key in ('Enter', 'Tab'):
                # If a suggestion is selected, commit it
                sel_idx = model.get('selected_suggestion_index')
                if sel_idx is not None and is_input_active:
                    suggestions = _get_autocomplete_suggestions(value, model.get('fields', []), model.get('input_value', '')) if value is not None else []
                    capped = suggestions[:10]
                    if 0 <= sel_idx < len(capped):
                        commit_val = capped[sel_idx]
                    else:
                        commit_val = model.get('input_value', '').strip()
                else:
                    commit_val = model.get('input_value', '').strip()

                if model.get('adding_field'):
                    if commit_val:
                        model['fields'].append(commit_val)
                        if full_class_name:
                            save_fields_to_dotfile(full_class_name, model['fields'])
                    model['adding_field'] = False
                    model['input_value'] = ''
                    model['selected_suggestion_index'] = None
                elif model.get('editing_index') is not None:
                    idx = model['editing_index']
                    if commit_val and 0 <= idx < len(model['fields']):
                        model['fields'][idx] = commit_val
                        if full_class_name:
                            save_fields_to_dotfile(full_class_name, model['fields'])
                    model['editing_index'] = None
                    model['input_value'] = ''
                    model['selected_suggestion_index'] = None

            elif key == 'Escape':
                model['adding_field'] = False
                model['editing_index'] = None
                model['input_value'] = ''
                model['selected_suggestion_index'] = None

    return (model, commands)


def visualize(obj, model, get_visualizer, eval_in_scope, max_width=None, max_height=None, small=False, source_expr=None):
    """
    Render the object as HTML with configurable field inspection.

    Primitives (None, int, float, bool) render as repr.
    Objects render as a table of accessor → value with interactive controls.
    """
    if obj is None or isinstance(obj, int) or isinstance(obj, float):
        return repr(obj)

    full_class_name = _get_full_class_name(obj)

    field_trs = []

    for i, accessor_code in enumerate(model.get('fields', [])):
        if model.get('editing_index') == i:
            # This field is being edited: show input
            field_trs.append(_render_input_row(obj, model, is_editing=True, editing_index=i))
        else:
            # Normal display: double-clickable field name with remove/drag handles
            placeholder_args, val_str, raw_value, is_error = _eval_field(obj, accessor_code, eval_in_scope, source_expr)
            click_event = repr(FieldClick(index=i))
            remove_event = repr(RemoveFieldClick(index=i))
            drag_start_event = repr(DragStart(index=i))
            drag_over_event = repr(DragOver(index=i))
            drag_end_event = repr(DragEnd(index=i))

            # Render value cell: use subvisualizer for non-callable/non-error values
            children = model.get('children', {})
            focused_child = model.get('focused_child')
            if not is_error and not placeholder_args and raw_value is not None and get_visualizer is not None:
                child_vis = get_visualizer(raw_value)
                child_model = children.get(accessor_code)
                child_source_expr = replace_caret_in_py_exp(accessor_code, source_expr) if source_expr else None
                if child_model is None:
                    child_model = child_vis.init_model(raw_value, get_visualizer,
                                                       eval_in_scope=eval_in_scope, source_expr=child_source_expr)
                child_small = (accessor_code != focused_child)
                child_html = child_vis.visualize(raw_value, child_model, get_visualizer, eval_in_scope, max_width=500, small=child_small, source_expr=child_source_expr)
                value_td = f'<td>{wrap_child_html(child_html, accessor_code)}</td>'
            else:
                value_td = f'<td>{html.escape(val_str)}</td>'

            # Visual feedback during drag
            drag_from = model.get('drag_from_index')
            drag_over = model.get('drag_over_index')
            is_drag_source = (drag_from == i)
            is_drag_target = (drag_from is not None
                              and drag_over == i
                              and drag_from != i)
            row_style = 'opacity:0.3;' if is_drag_source else ''
            if is_drag_target:
                # border-top when dragging up, border-bottom when dragging down
                if drag_from > drag_over:
                    target_style = f'border-top:2px solid {BLUE};'
                else:
                    target_style = f'border-bottom:2px solid {BLUE};'
            else:
                target_style = ''

            field_trs.append(
                f'<tr class="snc-hover-hidden-parent" '
                f'snc-mouse-move="{html.escape(drag_over_event)}" '
                f'snc-mouse-up="{html.escape(drag_end_event)}" '
                f'style="{row_style}{target_style}">'
                f'<td snc-mouse-down="{html.escape(drag_start_event)}" '
                f'style="color:{GRAY};cursor:grab;opacity:0.5;user-select:none;'
                f'padding-right:0;width:10px;font-size:8px;font-style:normal;" '
                f'title="Drag to reorder" class="full-opacity-on-hover">'
                f'<span class="snc-hover-hidden">U</span></td>'
                f'<td snc-mouse-down="{html.escape(remove_event)}" '
                f'style="color:{GRAY};cursor:pointer;opacity:0.5;user-select:none;'
                f'padding-right:2px;width:12px;" '
                f'title="Remove field" class="full-opacity-on-hover">'
                f'<span class="snc-hover-hidden">U</span></td>'
                f'<td snc-mouse-down="{html.escape(click_event)}" '
                f'style="color:{BLUE};opacity:0.7;cursor:pointer;padding-right:8px;">'
                f'{html.escape(strip_leading_caret(accessor_code))}<span style="opacity:0.4">{html.escape(placeholder_args)}</span></td>'
                f'{value_td}'
                f'</tr>'
            )

    # If adding a new field, show input row at the end
    if model.get('adding_field'):
        field_trs.append(_render_input_row(obj, model, is_editing=False))

    field_trs_str = '\n'.join(field_trs)

    # (+) Add field button
    add_event = repr(AddFieldClick())
    add_button = (
        f'<tr snc-mouse-down="{html.escape(add_event)}" class="snc-hover-hidden-parent">'
        f'<td style="min-width:0.8em"></td><td style="min-width:1em"></td>' # need min widths in case there are no property rows above
        f'<td class="snc-hover-hide-border full-opacity-on-hover" colspan=2 style="color:{GRAY};cursor:pointer;text-align:center;opacity:0.5;user-select:none;height:5px;min-width:6em;border:1px solid {GRAY_HALF_ALPHA}">'
            f'<span class="snc-hover-hidden" style="display:inline-block;position:absolute;margin-top:-9px;margin-left:-0.4em;font-size:8px;font-style:normal">+</span>'
        f'</td>'
        # f'<td></td>'
        f'</tr>'
    )

    key_handler = repr(KeyDown())
    return (
        f'<div tabindex="0" snc-key-down="{html.escape(key_handler)}" '
        f'style="font-family:monospace;overflow-x:auto;outline:none;">'
        f'<h4 style="color:{BLUE};margin:0">{html.escape(full_class_name)} {html.escape(repr(obj))}</h4>'
        f'<table style="border-collapse:collapse;">'
        f'{field_trs_str}'
        f'{add_button}'
        f'</table>'
        f'</div>'
    )


def _render_input_row(obj, model, is_editing: bool, editing_index: int = -1):
    """
    Render a table row with a text input for adding or editing a field.

    Shows the input field, autocomplete suggestions below, and a live-evaluated
    value in the second column.
    """
    input_value = model.get('input_value', '')
    input_event = "lambda e: FieldInput(value=e.get('value', ''))"

    # Evaluate current input as accessor to show live value
    if input_value.strip():
        _, val_str, _, _ = _eval_field(obj, input_value)
    else:
        val_str = ''

    # Build autocomplete suggestions
    current_fields = model.get('fields', [])
    suggestions = _get_autocomplete_suggestions(obj, current_fields, input_value)
    selected_idx = model.get('selected_suggestion_index')

    suggestion_html = ''
    if suggestions:
        items = []
        for i, suggestion in enumerate(suggestions[:10]):  # cap at 10 suggestions
            select_event = repr(FieldSelect(accessor=suggestion))
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

    # Wrap input + dropdown in snc-dropdown-trigger so the TS hoisting mechanism
    # can move the panel outside the overflow-clipped widget
    extra_attrs = ' autofocus'
    if is_editing:
        extra_attrs += ' snc-select-all'
    input_html = (
        f'<span class="snc-dropdown-trigger" style="position:relative;display:inline-block;">'
        f'<input type="text" snc-input="{html.escape(input_event)}" '
        f'value="{html.escape(input_value)}" '
        f'placeholder="^.field_name" '
        f'spellcheck="false"'
        f'{extra_attrs} '
        f'style="background:{INPUT_BG};color:{BLUE};border:1px solid {INPUT_BORDER};'
        f'padding:1px 4px;font-family:inherit;font-size:inherit;'
        f'outline:none;width:120px;" />'
        f'{suggestion_html}'
        f'</span>'
    )

    return (
        f'<tr>'
        f'<td></td><td></td>'
        f'<td style="padding-right:8px;">'
        f'{input_html}'
        f'</td>'
        f'<td>{html.escape(val_str)}</td>'
        f'</tr>'
    )


def field_to_tr(obj, accessor_code):
    """Legacy field rendering (kept for reference, used by visualize internally)."""
    placeholder_args, val_str, _, _ = _eval_field(obj, accessor_code)
    return f'<tr><td style="color:{BLUE};opacity:0.7;">{html.escape(strip_leading_caret(accessor_code))}<span style="opacity:0.4">{html.escape(placeholder_args)}</span></td><td>{html.escape(val_str)}</td></tr>\n'
