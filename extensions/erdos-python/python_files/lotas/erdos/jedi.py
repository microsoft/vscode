#
# Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
# Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
#

import os
import pathlib
import platform
from functools import cached_property
from pathlib import Path
from typing import Any, Callable, Iterable, List, Optional, Tuple, Union

from IPython.core import oinspect

from ._vendor.jedi import settings
from ._vendor.jedi.api import Completion as CompletionAPI
from ._vendor.jedi.api import Interpreter, strings
from ._vendor.jedi.api import completion as completion_api
from ._vendor.jedi.api.classes import BaseName, BaseSignature, Completion, Name
from ._vendor.jedi.api.interpreter import MixedTreeName
from ._vendor.jedi.cache import memoize_method
from ._vendor.jedi.inference import InferenceState
from ._vendor.jedi.inference.base_value import HasNoContext, Value, ValueSet, ValueWrapper
from ._vendor.jedi.inference.compiled import ExactValue, create_simple_object
from ._vendor.jedi.inference.compiled.access import create_access_path
from ._vendor.jedi.inference.compiled.mixed import MixedName, MixedObject
from ._vendor.jedi.inference.compiled.value import (
    CompiledName,
    CompiledValue,
    create_from_access_path,
)
from ._vendor.jedi.inference.context import ModuleContext, ValueContext
from ._vendor.jedi.inference.helpers import infer_call_of_leaf
from ._vendor.parso.tree import Leaf
from .inspectors import (
    BaseColumnInspector,
    BaseTableInspector,
    ErdosInspector,
    get_inspector,
)
from .utils import get_qualname

if platform.system().lower() == "windows":
    _cache_directory = pathlib.Path(os.getenv("LOCALAPPDATA") or "~") / "Jedi" / "Erdos-Jedi"
elif platform.system().lower() == "darwin":
    _cache_directory = pathlib.Path("~") / "Library" / "Caches" / "Erdos-Jedi"
else:
    _cache_directory = pathlib.Path(os.getenv("XDG_CACHE_HOME") or "~/.cache") / "erdos-jedi"
settings.cache_directory = _cache_directory.expanduser()

_original_interpreter_complete = Interpreter.complete
_original_interpreter_goto = Interpreter.goto
_original_interpreter_help = Interpreter.help
_original_interpreter_infer = Interpreter.infer
_original_completion_api_complete = CompletionAPI.complete
_original_mixed_name_infer = MixedName.infer
_original_mixed_tree_name_infer = MixedTreeName.infer


def _interpreter_complete(
    self: Interpreter,
    line: Optional[int] = None,
    column: Optional[int] = None,
    *,
    fuzzy: bool = False,
) -> List["_ErdosCompletion"]:
    return [
        _ErdosCompletion(name)
        for name in _original_interpreter_complete(self, line, column, fuzzy=fuzzy)
    ]


def _interpreter_goto(
    self: Interpreter,
    line: Optional[int] = None,
    column: Optional[int] = None,
    *,
    follow_imports: bool = False,
    follow_builtin_imports: bool = False,
    only_stubs: bool = False,
    prefer_stubs: bool = False,
) -> List["_ErdosName"]:
    return [
        _ErdosName(name)
        for name in _original_interpreter_goto(
            self,
            line,
            column,
            follow_imports=follow_imports,
            follow_builtin_imports=follow_builtin_imports,
            only_stubs=only_stubs,
            prefer_stubs=prefer_stubs,
        )
    ]


def _interpreter_help(
    self: Interpreter, line: Optional[int] = None, column: Optional[int] = None
) -> List["_ErdosName"]:
    return [_ErdosName(name) for name in _original_interpreter_help(self, line, column)]


def _interpreter_infer(
    self: Interpreter,
    line: Optional[int] = None,
    column: Optional[int] = None,
    *,
    only_stubs=False,
    prefer_stubs=False,
) -> List["_ErdosName"]:
    return [
        _ErdosName(name)
        for name in _original_interpreter_infer(
            self, line, column, only_stubs=only_stubs, prefer_stubs=prefer_stubs
        )
    ]


def _completion_api_complete(self: CompletionAPI) -> List[Completion]:
    leaf = self._module_node.get_leaf_for_position(self._original_position, include_prefixes=True)
    string, start_leaf, quote = completion_api._extract_string_while_in_string(
        leaf, self._original_position
    )

    if string is not None and start_leaf is not None and quote is not None:
        prefixed_string = quote + string
        cut_end_quote = strings.get_quote_ending(
            prefixed_string, self._code_lines, self._original_position, invert_result=True
        )

        completions = _complete_environment_variables(
            start_leaf,
            self._module_context,
            self._inference_state,
            prefixed_string,
            cut_end_quote,
            self._signatures_callback,
            self._original_position,
            fuzzy=self._fuzzy,
        )
        if completions:
            return completions

    return _original_completion_api_complete(self)


