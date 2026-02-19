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
class KeyDown:
    """Keyboard event (Enter to commit, Escape to cancel)."""
    pass


# === Constants ===

TRIVIAL_NAMES = set(dir(object()))

DEFAULT_FIELDS_FOR_TYPE = {
    're.Match': ['[0]', '.start(0)', '.end(0)'],
}

DOTFILE_NAME = '.snc_object_fields.json'


def can_visualize(value):
    return True


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
            return fields
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
    """Return sorted list of attribute accessors (e.g. '.x') for non-trivial names."""
    return sorted([f".{name}" for name in dir(obj) if name not in TRIVIAL_NAMES])


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


def _eval_field(obj, accessor_code: str):
    """
    Evaluate an accessor code against an object.

    Returns (display_accessor, value_str) tuple.
    display_accessor may differ from accessor_code for callables.
    """
    try:
        val = eval(f"obj{accessor_code}")
        val_str = None
    except Exception as e:
        return (accessor_code, str(e))

    if callable(val):
        display_accessor = accessor_code + (getattr(val, '__text_signature__', None) or '(...)')
        val_str = val.__doc__.split('\n', 1)[0] if val.__doc__ else None

    else:
        display_accessor = accessor_code

    if val_str is None:
        val_str = repr(val)[:200]

    return (display_accessor, val_str)


# === Elm architecture functions ===

def init_model(value):
    """
    Initialize the model state for a new visualization.

    Priority for fields: dotfile > DEFAULT_FIELDS_FOR_TYPE > non-trivial dir() names.
    """
    if value is None or isinstance(value, (int, float)):
        return {
            "fields": [],
            "editing_index": None,
            "adding_field": False,
            "input_value": "",
            "selected_suggestion_index": None,
            "handledKeys": ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"],
        }

    full_class_name = _get_full_class_name(value)

    # Priority: dotfile > DEFAULT_FIELDS_FOR_TYPE > non-trivial names
    fields = load_fields_from_dotfile(full_class_name)
    if fields is None:
        fields = DEFAULT_FIELDS_FOR_TYPE.get(full_class_name)
    if fields is None:
        fields = _get_non_trivial_names(value)

    return {
        "fields": list(fields),  # copy to avoid mutation
        "editing_index": None,
        "adding_field": False,
        "input_value": "",
        "selected_suggestion_index": None,
        "handledKeys": ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab"],
    }


def update(event, source_code: str, source_line: int, model: dict, value) -> Tuple[dict, List[Any]]:
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
    if model is None:
        model = init_model(value)

    make_python_event = eval(event['pythonEventStr'])
    event_json = event['eventJSON']
    msg = make_python_event(event_json) if callable(make_python_event) else make_python_event

    if msg is None:
        return (model, commands)

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
                model['fields'].pop(idx)
                # Cancel editing if the removed field was being edited
                if model.get('editing_index') is not None:
                    if model['editing_index'] == idx:
                        model['editing_index'] = None
                        model['input_value'] = ''
                    elif model['editing_index'] > idx:
                        model['editing_index'] -= 1
                if full_class_name:
                    save_fields_to_dotfile(full_class_name, model['fields'])

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


def visualize(obj, model=None):
    """
    Render the object as HTML with configurable field inspection.

    Primitives (None, int, float, bool) render as repr.
    Objects render as a table of accessor → value with interactive controls.
    """
    if obj is None or isinstance(obj, int) or isinstance(obj, float):
        return repr(obj)

    if model is None:
        model = init_model(obj)

    full_class_name = _get_full_class_name(obj)

    field_trs = []

    for i, accessor_code in enumerate(model.get('fields', [])):
        if model.get('editing_index') == i:
            # This field is being edited: show input
            field_trs.append(_render_input_row(obj, model, is_editing=True, editing_index=i))
        else:
            # Normal display: double-clickable field name with remove button (left, hover-only)
            display_accessor, val_str = _eval_field(obj, accessor_code)
            click_event = repr(FieldClick(index=i))
            remove_event = repr(RemoveFieldClick(index=i))
            field_trs.append(
                f'<tr class="snc-hover-hidden-parent">'
                f'<td snc-mouse-down="{html.escape(remove_event)}" '
                f'style="color:{GRAY};cursor:pointer;opacity:0.5;user-select:none;'
                f'padding-right:2px;width:12px;" '
                f'title="Remove field">'
                f'<span class="snc-hover-hidden">\u00d7</span></td>'
                f'<td snc-mouse-down="{html.escape(click_event)}" '
                f'style="color:{BLUE};opacity:0.7;cursor:pointer;padding-right:8px;">'
                f'{html.escape(display_accessor)}</td>'
                f'<td>{html.escape(val_str)}</td>'
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
        f'<td></td>'
        f'<td class="snc-hover-hide-border" colspan=2 style="color:{GRAY};cursor:pointer;text-align:center;opacity:0.5;user-select:none;height:5px;border:1px solid {GRAY_HALF_ALPHA}">'
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
        _, val_str = _eval_field(obj, input_value)
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
            scroll_attr = ' data-snc-scroll-into-view' if is_selected else ''
            items.append(
                f'<div snc-mouse-down="{html.escape(select_event)}" '
                f'class="snc-dropdown-option"'
                f'{scroll_attr} '
                f'style="padding:2px 6px;cursor:pointer;color:{BLUE};white-space:nowrap;'
                f'background:{bg};"'
                f'>{html.escape(suggestion)}</div>'
            )
        suggestion_html = (
            f'<div class="snc-dropdown-panel" data-snc-dropdown-align="left" style="'
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
        extra_attrs += ' data-snc-select-all'
    input_html = (
        f'<span class="snc-dropdown-trigger" style="position:relative;display:inline-block;">'
        f'<input type="text" snc-input="{html.escape(input_event)}" '
        f'value="{html.escape(input_value)}" '
        f'placeholder=".field_name" '
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
        f'<td></td>'
        f'<td style="padding-right:8px;">'
        f'{input_html}'
        f'</td>'
        f'<td>{html.escape(val_str)}</td>'
        f'</tr>'
    )


def field_to_tr(obj, accessor_code):
    """Legacy field rendering (kept for reference, used by visualize internally)."""
    display_accessor, val_str = _eval_field(obj, accessor_code)
    return f'<tr><td style="color:{BLUE};opacity:0.7;">{html.escape(display_accessor)}</td><td>{html.escape(val_str)}</td></tr>\n'
