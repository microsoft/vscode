# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
import sys
from typing import Any, List, Optional, Tuple, Union

import attrs
import erdos._vendor.cattrs

from . import types as lsp_types

LSPAny = lsp_types.LSPAny
OptionalPrimitive = Optional[Union[bool, int, str, float]]

# Flag to ensure we only resolve forward references once.
_resolved_forward_references = False


def _resolve_forward_references() -> None:
    """Resolve forward references for faster processing with erdos._vendor.cattrs."""
    global _resolved_forward_references
    if not _resolved_forward_references:

        def _filter(p: Tuple[str, object]) -> bool:
            return isinstance(p[1], type) and attrs.has(p[1])

        # Creating a concrete list here because `resolve_types` mutates the provided map.
        items = list(filter(_filter, lsp_types.ALL_TYPES_MAP.items()))
        for _, value in items:
            if isinstance(value, type):
                attrs.resolve_types(value, lsp_types.ALL_TYPES_MAP, {})  # type: ignore
        _resolved_forward_references = True


def register_hooks(converter: erdos._vendor.cattrs.Converter) -> erdos._vendor.cattrs.Converter:
    _resolve_forward_references()
    converter = _register_capabilities_hooks(converter)
    converter = _register_required_structure_hooks(converter)
    return _register_custom_property_hooks(converter)