def _complete_environment_variables(
    leaf: Leaf,
    module_context: ModuleContext,
    inference_state: InferenceState,
    string: str,
    cut_end_quote: str,
    signatures_callback: Callable[[int, int], List[BaseSignature]],
    position: Tuple[int, int],
    *,
    fuzzy: bool,
) -> List[Completion]:
    def complete():
        access_path = create_access_path(inference_state, os.environ)
        compiled_value = create_from_access_path(inference_state, access_path)
        dicts = ValueSet([_OsEnvironCompiledValueWrapper(compiled_value)])

        return list(_completions_for_dicts(inference_state, dicts, string, cut_end_quote, fuzzy))

    if (
        isinstance(bracket := leaf.get_previous_leaf(), Leaf)
        and bracket.type == "operator"
        and bracket.value == "["
        and isinstance(name := bracket.get_previous_leaf(), Leaf)
        and name.type == "name"
        and name.value == "environ"
        and (context := module_context.create_context(bracket))
        and (values := infer_call_of_leaf(context, name))
        and all(_is_os_environ(value) for value in values)
    ):
        return complete()

    signatures = signatures_callback(*position)
    if signatures and all(s.full_name == "os.getenv" for s in signatures):
        if leaf.type == "error_leaf":
            if (
                isinstance(operator := leaf.get_previous_leaf(), Leaf)
                and operator.type == "operator"
                and (
                    (
                        operator.value == "="
                        and isinstance(name := operator.get_previous_leaf(), Leaf)
                        and name.type == "name"
                        and name.value == "key"
                    )
                    or (operator.value == "(")
                )
            ):
                return complete()
            return []

        if leaf.parent is not None and (
            leaf.parent.type == "trailer"
            or ((arglist := leaf.parent).type == "arglist" and arglist.children.index(leaf) == 0)
            or (
                (argument := leaf.parent).type == "argument"
                and len(argument.children) >= 1
                and isinstance(name := argument.children[0], Leaf)
                and name.type == "name"
                and name.value == "key"
            )
        ):
            return complete()

    return []


class _OsEnvironCompiledValueWrapper(ValueWrapper):
    @property
    def array_type(self) -> str:
        return "dict"


def _mixed_name_infer(self: MixedName) -> ValueSet:
    return ValueSet(_wrap_value(value) for value in _original_mixed_name_infer(self))


def _wrap_value(value: MixedObject):
    if _is_os_environ(value) or _is_pandas_dataframe(value) or _is_pandas_series(value):
        return _SafeDictLikeMixedObjectWrapper(value)
    if _is_polars_dataframe(value):
        return _PolarsDataFrameMixedObjectWrapper(value)
    return value


def _is_os_environ(value: Union[MixedObject, Value]) -> bool:
    return value.get_root_context().py__name__() == "os" and value.py__name__() == "_Environ"


def _is_pandas_dataframe(value: Union[MixedObject, Value]) -> bool:
    return (
        value.get_root_context().py__name__() == "pandas.core.frame"
        and value.py__name__() == "DataFrame"
    )


def _is_pandas_series(value: Union[MixedObject, Value]) -> bool:
    return (
        value.get_root_context().py__name__() == "pandas.core.series"
        and value.py__name__() == "Series"
    )


def _is_polars_dataframe(value: Union[MixedObject, Value]) -> bool:
    return (
        value.get_root_context().py__name__() == "polars.dataframe.frame"
        and value.py__name__() == "DataFrame"
    )


class _SafeDictLikeMixedObjectWrapper(ValueWrapper):
    _wrapped_value: MixedObject
    compiled_value: CompiledValue

    def __init__(self, wrapped_value: MixedObject) -> None:
        super().__init__(wrapped_value)

        self.array_type = "dict"

    def py__simple_getitem__(self, index) -> ValueSet:
        return self.compiled_value.py__simple_getitem__(index)


class _PolarsDataFrameMixedObjectWrapper(_SafeDictLikeMixedObjectWrapper):
    def get_key_values(self):
        for column in _directly_access_compiled_value(self.compiled_value).columns:
            yield create_simple_object(self._wrapped_value.inference_state, column)


