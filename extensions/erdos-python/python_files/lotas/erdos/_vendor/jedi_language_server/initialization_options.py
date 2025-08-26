"""Module containing the InitializationOptions parser.

Provides a fully defaulted pydantic model for this language server's
initialization options.
"""

import re
import sys
from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any, List, Optional, Pattern, Set

from lotas.erdos._vendor.cattrs import Converter
from lotas.erdos._vendor.cattrs.gen import make_dict_structure_fn, override
from lotas.erdos._vendor.lsprotocol.types import MarkupKind

if sys.version_info >= (3, 10):
    light_dataclass = dataclass(kw_only=True, eq=False, match_args=False)
else:
    light_dataclass = dataclass(eq=False)


@light_dataclass
class CodeAction:
    name_extract_variable: str = "jls_extract_var"
    name_extract_function: str = "jls_extract_def"


@light_dataclass
class Completion:
    disable_snippets: bool = False
    resolve_eagerly: bool = False
    ignore_patterns: List[Pattern[str]] = field(default_factory=list)


@light_dataclass
class Diagnostics:
    enable: bool = True
    did_open: bool = True
    did_save: bool = True
    did_change: bool = True


@light_dataclass
class HoverDisableOptions:
    all: bool = False
    names: Set[str] = field(default_factory=set)
    full_names: Set[str] = field(default_factory=set)


@light_dataclass
class HoverDisable:
    """All Attributes have _ appended to avoid syntax conflicts.

    For example, the keyword class would have required a special case.
    To get around this, I decided it's simpler to always assume an
    underscore at the end.
    """

    keyword_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    module_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    class_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    instance_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    function_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    param_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    path_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    property_: HoverDisableOptions = field(default_factory=HoverDisableOptions)
    statement_: HoverDisableOptions = field(
        default_factory=HoverDisableOptions
    )


@light_dataclass
class Hover:
    enable: bool = True
    disable: HoverDisable = field(default_factory=HoverDisable)


@light_dataclass
class JediSettings:
    auto_import_modules: List[str] = field(default_factory=list)
    case_insensitive_completion: bool = True
    debug: bool = False


@light_dataclass
class Symbols:
    ignore_folders: List[str] = field(
        default_factory=lambda: [".nox", ".tox", ".venv", "__pycache__"]
    )
    max_symbols: int = 20


@light_dataclass
class Workspace:
    environment_path: Optional[str] = None
    extra_paths: List[str] = field(default_factory=list)
    symbols: Symbols = field(default_factory=Symbols)


@light_dataclass
class InitializationOptions:
    code_action: CodeAction = field(default_factory=CodeAction)
    completion: Completion = field(default_factory=Completion)
    diagnostics: Diagnostics = field(default_factory=Diagnostics)
    hover: Hover = field(default_factory=Hover)
    jedi_settings: JediSettings = field(default_factory=JediSettings)
    markup_kind_preferred: Optional[MarkupKind] = None
    workspace: Workspace = field(default_factory=Workspace)


initialization_options_converter = Converter()

WEIRD_NAMES = {
    "keyword_": "keyword",
    "module_": "module",
    "class_": "class",
    "instance_": "instance",
    "function_": "function",
    "param_": "param",
    "path_": "path",
    "property_": "property",
    "statement_ ": "statement",
}


def convert_class_keys(string: str) -> str:
    """Convert from snake_case to camelCase.

    Also handles random special cases for keywords.
    """
    if string in WEIRD_NAMES:
        return WEIRD_NAMES[string]
    return "".join(
        word.capitalize() if idx > 0 else word
        for idx, word in enumerate(string.split("_"))
    )


def structure(cls: type) -> Any:
    """Hook to convert names when marshalling initialization_options."""
    return make_dict_structure_fn(
        cls,
        initialization_options_converter,
        **{  # type: ignore[arg-type]
            a.name: override(rename=convert_class_keys(a.name))
            for a in fields(cls)
        },
    )


initialization_options_converter.register_structure_hook_factory(
    is_dataclass, structure
)


initialization_options_converter.register_structure_hook_factory(
    lambda x: x == Pattern[str],
    lambda _: lambda x, _: re.compile(x),
)

initialization_options_converter.register_unstructure_hook_factory(
    lambda x: x == Pattern[str],
    lambda _: lambda x: x.pattern,
)