def _register_capabilities_hooks(converter: erdos._vendor.cattrs.Converter) -> erdos._vendor.cattrs.Converter:
    def _text_document_sync_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.TextDocumentSyncOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.TextDocumentSyncOptions)

    def _notebook_document_sync_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[
            lsp_types.NotebookDocumentSyncRegistrationOptions,
            lsp_types.NotebookDocumentSyncOptions,
        ]
    ]:
        if object_ is None:
            return None
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.NotebookDocumentSyncRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.NotebookDocumentSyncOptions)

    def _hover_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.HoverOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.HoverOptions)

    def _declaration_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.DeclarationRegistrationOptions,
        lsp_types.DeclarationOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.DeclarationRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.DeclarationOptions)

    def _definition_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.DefinitionOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.DefinitionOptions)

    def _type_definition_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.TypeDefinitionRegistrationOptions,
        lsp_types.TypeDefinitionOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.TypeDefinitionRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.TypeDefinitionOptions)

    def _implementation_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.ImplementationRegistrationOptions,
        lsp_types.ImplementationOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.ImplementationRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.ImplementationOptions)

    def _references_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.ReferenceOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.ReferenceOptions)

    def _position_encoding_hook(
        object_: Union[lsp_types.PositionEncodingKind, OptionalPrimitive], _: type
    ) -> Union[lsp_types.PositionEncodingKind, OptionalPrimitive]:
        return object_

    def _document_highlight_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.DocumentHighlightOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.DocumentHighlightOptions)

    def _document_symbol_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.DocumentSymbolOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.DocumentSymbolOptions)

    def _code_action_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.CodeActionOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.CodeActionOptions)

    def _color_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.DocumentColorRegistrationOptions,
        lsp_types.DocumentColorOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.DocumentColorRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.DocumentColorOptions)

    def _workspace_symbol_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.WorkspaceSymbolOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.WorkspaceSymbolOptions)

    def _document_formatting_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.DocumentFormattingOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.DocumentFormattingOptions)

    def _document_range_formatting_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.DocumentRangeFormattingOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.DocumentRangeFormattingOptions)

    def _rename_provider_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.RenameOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.RenameOptions)

    def _folding_range_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.FoldingRangeRegistrationOptions,
        lsp_types.FoldingRangeOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.FoldingRangeRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.FoldingRangeOptions)

    def _selection_range_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.SelectionRangeRegistrationOptions,
        lsp_types.SelectionRangeOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.SelectionRangeRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.SelectionRangeOptions)

    def _call_hierarchy_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.CallHierarchyRegistrationOptions,
        lsp_types.CallHierarchyOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.CallHierarchyRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.CallHierarchyOptions)

    def _linked_editing_range_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.LinkedEditingRangeRegistrationOptions,
        lsp_types.LinkedEditingRangeOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.LinkedEditingRangeRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.LinkedEditingRangeOptions)

    def _semantic_tokens_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.SemanticTokensRegistrationOptions,
        lsp_types.SemanticTokensOptions,
    ]:
        if object_ is None:
            return None
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.SemanticTokensRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.SemanticTokensOptions)

    def _moniker_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.MonikerRegistrationOptions,
        lsp_types.MonikerOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(object_, lsp_types.MonikerRegistrationOptions)
        else:
            return converter.structure(object_, lsp_types.MonikerOptions)

    def _type_hierarchy_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.TypeHierarchyRegistrationOptions,
        lsp_types.TypeHierarchyOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.TypeHierarchyRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.TypeHierarchyOptions)

    def _inline_value_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.InlineValueRegistrationOptions,
        lsp_types.InlineValueOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(
                object_, lsp_types.InlineValueRegistrationOptions
            )
        else:
            return converter.structure(object_, lsp_types.InlineValueOptions)

    def _inlay_hint_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.InlayHintRegistrationOptions,
        lsp_types.InlayHintOptions,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if "id" in object_:
            return converter.structure(object_, lsp_types.InlayHintRegistrationOptions)
        else:
            return converter.structure(object_, lsp_types.InlayHintOptions)

    def _inlay_hint_label_part_hook(
        object_: Any, _: type
    ) -> Union[str, List[lsp_types.InlayHintLabelPart]]:
        if isinstance(object_, str):
            return object_

        return [
            converter.structure(item, lsp_types.InlayHintLabelPart) for item in object_
        ]

    def _diagnostic_provider_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.DiagnosticRegistrationOptions,
        lsp_types.DiagnosticOptions,
    ]:
        if object_ is None:
            return None
        if "id" in object_:
            return converter.structure(object_, lsp_types.DiagnosticRegistrationOptions)
        else:
            return converter.structure(object_, lsp_types.DiagnosticOptions)

    def _save_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.SaveOptions]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.SaveOptions)

    def _code_action_hook(
        object_: Any, _: type
    ) -> Union[lsp_types.Command, lsp_types.CodeAction]:
        if "command" in object_:
            return converter.structure(object_, lsp_types.Command)
        else:
            return converter.structure(object_, lsp_types.CodeAction)

    def _completion_list_hook(
        object_: Any, _: type
    ) -> Optional[Union[lsp_types.CompletionList, List[lsp_types.CompletionItem]]]:
        if object_ is None:
            return None
        if isinstance(object_, list):
            return [
                converter.structure(item, lsp_types.CompletionItem) for item in object_
            ]
        else:
            return converter.structure(object_, lsp_types.CompletionList)

    def _location_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[
            lsp_types.Location,
            List[lsp_types.Location],
            List[lsp_types.LocationLink],
        ]
    ]:
        if object_ is None:
            return None
        if isinstance(object_, list):
            if len(object_) == 0:
                return []
            if "targetUri" in object_[0]:
                return [
                    converter.structure(item, lsp_types.LocationLink)
                    for item in object_
                ]
            else:
                return [
                    converter.structure(item, lsp_types.Location) for item in object_
                ]
        else:
            return converter.structure(object_, lsp_types.Location)

    def _symbol_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[List[lsp_types.DocumentSymbol], List[lsp_types.SymbolInformation]]
    ]:
        if object_ is None:
            return None
        if isinstance(object_, list):
            if len(object_) == 0:
                return []
            if "location" in object_[0]:
                return [
                    converter.structure(item, lsp_types.SymbolInformation)
                    for item in object_
                ]
            else:
                return [
                    converter.structure(item, lsp_types.DocumentSymbol)
                    for item in object_
                ]
        else:
            return None

    def _markup_content_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[
            OptionalPrimitive,
            lsp_types.MarkupContent,
            lsp_types.MarkedString_Type1,
            List[Union[OptionalPrimitive, lsp_types.MarkedString_Type1]],
        ]
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        if isinstance(object_, list):
            return [
                (
                    item
                    if isinstance(item, (bool, int, str, float))
                    else converter.structure(item, lsp_types.MarkedString_Type1)
                )
                for item in object_
            ]
        if "kind" in object_:
            return converter.structure(object_, lsp_types.MarkupContent)
        else:
            return converter.structure(object_, lsp_types.MarkedString_Type1)

    def _document_edit_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[
            lsp_types.TextDocumentEdit,
            lsp_types.CreateFile,
            lsp_types.RenameFile,
            lsp_types.DeleteFile,
        ]
    ]:
        if object_ is None:
            return None
        if "kind" in object_:
            if object_["kind"] == "create":
                return converter.structure(object_, lsp_types.CreateFile)
            elif object_["kind"] == "rename":
                return converter.structure(object_, lsp_types.RenameFile)
            elif object_["kind"] == "delete":
                return converter.structure(object_, lsp_types.DeleteFile)
            else:
                raise ValueError("Unknown edit kind: ", object_)
        else:
            return converter.structure(object_, lsp_types.TextDocumentEdit)

    def _semantic_tokens_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.SemanticTokensOptionsFullType1]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.SemanticTokensOptionsFullType1)

    def _semantic_tokens_capabilities_hook(
        object_: Any, _: type
    ) -> Union[
        OptionalPrimitive,
        lsp_types.SemanticTokensClientCapabilitiesRequestsTypeFullType1,
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(
            object_, lsp_types.SemanticTokensClientCapabilitiesRequestsTypeFullType1
        )

    def _code_action_kind_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.CodeActionKind]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.CodeActionKind)

    def _position_encoding_kind_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.PositionEncodingKind]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.PositionEncodingKind)

    def _folding_range_kind_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.FoldingRangeKind]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.FoldingRangeKind)

    def _semantic_token_types_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.SemanticTokenTypes]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.SemanticTokenTypes)

    def _semantic_token_modifiers_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.SemanticTokenModifiers]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.SemanticTokenModifiers)

    def _watch_kind_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.WatchKind]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.WatchKind)

    def _notebook_sync_option_selector_hook(
        object_: Any, _: type
    ) -> Union[
        lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType1,
        lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType2,
    ]:
        if "notebook" in object_:
            return converter.structure(
                object_, lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType1
            )
        else:
            return converter.structure(
                object_, lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType2
            )

    def _semantic_token_registration_options_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[OptionalPrimitive, lsp_types.SemanticTokensRegistrationOptionsFullType1]
    ]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(
            object_, lsp_types.SemanticTokensRegistrationOptionsFullType1
        )

    def _inline_completion_provider_hook(
        object_: Any, _: type
    ) -> Optional[Union[OptionalPrimitive, lsp_types.InlineCompletionOptions]]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.InlineCompletionOptions)

    def _inline_completion_list_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[lsp_types.InlineCompletionList, List[lsp_types.InlineCompletionItem]]
    ]:
        if object_ is None:
            return None
        if isinstance(object_, list):
            return [
                converter.structure(item, lsp_types.InlineCompletionItem)
                for item in object_
            ]
        return converter.structure(object_, lsp_types.InlineCompletionList)

    def _string_value_hook(
        object_: Any, _: type
    ) -> Union[OptionalPrimitive, lsp_types.StringValue]:
        if object_ is None:
            return None
        if isinstance(object_, (bool, int, str, float)):
            return object_
        return converter.structure(object_, lsp_types.StringValue)

    def _symbol_list_hook(
        object_: Any, _: type
    ) -> Optional[
        Union[List[lsp_types.SymbolInformation], List[lsp_types.WorkspaceSymbol]]
    ]:
        if object_ is None:
            return None
        assert isinstance(object_, list)
        if len(object_) == 0:
            return []
        if "deprecated" in object_[0]:
            return [
                converter.structure(item, lsp_types.SymbolInformation)
                for item in object_
            ]
        elif ("data" in object_[0]) or ("range" not in object_[0]["location"]):
            return [
                converter.structure(item, lsp_types.WorkspaceSymbol) for item in object_
            ]

        return [
            converter.structure(item, lsp_types.SymbolInformation) for item in object_
        ]

    def _notebook_sync_registration_option_selector_hook(
        object_: Any, _: type
    ) -> Union[
        lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType1,
        lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType2,
    ]:
        if "notebook" in object_:
            return converter.structure(
                object_,
                lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType1,
            )
        else:
            return converter.structure(
                object_,
                lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType2,
            )

    structure_hooks = [
        (
            Optional[
                Union[lsp_types.TextDocumentSyncOptions, lsp_types.TextDocumentSyncKind]
            ],
            _text_document_sync_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.NotebookDocumentSyncOptions,
                    lsp_types.NotebookDocumentSyncRegistrationOptions,
                ]
            ],
            _notebook_document_sync_hook,
        ),
        (Optional[Union[bool, lsp_types.HoverOptions]], _hover_provider_hook),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.DeclarationOptions,
                    lsp_types.DeclarationRegistrationOptions,
                ]
            ],
            _declaration_provider_hook,
        ),
        (Optional[Union[bool, lsp_types.DefinitionOptions]], _definition_provider_hook),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.TypeDefinitionOptions,
                    lsp_types.TypeDefinitionRegistrationOptions,
                ]
            ],
            _type_definition_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.ImplementationOptions,
                    lsp_types.ImplementationRegistrationOptions,
                ]
            ],
            _implementation_provider_hook,
        ),
        (Optional[Union[bool, lsp_types.ReferenceOptions]], _references_provider_hook),
        (
            Optional[Union[bool, lsp_types.DocumentHighlightOptions]],
            _document_highlight_provider_hook,
        ),
        (
            Optional[Union[bool, lsp_types.DocumentSymbolOptions]],
            _document_symbol_provider_hook,
        ),
        (
            Optional[Union[bool, lsp_types.CodeActionOptions]],
            _code_action_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.DocumentColorOptions,
                    lsp_types.DocumentColorRegistrationOptions,
                ]
            ],
            _color_provider_hook,
        ),
        (
            Optional[Union[bool, lsp_types.WorkspaceSymbolOptions]],
            _workspace_symbol_provider_hook,
        ),
        (
            Optional[Union[bool, lsp_types.DocumentFormattingOptions]],
            _document_formatting_provider_hook,
        ),
        (
            Optional[Union[bool, lsp_types.DocumentRangeFormattingOptions]],
            _document_range_formatting_provider_hook,
        ),
        (Optional[Union[bool, lsp_types.RenameOptions]], _rename_provider_hook),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.FoldingRangeOptions,
                    lsp_types.FoldingRangeRegistrationOptions,
                ]
            ],
            _folding_range_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.SelectionRangeOptions,
                    lsp_types.SelectionRangeRegistrationOptions,
                ]
            ],
            _selection_range_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.CallHierarchyOptions,
                    lsp_types.CallHierarchyRegistrationOptions,
                ]
            ],
            _call_hierarchy_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.LinkedEditingRangeOptions,
                    lsp_types.LinkedEditingRangeRegistrationOptions,
                ]
            ],
            _linked_editing_range_provider_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.SemanticTokensOptions,
                    lsp_types.SemanticTokensRegistrationOptions,
                ]
            ],
            _semantic_tokens_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool, lsp_types.MonikerOptions, lsp_types.MonikerRegistrationOptions
                ]
            ],
            _moniker_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.TypeHierarchyOptions,
                    lsp_types.TypeHierarchyRegistrationOptions,
                ]
            ],
            _type_hierarchy_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.InlineValueOptions,
                    lsp_types.InlineValueRegistrationOptions,
                ]
            ],
            _inline_value_provider_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.InlayHintOptions,
                    lsp_types.InlayHintRegistrationOptions,
                ]
            ],
            _inlay_hint_provider_hook,
        ),
        (
            Union[str, List[lsp_types.InlayHintLabelPart]],
            _inlay_hint_label_part_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.DiagnosticOptions, lsp_types.DiagnosticRegistrationOptions
                ]
            ],
            _diagnostic_provider_hook,
        ),
        (
            Optional[Union[lsp_types.SaveOptions, bool]],
            _save_hook,
        ),
        (
            Union[lsp_types.Command, lsp_types.CodeAction],
            _code_action_hook,
        ),
        (
            Optional[Union[List[lsp_types.CompletionItem], lsp_types.CompletionList]],
            _completion_list_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.Location,
                    List[lsp_types.Location],
                    List[lsp_types.LocationLink],
                ]
            ],
            _location_hook,
        ),
        (
            Optional[
                Union[List[lsp_types.SymbolInformation], List[lsp_types.DocumentSymbol]]
            ],
            _symbol_hook,
        ),
        (
            Union[
                lsp_types.MarkupContent,
                str,
                lsp_types.MarkedString_Type1,
                List[Union[str, lsp_types.MarkedString_Type1]],
            ],
            _markup_content_hook,
        ),
        (
            Union[
                lsp_types.TextDocumentEdit,
                lsp_types.CreateFile,
                lsp_types.RenameFile,
                lsp_types.DeleteFile,
            ],
            _document_edit_hook,
        ),
        (
            Optional[Union[bool, lsp_types.SemanticTokensOptionsFullType1]],
            _semantic_tokens_hook,
        ),
        (
            Optional[
                Union[
                    bool,
                    lsp_types.SemanticTokensClientCapabilitiesRequestsTypeFullType1,
                ]
            ],
            _semantic_tokens_capabilities_hook,
        ),
        (
            Optional[Union[str, lsp_types.MarkupContent]],
            _markup_content_hook,
        ),
        (
            Optional[Union[lsp_types.CodeActionKind, str]],
            _code_action_kind_hook,
        ),
        (
            Union[lsp_types.CodeActionKind, str],
            _code_action_kind_hook,
        ),
        (
            Union[lsp_types.PositionEncodingKind, str],
            _position_encoding_kind_hook,
        ),
        (
            Optional[Union[lsp_types.FoldingRangeKind, str]],
            _folding_range_kind_hook,
        ),
        (
            Union[lsp_types.FoldingRangeKind, str],
            _folding_range_kind_hook,
        ),
        (
            Union[lsp_types.SemanticTokenTypes, str],
            _semantic_token_types_hook,
        ),
        (
            Optional[Union[lsp_types.SemanticTokenTypes, str]],
            _semantic_token_types_hook,
        ),
        (
            Union[lsp_types.SemanticTokenModifiers, str],
            _semantic_token_modifiers_hook,
        ),
        (
            Optional[Union[lsp_types.SemanticTokenModifiers, str]],
            _semantic_token_modifiers_hook,
        ),
        (
            Union[lsp_types.WatchKind, int],
            _watch_kind_hook,
        ),
        (
            Optional[Union[lsp_types.WatchKind, int]],
            _watch_kind_hook,
        ),
        (
            Union[
                lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType1,
                lsp_types.NotebookDocumentSyncOptionsNotebookSelectorType2,
            ],
            _notebook_sync_option_selector_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.PositionEncodingKind,
                    str,
                ]
            ],
            _position_encoding_hook,
        ),
        (
            Optional[Union[bool, lsp_types.SemanticTokensRegistrationOptionsFullType1]],
            _semantic_token_registration_options_hook,
        ),
        (
            Optional[Union[bool, lsp_types.InlineCompletionOptions]],
            _inline_completion_provider_hook,
        ),
        (
            Optional[
                Union[
                    lsp_types.InlineCompletionList, List[lsp_types.InlineCompletionItem]
                ]
            ],
            _inline_completion_list_hook,
        ),
        (
            Union[str, lsp_types.StringValue],
            _string_value_hook,
        ),
        (
            Optional[
                Union[
                    List[lsp_types.SymbolInformation], List[lsp_types.WorkspaceSymbol]
                ]
            ],
            _symbol_list_hook,
        ),
        (
            Union[
                lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType1,
                lsp_types.NotebookDocumentSyncRegistrationOptionsNotebookSelectorType2,
            ],
            _notebook_sync_registration_option_selector_hook,
        ),
    ]
    for type_, hook in structure_hooks:
        converter.register_structure_hook(type_, hook)
    return converter