def _directly_access_compiled_value(compiled_value: CompiledValue) -> Any:
    return compiled_value.access_handle.access._obj


def _mixed_tree_name_infer(self: MixedTreeName) -> ValueSet:
    for compiled_value in self.parent_context.mixed_values:
        for f in compiled_value.get_filters():
            values = ValueSet.from_sets(n.infer() for n in f.get(self.string_name))
            if values:
                return values

    return _original_mixed_tree_name_infer(self)


class _ErdosName(Name):
    def __init__(self, name: BaseName) -> None:
        super().__init__(name._inference_state, name._name)

        self._wrapped_name = name

    @cached_property
    def _inspector(self) -> Optional[ErdosInspector]:
        name = self._wrapped_name._name
        if isinstance(name, (CompiledName, MixedName)):
            value = name.infer_compiled_value()
            if isinstance(value, CompiledValue):
                obj = _directly_access_compiled_value(value)
                return get_inspector(obj)
        return None

    @property
    def full_name(self) -> Optional[str]:
        if self._inspector:
            return get_qualname(self._inspector.value)
        return super().full_name

    @property
    def description(self) -> str:
        if self._inspector:
            return self._inspector.get_display_type()
        return super().description

    @property
    def module_path(self) -> Optional[Path]:
        if self._inspector:
            fname = oinspect.find_file(self._inspector.value)
            if fname is not None:
                return Path(os.path.normcase(fname))

        module_path = super().module_path
        if module_path is not None:
            return Path(os.path.normcase(module_path))

        return None

    def docstring(self, raw=False, fast=True) -> str:
        if self._inspector:
            if isinstance(self._inspector, (BaseColumnInspector, BaseTableInspector)):
                return str(self._inspector.value)

            return self._inspector.value.__doc__ or ""

        return super().docstring(raw=raw)

    def get_signatures(self) -> List[BaseSignature]:
        if isinstance(self._inspector, (BaseColumnInspector, BaseTableInspector)):
            return []
        return super().get_signatures()


class _ErdosCompletion(_ErdosName):
    def __init__(self, completion: Completion) -> None:
        super().__init__(completion)

        self._wrapped_completion = completion

    @property
    def complete(self) -> Optional[str]:
        if os.name == "nt" and self._name.api_type == "path":
            name = self._name.string_name.replace(os.path.sep, "\\" + os.path.sep)
            return name[self._wrapped_completion._like_name_length :]

        return self._wrapped_completion.complete


class _DictKeyName(CompiledName):
    def __init__(
        self,
        inference_state: InferenceState,
        parent_value: CompiledValue,
        name: str,
        is_descriptor: bool,
        key: Any,
    ):
        self._inference_state = inference_state
        try:
            self.parent_context = parent_value.as_context()
        except HasNoContext:
            self.parent_context = ValueContext(parent_value)
        self._parent_value = parent_value
        self.string_name = name
        self.is_descriptor = is_descriptor
        self._key = key

    @memoize_method
    def infer_compiled_value(self) -> Optional[CompiledValue]:
        for value in self._parent_value.py__simple_getitem__(self._key):
            if isinstance(value, ExactValue):
                return value._compiled_value
            return value
        return None


def _completions_for_dicts(
    inference_state: InferenceState,
    dicts: Iterable[CompiledValue],
    literal_string: str,
    cut_end_quote: str,
    fuzzy: bool,
) -> Iterable[Completion]:
    for dct in dicts:
        if dct.array_type == "dict":
            for key in dct.get_key_values():
                if key:
                    dict_key = key.get_safe_value(default=strings._sentinel)
                    if dict_key is not strings._sentinel:
                        dict_key_str = strings._create_repr_string(literal_string, dict_key)
                        if dict_key_str.startswith(literal_string):
                            string_name = dict_key_str[: -len(cut_end_quote) or None]
                            name = _DictKeyName(inference_state, dct, string_name, False, dict_key)
                            yield Completion(
                                inference_state,
                                name,
                                stack=None,
                                like_name_length=len(literal_string),
                                is_fuzzy=fuzzy,
                            )


def apply_jedi_patches():
    Interpreter.complete = _interpreter_complete
    Interpreter.goto = _interpreter_goto
    Interpreter.help = _interpreter_help
    Interpreter.infer = _interpreter_infer
    CompletionAPI.complete = _completion_api_complete
    MixedName.infer = _mixed_name_infer
    MixedTreeName.infer = _mixed_tree_name_infer
    strings._completions_for_dicts = _completions_for_dicts




















