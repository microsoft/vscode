"""Object visualizer for Sculpt-n-Code. z because that makes it last in priority"""

# import json
# import re
import html

# VS Code theme colors
BLUE = "#569cd6"
# STRING = "#ce9178"


def can_visualize(value):
    return True

TRIVIAL_NAMES = set(dir(object()))

DEFAULT_FIELDS_FOR_TYPE = {
    're.Match': ['[0]', '.start(0)', '.end(0)'],
}

def visualize(obj):
    if obj is None or isinstance(obj, int) or isinstance(obj, float): # Bools are also ints *shrug*
        return repr(obj)

    full_class_name = obj.__class__.__module__ + '.' + obj.__class__.__qualname__

    shown_fields = DEFAULT_FIELDS_FOR_TYPE.get(full_class_name, None)
    if shown_fields is None:
        shown_fields = [f".{name}" for name in dir(obj) if name not in TRIVIAL_NAMES]

    field_trs = []

    for accessor_code in shown_fields:
        field_trs.append(field_to_tr(obj, accessor_code))

    field_trs_str = '\n'.join(field_trs)

    return f"""
        <div style="font-family: monospace; overflow-x: auto">
            <h4 style="color:{BLUE};margin:0">{html.escape(full_class_name)} {html.escape(repr(obj))}</h3>
            <table>
                {field_trs_str}
            </table>
        </div>
    """

def field_to_tr(obj, accessor_code):
    try:
        val = eval(f"obj{accessor_code}")
        val_str = None
    except Exception as e:
        val = None
        val_str = f'{e}'

    if val_str is None:
        if callable(val):
            # try:
            #     arg_count = val.__code__.co_argcount
            # except AttributeError:
            #     arg_count = float("inf")

            accessor_code += getattr(val, '__text_signature__', None) or '(...)'
            val_str = val.__doc__.split('\n', 1)[0] if val.__doc__ else None

    if val_str is None:
        val_str = repr(val)[:200]

    return f"""<tr><td style="color:{BLUE};opacity:0.7;">{html.escape(accessor_code)}</td><td>{html.escape(val_str)}</td></tr>\n"""