def _register_required_structure_hooks(
    converter: erdos._vendor.cattrs.Converter,
) -> erdos._vendor.cattrs.Converter:
    def _lsp_object_hook(object_: Any, type_: type) -> Any:
        return object_

    def _parameter_information_label_hook(
        object_: Any, type: type
    ) -> Union[str, Tuple[int, int]]:
        if isinstance(object_, str):
            return object_
        else:
            return (int(object_[0]), int(object_[1]))

    def _text_document_filter_hook(
        object_: Any, _: type
    ) -> Union[
        str,
        lsp_types.TextDocumentFilter_Type1,
        lsp_types.TextDocumentFilter_Type2,
        lsp_types.TextDocumentFilter_Type3,
        lsp_types.NotebookCellTextDocumentFilter,
    ]:
        if isinstance(object_, str):
            return str(object_)
        elif "notebook" in object_:
            return converter.structure(
                object_, lsp_types.NotebookCellTextDocumentFilter
            )
        elif "language" in object_:
            return converter.structure(object_, lsp_types.TextDocumentFilter_Type1)
        elif "scheme" in object_:
            return converter.structure(object_, lsp_types.TextDocumentFilter_Type2)
        else:
            return converter.structure(object_, lsp_types.TextDocumentFilter_Type3)

    def _notebook_filter_hook(
        object_: Any, _: type
    ) -> Union[
        str,
        lsp_types.NotebookDocumentFilter_Type1,
        lsp_types.NotebookDocumentFilter_Type2,
        lsp_types.NotebookDocumentFilter_Type3,
    ]:
        if isinstance(object_, str):
            return str(object_)
        elif "notebookType" in object_:
            return converter.structure(object_, lsp_types.NotebookDocumentFilter_Type1)
        elif "scheme" in object_:
            return converter.structure(object_, lsp_types.NotebookDocumentFilter_Type2)
        else:
            return converter.structure(object_, lsp_types.NotebookDocumentFilter_Type3)

    # TODO: Remove the ignore after this issue with attrs is addressed in either attrs or mypy
    NotebookSelectorItem = attrs.fields(
        lsp_types.NotebookCellTextDocumentFilter
    ).notebook.type
    STRUCTURE_HOOKS = [
        (type(None), lambda object_, _type: object_),
        (Optional[Union[int, str]], lambda object_, _type: object_),
        (Union[int, str], lambda object_, _type: object_),
        (lsp_types.LSPAny, _lsp_object_hook),
        (Optional[Union[str, bool]], lambda object_, _type: object_),
        (Optional[Union[bool, Any]], lambda object_, _type: object_),
        (
            Union[
                lsp_types.TextDocumentFilter_Type1,
                lsp_types.TextDocumentFilter_Type2,
                lsp_types.TextDocumentFilter_Type3,
                lsp_types.NotebookCellTextDocumentFilter,
            ],
            _text_document_filter_hook,
        ),
        (lsp_types.DocumentFilter, _text_document_filter_hook),
        (
            Union[
                str,
                lsp_types.NotebookDocumentFilter_Type1,
                lsp_types.NotebookDocumentFilter_Type2,
                lsp_types.NotebookDocumentFilter_Type3,
            ],
            _notebook_filter_hook,
        ),
        (NotebookSelectorItem, _notebook_filter_hook),
        (
            Union[lsp_types.LSPObject, List["LSPAny"], str, int, float, bool, None],
            _lsp_object_hook,
        ),
        (
            Union[
                lsp_types.LSPObject, List[lsp_types.LSPAny], str, int, float, bool, None
            ],
            _lsp_object_hook,
        ),
        (
            Union[str, Tuple[int, int]],
            _parameter_information_label_hook,
        ),
        (lsp_types.LSPObject, _lsp_object_hook),
    ]

    if sys.version_info > (3, 8):
        STRUCTURE_HOOKS += [
            (
                Union[
                    lsp_types.LSPObject,
                    List[
                        Union[
                            lsp_types.LSPObject,
                            List["LSPAny"],
                            str,
                            int,
                            float,
                            bool,
                            None,
                        ]
                    ],
                    str,
                    int,
                    float,
                    bool,
                    None,
                ],
                _lsp_object_hook,
            )
        ]

    for type_, hook in STRUCTURE_HOOKS:
        converter.register_structure_hook(type_, hook)

    return converter


