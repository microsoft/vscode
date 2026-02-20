"""List visualizer for Sculpt-n-Code."""

import html
from typing import Any, List, Tuple

# VS Code theme colors
BLUE = "#569cd6"
STRING = "#ce9178"
GRAY = "#808080"


def item_html(item, get_visualizer):
    vis = get_visualizer(item)

    return vis.visualize(item, vis.init_model(item), get_visualizer)

def can_visualize(value):
    return isinstance(value, list)

def init_model(lst):
    return None

def visualize(lst: list, model, get_visualizer):
    items_html = '\n'.join(item_html(item, get_visualizer) for item in lst)

    return f'[{items_html}]'

def update(event, source_code: str, source_line: int, model: Any, value) -> Tuple[Any, List[Any]]:
    return (model, [])

# START HERE start the composition process. work on ORFs