def _register_custom_property_hooks(converter: erdos._vendor.cattrs.Converter) -> erdos._vendor.cattrs.Converter:
    def _to_camel_case(name: str) -> str:
        # TODO: when min Python becomes >= 3.9, then update this to:
        # `return name.removesuffix("_")`.
        new_name = name[:-1] if name.endswith("_") else name
        parts = new_name.split("_")
        return parts[0] + "".join(p.title() for p in parts[1:])

    def _omit(cls: type, prop: str) -> bool:
        special = lsp_types.is_special_property(cls, prop)
        return not special

    def _with_custom_unstructure(cls: type) -> Any:
        attributes = {
            a.name: erdos._vendor.cattrs.gen.override(
                rename=_to_camel_case(a.name),
                omit_if_default=_omit(cls, a.name),
            )
            for a in attrs.fields(cls)
        }
        return erdos._vendor.cattrs.gen.make_dict_unstructure_fn(cls, converter, **attributes)

    def _with_custom_structure(cls: type) -> Any:
        attributes = {
            a.name: erdos._vendor.cattrs.gen.override(
                rename=_to_camel_case(a.name),
                omit_if_default=_omit(cls, a.name),
            )
            for a in attrs.fields(cls)
        }
        return erdos._vendor.cattrs.gen.make_dict_structure_fn(cls, converter, **attributes)

    converter.register_unstructure_hook_factory(attrs.has, _with_custom_unstructure)
    converter.register_structure_hook_factory(attrs.has, _with_custom_structure)
    return converter
