# GENERATED FROM scripts/gen-client.py -- DO NOT EDIT
# flake8: noqa
from concurrent.futures import Future
from lotas.erdos._vendor.lsprotocol import types
from lotas.erdos._vendor.pygls.client import JsonRPCClient
from lotas.erdos._vendor.pygls.protocol import LanguageServerProtocol
from lotas.erdos._vendor.pygls.protocol import default_converter
from typing import Any
from typing import Callable
from typing import List
from typing import Optional
from typing import Union


class BaseLanguageClient(JsonRPCClient):

    def __init__(
        self,
        name: str,
        version: str,
        protocol_cls=LanguageServerProtocol,
        converter_factory=default_converter,
        **kwargs,
    ):
        self.name = name
        self.version = version
        super().__init__(protocol_cls, converter_factory, **kwargs)

    def call_hierarchy_incoming_calls(
        self,
        params: types.CallHierarchyIncomingCallsParams,
        callback: Optional[Callable[[Optional[List[types.CallHierarchyIncomingCall]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`callHierarchy/incomingCalls` request.

        A request to resolve the incoming calls for a given `CallHierarchyItem`.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("callHierarchy/incomingCalls", params, callback)

    async def call_hierarchy_incoming_calls_async(
        self,
        params: types.CallHierarchyIncomingCallsParams,
    ) -> Optional[List[types.CallHierarchyIncomingCall]]:
        """Make a :lsp:`callHierarchy/incomingCalls` request.

        A request to resolve the incoming calls for a given `CallHierarchyItem`.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("callHierarchy/incomingCalls", params)

    def call_hierarchy_outgoing_calls(
        self,
        params: types.CallHierarchyOutgoingCallsParams,
        callback: Optional[Callable[[Optional[List[types.CallHierarchyOutgoingCall]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`callHierarchy/outgoingCalls` request.

        A request to resolve the outgoing calls for a given `CallHierarchyItem`.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("callHierarchy/outgoingCalls", params, callback)

    async def call_hierarchy_outgoing_calls_async(
        self,
        params: types.CallHierarchyOutgoingCallsParams,
    ) -> Optional[List[types.CallHierarchyOutgoingCall]]:
        """Make a :lsp:`callHierarchy/outgoingCalls` request.

        A request to resolve the outgoing calls for a given `CallHierarchyItem`.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("callHierarchy/outgoingCalls", params)

    def code_action_resolve(
        self,
        params: types.CodeAction,
        callback: Optional[Callable[[types.CodeAction], None]] = None,
    ) -> Future:
        """Make a :lsp:`codeAction/resolve` request.

        Request to resolve additional information for a given code action.The request's
        parameter is of type {@link CodeAction} the response
        is of type {@link CodeAction} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("codeAction/resolve", params, callback)

    async def code_action_resolve_async(
        self,
        params: types.CodeAction,
    ) -> types.CodeAction:
        """Make a :lsp:`codeAction/resolve` request.

        Request to resolve additional information for a given code action.The request's
        parameter is of type {@link CodeAction} the response
        is of type {@link CodeAction} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("codeAction/resolve", params)

    def code_lens_resolve(
        self,
        params: types.CodeLens,
        callback: Optional[Callable[[types.CodeLens], None]] = None,
    ) -> Future:
        """Make a :lsp:`codeLens/resolve` request.

        A request to resolve a command for a given code lens.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("codeLens/resolve", params, callback)

    async def code_lens_resolve_async(
        self,
        params: types.CodeLens,
    ) -> types.CodeLens:
        """Make a :lsp:`codeLens/resolve` request.

        A request to resolve a command for a given code lens.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("codeLens/resolve", params)

    def completion_item_resolve(
        self,
        params: types.CompletionItem,
        callback: Optional[Callable[[types.CompletionItem], None]] = None,
    ) -> Future:
        """Make a :lsp:`completionItem/resolve` request.

        Request to resolve additional information for a given completion item.The request's
        parameter is of type {@link CompletionItem} the response
        is of type {@link CompletionItem} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("completionItem/resolve", params, callback)

    async def completion_item_resolve_async(
        self,
        params: types.CompletionItem,
    ) -> types.CompletionItem:
        """Make a :lsp:`completionItem/resolve` request.

        Request to resolve additional information for a given completion item.The request's
        parameter is of type {@link CompletionItem} the response
        is of type {@link CompletionItem} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("completionItem/resolve", params)

    def document_link_resolve(
        self,
        params: types.DocumentLink,
        callback: Optional[Callable[[types.DocumentLink], None]] = None,
    ) -> Future:
        """Make a :lsp:`documentLink/resolve` request.

        Request to resolve additional information for a given document link. The request's
        parameter is of type {@link DocumentLink} the response
        is of type {@link DocumentLink} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("documentLink/resolve", params, callback)

    async def document_link_resolve_async(
        self,
        params: types.DocumentLink,
    ) -> types.DocumentLink:
        """Make a :lsp:`documentLink/resolve` request.

        Request to resolve additional information for a given document link. The request's
        parameter is of type {@link DocumentLink} the response
        is of type {@link DocumentLink} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("documentLink/resolve", params)

    def initialize(
        self,
        params: types.InitializeParams,
        callback: Optional[Callable[[types.InitializeResult], None]] = None,
    ) -> Future:
        """Make a :lsp:`initialize` request.

        The initialize request is sent from the client to the server.
        It is sent once as the request after starting up the server.
        The requests parameter is of type {@link InitializeParams}
        the response if of type {@link InitializeResult} of a Thenable that
        resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("initialize", params, callback)

    async def initialize_async(
        self,
        params: types.InitializeParams,
    ) -> types.InitializeResult:
        """Make a :lsp:`initialize` request.

        The initialize request is sent from the client to the server.
        It is sent once as the request after starting up the server.
        The requests parameter is of type {@link InitializeParams}
        the response if of type {@link InitializeResult} of a Thenable that
        resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("initialize", params)

    def inlay_hint_resolve(
        self,
        params: types.InlayHint,
        callback: Optional[Callable[[types.InlayHint], None]] = None,
    ) -> Future:
        """Make a :lsp:`inlayHint/resolve` request.

        A request to resolve additional properties for an inlay hint.
        The request's parameter is of type {@link InlayHint}, the response is
        of type {@link InlayHint} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("inlayHint/resolve", params, callback)

    async def inlay_hint_resolve_async(
        self,
        params: types.InlayHint,
    ) -> types.InlayHint:
        """Make a :lsp:`inlayHint/resolve` request.

        A request to resolve additional properties for an inlay hint.
        The request's parameter is of type {@link InlayHint}, the response is
        of type {@link InlayHint} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("inlayHint/resolve", params)

    def shutdown(
        self,
        params: None,
        callback: Optional[Callable[[None], None]] = None,
    ) -> Future:
        """Make a :lsp:`shutdown` request.

        A shutdown request is sent from the client to the server.
        It is sent once when the client decides to shutdown the
        server. The only notification that is sent after a shutdown request
        is the exit event.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("shutdown", params, callback)

    async def shutdown_async(
        self,
        params: None,
    ) -> None:
        """Make a :lsp:`shutdown` request.

        A shutdown request is sent from the client to the server.
        It is sent once when the client decides to shutdown the
        server. The only notification that is sent after a shutdown request
        is the exit event.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("shutdown", params)

    def text_document_code_action(
        self,
        params: types.CodeActionParams,
        callback: Optional[Callable[[Optional[List[Union[types.Command, types.CodeAction]]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/codeAction` request.

        A request to provide commands for the given text document and range.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/codeAction", params, callback)

    async def text_document_code_action_async(
        self,
        params: types.CodeActionParams,
    ) -> Optional[List[Union[types.Command, types.CodeAction]]]:
        """Make a :lsp:`textDocument/codeAction` request.

        A request to provide commands for the given text document and range.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/codeAction", params)

    def text_document_code_lens(
        self,
        params: types.CodeLensParams,
        callback: Optional[Callable[[Optional[List[types.CodeLens]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/codeLens` request.

        A request to provide code lens for the given text document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/codeLens", params, callback)

    async def text_document_code_lens_async(
        self,
        params: types.CodeLensParams,
    ) -> Optional[List[types.CodeLens]]:
        """Make a :lsp:`textDocument/codeLens` request.

        A request to provide code lens for the given text document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/codeLens", params)

    def text_document_color_presentation(
        self,
        params: types.ColorPresentationParams,
        callback: Optional[Callable[[List[types.ColorPresentation]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/colorPresentation` request.

        A request to list all presentation for a color. The request's
        parameter is of type {@link ColorPresentationParams} the
        response is of type {@link ColorInformation ColorInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/colorPresentation", params, callback)

    async def text_document_color_presentation_async(
        self,
        params: types.ColorPresentationParams,
    ) -> List[types.ColorPresentation]:
        """Make a :lsp:`textDocument/colorPresentation` request.

        A request to list all presentation for a color. The request's
        parameter is of type {@link ColorPresentationParams} the
        response is of type {@link ColorInformation ColorInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/colorPresentation", params)

    def text_document_completion(
        self,
        params: types.CompletionParams,
        callback: Optional[Callable[[Union[List[types.CompletionItem], types.CompletionList, None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/completion` request.

        Request to request completion at a given text document position. The request's
        parameter is of type {@link TextDocumentPosition} the response
        is of type {@link CompletionItem CompletionItem[]} or {@link CompletionList}
        or a Thenable that resolves to such.

        The request can delay the computation of the {@link CompletionItem.detail `detail`}
        and {@link CompletionItem.documentation `documentation`} properties to the `completionItem/resolve`
        request. However, properties that are needed for the initial sorting and filtering, like `sortText`,
        `filterText`, `insertText`, and `textEdit`, must not be changed during resolve.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/completion", params, callback)

    async def text_document_completion_async(
        self,
        params: types.CompletionParams,
    ) -> Union[List[types.CompletionItem], types.CompletionList, None]:
        """Make a :lsp:`textDocument/completion` request.

        Request to request completion at a given text document position. The request's
        parameter is of type {@link TextDocumentPosition} the response
        is of type {@link CompletionItem CompletionItem[]} or {@link CompletionList}
        or a Thenable that resolves to such.

        The request can delay the computation of the {@link CompletionItem.detail `detail`}
        and {@link CompletionItem.documentation `documentation`} properties to the `completionItem/resolve`
        request. However, properties that are needed for the initial sorting and filtering, like `sortText`,
        `filterText`, `insertText`, and `textEdit`, must not be changed during resolve.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/completion", params)

    def text_document_declaration(
        self,
        params: types.DeclarationParams,
        callback: Optional[Callable[[Union[types.Location, List[types.Location], List[types.LocationLink], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/declaration` request.

        A request to resolve the type definition locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Declaration} or a typed array of {@link DeclarationLink}
        or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/declaration", params, callback)

    async def text_document_declaration_async(
        self,
        params: types.DeclarationParams,
    ) -> Union[types.Location, List[types.Location], List[types.LocationLink], None]:
        """Make a :lsp:`textDocument/declaration` request.

        A request to resolve the type definition locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Declaration} or a typed array of {@link DeclarationLink}
        or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/declaration", params)

    def text_document_definition(
        self,
        params: types.DefinitionParams,
        callback: Optional[Callable[[Union[types.Location, List[types.Location], List[types.LocationLink], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/definition` request.

        A request to resolve the definition location of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPosition}
        the response is of either type {@link Definition} or a typed array of
        {@link DefinitionLink} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/definition", params, callback)

    async def text_document_definition_async(
        self,
        params: types.DefinitionParams,
    ) -> Union[types.Location, List[types.Location], List[types.LocationLink], None]:
        """Make a :lsp:`textDocument/definition` request.

        A request to resolve the definition location of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPosition}
        the response is of either type {@link Definition} or a typed array of
        {@link DefinitionLink} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/definition", params)

    def text_document_diagnostic(
        self,
        params: types.DocumentDiagnosticParams,
        callback: Optional[Callable[[Union[types.RelatedFullDocumentDiagnosticReport, types.RelatedUnchangedDocumentDiagnosticReport]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/diagnostic` request.

        The document diagnostic request definition.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/diagnostic", params, callback)

    async def text_document_diagnostic_async(
        self,
        params: types.DocumentDiagnosticParams,
    ) -> Union[types.RelatedFullDocumentDiagnosticReport, types.RelatedUnchangedDocumentDiagnosticReport]:
        """Make a :lsp:`textDocument/diagnostic` request.

        The document diagnostic request definition.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/diagnostic", params)

    def text_document_document_color(
        self,
        params: types.DocumentColorParams,
        callback: Optional[Callable[[List[types.ColorInformation]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/documentColor` request.

        A request to list all color symbols found in a given text document. The request's
        parameter is of type {@link DocumentColorParams} the
        response is of type {@link ColorInformation ColorInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/documentColor", params, callback)

    async def text_document_document_color_async(
        self,
        params: types.DocumentColorParams,
    ) -> List[types.ColorInformation]:
        """Make a :lsp:`textDocument/documentColor` request.

        A request to list all color symbols found in a given text document. The request's
        parameter is of type {@link DocumentColorParams} the
        response is of type {@link ColorInformation ColorInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/documentColor", params)

    def text_document_document_highlight(
        self,
        params: types.DocumentHighlightParams,
        callback: Optional[Callable[[Optional[List[types.DocumentHighlight]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/documentHighlight` request.

        Request to resolve a {@link DocumentHighlight} for a given
        text document position. The request's parameter is of type {@link TextDocumentPosition}
        the request response is an array of type {@link DocumentHighlight}
        or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/documentHighlight", params, callback)

    async def text_document_document_highlight_async(
        self,
        params: types.DocumentHighlightParams,
    ) -> Optional[List[types.DocumentHighlight]]:
        """Make a :lsp:`textDocument/documentHighlight` request.

        Request to resolve a {@link DocumentHighlight} for a given
        text document position. The request's parameter is of type {@link TextDocumentPosition}
        the request response is an array of type {@link DocumentHighlight}
        or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/documentHighlight", params)

    def text_document_document_link(
        self,
        params: types.DocumentLinkParams,
        callback: Optional[Callable[[Optional[List[types.DocumentLink]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/documentLink` request.

        A request to provide document links
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/documentLink", params, callback)

    async def text_document_document_link_async(
        self,
        params: types.DocumentLinkParams,
    ) -> Optional[List[types.DocumentLink]]:
        """Make a :lsp:`textDocument/documentLink` request.

        A request to provide document links
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/documentLink", params)

    def text_document_document_symbol(
        self,
        params: types.DocumentSymbolParams,
        callback: Optional[Callable[[Union[List[types.SymbolInformation], List[types.DocumentSymbol], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/documentSymbol` request.

        A request to list all symbols found in a given text document. The request's
        parameter is of type {@link TextDocumentIdentifier} the
        response is of type {@link SymbolInformation SymbolInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/documentSymbol", params, callback)

    async def text_document_document_symbol_async(
        self,
        params: types.DocumentSymbolParams,
    ) -> Union[List[types.SymbolInformation], List[types.DocumentSymbol], None]:
        """Make a :lsp:`textDocument/documentSymbol` request.

        A request to list all symbols found in a given text document. The request's
        parameter is of type {@link TextDocumentIdentifier} the
        response is of type {@link SymbolInformation SymbolInformation[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/documentSymbol", params)

    def text_document_folding_range(
        self,
        params: types.FoldingRangeParams,
        callback: Optional[Callable[[Optional[List[types.FoldingRange]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/foldingRange` request.

        A request to provide folding ranges in a document. The request's
        parameter is of type {@link FoldingRangeParams}, the
        response is of type {@link FoldingRangeList} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/foldingRange", params, callback)

    async def text_document_folding_range_async(
        self,
        params: types.FoldingRangeParams,
    ) -> Optional[List[types.FoldingRange]]:
        """Make a :lsp:`textDocument/foldingRange` request.

        A request to provide folding ranges in a document. The request's
        parameter is of type {@link FoldingRangeParams}, the
        response is of type {@link FoldingRangeList} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/foldingRange", params)

    def text_document_formatting(
        self,
        params: types.DocumentFormattingParams,
        callback: Optional[Callable[[Optional[List[types.TextEdit]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/formatting` request.

        A request to format a whole document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/formatting", params, callback)

    async def text_document_formatting_async(
        self,
        params: types.DocumentFormattingParams,
    ) -> Optional[List[types.TextEdit]]:
        """Make a :lsp:`textDocument/formatting` request.

        A request to format a whole document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/formatting", params)

    def text_document_hover(
        self,
        params: types.HoverParams,
        callback: Optional[Callable[[Optional[types.Hover]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/hover` request.

        Request to request hover information at a given text document position. The request's
        parameter is of type {@link TextDocumentPosition} the response is of
        type {@link Hover} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/hover", params, callback)

    async def text_document_hover_async(
        self,
        params: types.HoverParams,
    ) -> Optional[types.Hover]:
        """Make a :lsp:`textDocument/hover` request.

        Request to request hover information at a given text document position. The request's
        parameter is of type {@link TextDocumentPosition} the response is of
        type {@link Hover} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/hover", params)

    def text_document_implementation(
        self,
        params: types.ImplementationParams,
        callback: Optional[Callable[[Union[types.Location, List[types.Location], List[types.LocationLink], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/implementation` request.

        A request to resolve the implementation locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Definition} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/implementation", params, callback)

    async def text_document_implementation_async(
        self,
        params: types.ImplementationParams,
    ) -> Union[types.Location, List[types.Location], List[types.LocationLink], None]:
        """Make a :lsp:`textDocument/implementation` request.

        A request to resolve the implementation locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Definition} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/implementation", params)

    def text_document_inlay_hint(
        self,
        params: types.InlayHintParams,
        callback: Optional[Callable[[Optional[List[types.InlayHint]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/inlayHint` request.

        A request to provide inlay hints in a document. The request's parameter is of
        type {@link InlayHintsParams}, the response is of type
        {@link InlayHint InlayHint[]} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/inlayHint", params, callback)

    async def text_document_inlay_hint_async(
        self,
        params: types.InlayHintParams,
    ) -> Optional[List[types.InlayHint]]:
        """Make a :lsp:`textDocument/inlayHint` request.

        A request to provide inlay hints in a document. The request's parameter is of
        type {@link InlayHintsParams}, the response is of type
        {@link InlayHint InlayHint[]} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/inlayHint", params)

    def text_document_inline_completion(
        self,
        params: types.InlineCompletionParams,
        callback: Optional[Callable[[Union[types.InlineCompletionList, List[types.InlineCompletionItem], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/inlineCompletion` request.

        A request to provide inline completions in a document. The request's parameter is of
        type {@link InlineCompletionParams}, the response is of type
        {@link InlineCompletion InlineCompletion[]} or a Thenable that resolves to such.

        @since 3.18.0
        @proposed
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/inlineCompletion", params, callback)

    async def text_document_inline_completion_async(
        self,
        params: types.InlineCompletionParams,
    ) -> Union[types.InlineCompletionList, List[types.InlineCompletionItem], None]:
        """Make a :lsp:`textDocument/inlineCompletion` request.

        A request to provide inline completions in a document. The request's parameter is of
        type {@link InlineCompletionParams}, the response is of type
        {@link InlineCompletion InlineCompletion[]} or a Thenable that resolves to such.

        @since 3.18.0
        @proposed
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/inlineCompletion", params)

    def text_document_inline_value(
        self,
        params: types.InlineValueParams,
        callback: Optional[Callable[[Optional[List[Union[types.InlineValueText, types.InlineValueVariableLookup, types.InlineValueEvaluatableExpression]]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/inlineValue` request.

        A request to provide inline values in a document. The request's parameter is of
        type {@link InlineValueParams}, the response is of type
        {@link InlineValue InlineValue[]} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/inlineValue", params, callback)

    async def text_document_inline_value_async(
        self,
        params: types.InlineValueParams,
    ) -> Optional[List[Union[types.InlineValueText, types.InlineValueVariableLookup, types.InlineValueEvaluatableExpression]]]:
        """Make a :lsp:`textDocument/inlineValue` request.

        A request to provide inline values in a document. The request's parameter is of
        type {@link InlineValueParams}, the response is of type
        {@link InlineValue InlineValue[]} or a Thenable that resolves to such.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/inlineValue", params)

    def text_document_linked_editing_range(
        self,
        params: types.LinkedEditingRangeParams,
        callback: Optional[Callable[[Optional[types.LinkedEditingRanges]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/linkedEditingRange` request.

        A request to provide ranges that can be edited together.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/linkedEditingRange", params, callback)

    async def text_document_linked_editing_range_async(
        self,
        params: types.LinkedEditingRangeParams,
    ) -> Optional[types.LinkedEditingRanges]:
        """Make a :lsp:`textDocument/linkedEditingRange` request.

        A request to provide ranges that can be edited together.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/linkedEditingRange", params)

    def text_document_moniker(
        self,
        params: types.MonikerParams,
        callback: Optional[Callable[[Optional[List[types.Moniker]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/moniker` request.

        A request to get the moniker of a symbol at a given text document position.
        The request parameter is of type {@link TextDocumentPositionParams}.
        The response is of type {@link Moniker Moniker[]} or `null`.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/moniker", params, callback)

    async def text_document_moniker_async(
        self,
        params: types.MonikerParams,
    ) -> Optional[List[types.Moniker]]:
        """Make a :lsp:`textDocument/moniker` request.

        A request to get the moniker of a symbol at a given text document position.
        The request parameter is of type {@link TextDocumentPositionParams}.
        The response is of type {@link Moniker Moniker[]} or `null`.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/moniker", params)

    def text_document_on_type_formatting(
        self,
        params: types.DocumentOnTypeFormattingParams,
        callback: Optional[Callable[[Optional[List[types.TextEdit]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/onTypeFormatting` request.

        A request to format a document on type.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/onTypeFormatting", params, callback)

    async def text_document_on_type_formatting_async(
        self,
        params: types.DocumentOnTypeFormattingParams,
    ) -> Optional[List[types.TextEdit]]:
        """Make a :lsp:`textDocument/onTypeFormatting` request.

        A request to format a document on type.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/onTypeFormatting", params)

    def text_document_prepare_call_hierarchy(
        self,
        params: types.CallHierarchyPrepareParams,
        callback: Optional[Callable[[Optional[List[types.CallHierarchyItem]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/prepareCallHierarchy` request.

        A request to result a `CallHierarchyItem` in a document at a given position.
        Can be used as an input to an incoming or outgoing call hierarchy.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/prepareCallHierarchy", params, callback)

    async def text_document_prepare_call_hierarchy_async(
        self,
        params: types.CallHierarchyPrepareParams,
    ) -> Optional[List[types.CallHierarchyItem]]:
        """Make a :lsp:`textDocument/prepareCallHierarchy` request.

        A request to result a `CallHierarchyItem` in a document at a given position.
        Can be used as an input to an incoming or outgoing call hierarchy.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/prepareCallHierarchy", params)

    def text_document_prepare_rename(
        self,
        params: types.PrepareRenameParams,
        callback: Optional[Callable[[Union[types.Range, types.PrepareRenameResult_Type1, types.PrepareRenameResult_Type2, None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/prepareRename` request.

        A request to test and perform the setup necessary for a rename.

        @since 3.16 - support for default behavior
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/prepareRename", params, callback)

    async def text_document_prepare_rename_async(
        self,
        params: types.PrepareRenameParams,
    ) -> Union[types.Range, types.PrepareRenameResult_Type1, types.PrepareRenameResult_Type2, None]:
        """Make a :lsp:`textDocument/prepareRename` request.

        A request to test and perform the setup necessary for a rename.

        @since 3.16 - support for default behavior
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/prepareRename", params)

    def text_document_prepare_type_hierarchy(
        self,
        params: types.TypeHierarchyPrepareParams,
        callback: Optional[Callable[[Optional[List[types.TypeHierarchyItem]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/prepareTypeHierarchy` request.

        A request to result a `TypeHierarchyItem` in a document at a given position.
        Can be used as an input to a subtypes or supertypes type hierarchy.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/prepareTypeHierarchy", params, callback)

    async def text_document_prepare_type_hierarchy_async(
        self,
        params: types.TypeHierarchyPrepareParams,
    ) -> Optional[List[types.TypeHierarchyItem]]:
        """Make a :lsp:`textDocument/prepareTypeHierarchy` request.

        A request to result a `TypeHierarchyItem` in a document at a given position.
        Can be used as an input to a subtypes or supertypes type hierarchy.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/prepareTypeHierarchy", params)

    def text_document_ranges_formatting(
        self,
        params: types.DocumentRangesFormattingParams,
        callback: Optional[Callable[[Optional[List[types.TextEdit]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/rangesFormatting` request.

        A request to format ranges in a document.

        @since 3.18.0
        @proposed
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/rangesFormatting", params, callback)

    async def text_document_ranges_formatting_async(
        self,
        params: types.DocumentRangesFormattingParams,
    ) -> Optional[List[types.TextEdit]]:
        """Make a :lsp:`textDocument/rangesFormatting` request.

        A request to format ranges in a document.

        @since 3.18.0
        @proposed
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/rangesFormatting", params)

    def text_document_range_formatting(
        self,
        params: types.DocumentRangeFormattingParams,
        callback: Optional[Callable[[Optional[List[types.TextEdit]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/rangeFormatting` request.

        A request to format a range in a document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/rangeFormatting", params, callback)

    async def text_document_range_formatting_async(
        self,
        params: types.DocumentRangeFormattingParams,
    ) -> Optional[List[types.TextEdit]]:
        """Make a :lsp:`textDocument/rangeFormatting` request.

        A request to format a range in a document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/rangeFormatting", params)

    def text_document_references(
        self,
        params: types.ReferenceParams,
        callback: Optional[Callable[[Optional[List[types.Location]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/references` request.

        A request to resolve project-wide references for the symbol denoted
        by the given text document position. The request's parameter is of
        type {@link ReferenceParams} the response is of type
        {@link Location Location[]} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/references", params, callback)

    async def text_document_references_async(
        self,
        params: types.ReferenceParams,
    ) -> Optional[List[types.Location]]:
        """Make a :lsp:`textDocument/references` request.

        A request to resolve project-wide references for the symbol denoted
        by the given text document position. The request's parameter is of
        type {@link ReferenceParams} the response is of type
        {@link Location Location[]} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/references", params)

    def text_document_rename(
        self,
        params: types.RenameParams,
        callback: Optional[Callable[[Optional[types.WorkspaceEdit]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/rename` request.

        A request to rename a symbol.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/rename", params, callback)

    async def text_document_rename_async(
        self,
        params: types.RenameParams,
    ) -> Optional[types.WorkspaceEdit]:
        """Make a :lsp:`textDocument/rename` request.

        A request to rename a symbol.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/rename", params)

    def text_document_selection_range(
        self,
        params: types.SelectionRangeParams,
        callback: Optional[Callable[[Optional[List[types.SelectionRange]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/selectionRange` request.

        A request to provide selection ranges in a document. The request's
        parameter is of type {@link SelectionRangeParams}, the
        response is of type {@link SelectionRange SelectionRange[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/selectionRange", params, callback)

    async def text_document_selection_range_async(
        self,
        params: types.SelectionRangeParams,
    ) -> Optional[List[types.SelectionRange]]:
        """Make a :lsp:`textDocument/selectionRange` request.

        A request to provide selection ranges in a document. The request's
        parameter is of type {@link SelectionRangeParams}, the
        response is of type {@link SelectionRange SelectionRange[]} or a Thenable
        that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/selectionRange", params)

    def text_document_semantic_tokens_full(
        self,
        params: types.SemanticTokensParams,
        callback: Optional[Callable[[Optional[types.SemanticTokens]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/semanticTokens/full` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/semanticTokens/full", params, callback)

    async def text_document_semantic_tokens_full_async(
        self,
        params: types.SemanticTokensParams,
    ) -> Optional[types.SemanticTokens]:
        """Make a :lsp:`textDocument/semanticTokens/full` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/semanticTokens/full", params)

    def text_document_semantic_tokens_full_delta(
        self,
        params: types.SemanticTokensDeltaParams,
        callback: Optional[Callable[[Union[types.SemanticTokens, types.SemanticTokensDelta, None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/semanticTokens/full/delta` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/semanticTokens/full/delta", params, callback)

    async def text_document_semantic_tokens_full_delta_async(
        self,
        params: types.SemanticTokensDeltaParams,
    ) -> Union[types.SemanticTokens, types.SemanticTokensDelta, None]:
        """Make a :lsp:`textDocument/semanticTokens/full/delta` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/semanticTokens/full/delta", params)

    def text_document_semantic_tokens_range(
        self,
        params: types.SemanticTokensRangeParams,
        callback: Optional[Callable[[Optional[types.SemanticTokens]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/semanticTokens/range` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/semanticTokens/range", params, callback)

    async def text_document_semantic_tokens_range_async(
        self,
        params: types.SemanticTokensRangeParams,
    ) -> Optional[types.SemanticTokens]:
        """Make a :lsp:`textDocument/semanticTokens/range` request.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/semanticTokens/range", params)

    def text_document_signature_help(
        self,
        params: types.SignatureHelpParams,
        callback: Optional[Callable[[Optional[types.SignatureHelp]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/signatureHelp` request.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/signatureHelp", params, callback)

    async def text_document_signature_help_async(
        self,
        params: types.SignatureHelpParams,
    ) -> Optional[types.SignatureHelp]:
        """Make a :lsp:`textDocument/signatureHelp` request.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/signatureHelp", params)

    def text_document_type_definition(
        self,
        params: types.TypeDefinitionParams,
        callback: Optional[Callable[[Union[types.Location, List[types.Location], List[types.LocationLink], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/typeDefinition` request.

        A request to resolve the type definition locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Definition} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/typeDefinition", params, callback)

    async def text_document_type_definition_async(
        self,
        params: types.TypeDefinitionParams,
    ) -> Union[types.Location, List[types.Location], List[types.LocationLink], None]:
        """Make a :lsp:`textDocument/typeDefinition` request.

        A request to resolve the type definition locations of a symbol at a given text
        document position. The request's parameter is of type {@link TextDocumentPositionParams}
        the response is of type {@link Definition} or a Thenable that resolves to such.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/typeDefinition", params)

    def text_document_will_save_wait_until(
        self,
        params: types.WillSaveTextDocumentParams,
        callback: Optional[Callable[[Optional[List[types.TextEdit]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`textDocument/willSaveWaitUntil` request.

        A document will save request is sent from the client to the server before
        the document is actually saved. The request can return an array of TextEdits
        which will be applied to the text document before it is saved. Please note that
        clients might drop results if computing the text edits took too long or if a
        server constantly fails on this request. This is done to keep the save fast and
        reliable.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("textDocument/willSaveWaitUntil", params, callback)

    async def text_document_will_save_wait_until_async(
        self,
        params: types.WillSaveTextDocumentParams,
    ) -> Optional[List[types.TextEdit]]:
        """Make a :lsp:`textDocument/willSaveWaitUntil` request.

        A document will save request is sent from the client to the server before
        the document is actually saved. The request can return an array of TextEdits
        which will be applied to the text document before it is saved. Please note that
        clients might drop results if computing the text edits took too long or if a
        server constantly fails on this request. This is done to keep the save fast and
        reliable.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("textDocument/willSaveWaitUntil", params)

    def type_hierarchy_subtypes(
        self,
        params: types.TypeHierarchySubtypesParams,
        callback: Optional[Callable[[Optional[List[types.TypeHierarchyItem]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`typeHierarchy/subtypes` request.

        A request to resolve the subtypes for a given `TypeHierarchyItem`.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("typeHierarchy/subtypes", params, callback)

    async def type_hierarchy_subtypes_async(
        self,
        params: types.TypeHierarchySubtypesParams,
    ) -> Optional[List[types.TypeHierarchyItem]]:
        """Make a :lsp:`typeHierarchy/subtypes` request.

        A request to resolve the subtypes for a given `TypeHierarchyItem`.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("typeHierarchy/subtypes", params)

    def type_hierarchy_supertypes(
        self,
        params: types.TypeHierarchySupertypesParams,
        callback: Optional[Callable[[Optional[List[types.TypeHierarchyItem]]], None]] = None,
    ) -> Future:
        """Make a :lsp:`typeHierarchy/supertypes` request.

        A request to resolve the supertypes for a given `TypeHierarchyItem`.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("typeHierarchy/supertypes", params, callback)

    async def type_hierarchy_supertypes_async(
        self,
        params: types.TypeHierarchySupertypesParams,
    ) -> Optional[List[types.TypeHierarchyItem]]:
        """Make a :lsp:`typeHierarchy/supertypes` request.

        A request to resolve the supertypes for a given `TypeHierarchyItem`.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("typeHierarchy/supertypes", params)

    def workspace_diagnostic(
        self,
        params: types.WorkspaceDiagnosticParams,
        callback: Optional[Callable[[types.WorkspaceDiagnosticReport], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/diagnostic` request.

        The workspace diagnostic request definition.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/diagnostic", params, callback)

    async def workspace_diagnostic_async(
        self,
        params: types.WorkspaceDiagnosticParams,
    ) -> types.WorkspaceDiagnosticReport:
        """Make a :lsp:`workspace/diagnostic` request.

        The workspace diagnostic request definition.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/diagnostic", params)

    def workspace_execute_command(
        self,
        params: types.ExecuteCommandParams,
        callback: Optional[Callable[[Optional[Any]], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/executeCommand` request.

        A request send from the client to the server to execute a command. The request might return
        a workspace edit which the client will apply to the workspace.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/executeCommand", params, callback)

    async def workspace_execute_command_async(
        self,
        params: types.ExecuteCommandParams,
    ) -> Optional[Any]:
        """Make a :lsp:`workspace/executeCommand` request.

        A request send from the client to the server to execute a command. The request might return
        a workspace edit which the client will apply to the workspace.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/executeCommand", params)

    def workspace_symbol(
        self,
        params: types.WorkspaceSymbolParams,
        callback: Optional[Callable[[Union[List[types.SymbolInformation], List[types.WorkspaceSymbol], None]], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/symbol` request.

        A request to list project-wide symbols matching the query string given
        by the {@link WorkspaceSymbolParams}. The response is
        of type {@link SymbolInformation SymbolInformation[]} or a Thenable that
        resolves to such.

        @since 3.17.0 - support for WorkspaceSymbol in the returned data. Clients
         need to advertise support for WorkspaceSymbols via the client capability
         `workspace.symbol.resolveSupport`.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/symbol", params, callback)

    async def workspace_symbol_async(
        self,
        params: types.WorkspaceSymbolParams,
    ) -> Union[List[types.SymbolInformation], List[types.WorkspaceSymbol], None]:
        """Make a :lsp:`workspace/symbol` request.

        A request to list project-wide symbols matching the query string given
        by the {@link WorkspaceSymbolParams}. The response is
        of type {@link SymbolInformation SymbolInformation[]} or a Thenable that
        resolves to such.

        @since 3.17.0 - support for WorkspaceSymbol in the returned data. Clients
         need to advertise support for WorkspaceSymbols via the client capability
         `workspace.symbol.resolveSupport`.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/symbol", params)

    def workspace_symbol_resolve(
        self,
        params: types.WorkspaceSymbol,
        callback: Optional[Callable[[types.WorkspaceSymbol], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspaceSymbol/resolve` request.

        A request to resolve the range inside the workspace
        symbol's location.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspaceSymbol/resolve", params, callback)

    async def workspace_symbol_resolve_async(
        self,
        params: types.WorkspaceSymbol,
    ) -> types.WorkspaceSymbol:
        """Make a :lsp:`workspaceSymbol/resolve` request.

        A request to resolve the range inside the workspace
        symbol's location.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspaceSymbol/resolve", params)

    def workspace_will_create_files(
        self,
        params: types.CreateFilesParams,
        callback: Optional[Callable[[Optional[types.WorkspaceEdit]], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/willCreateFiles` request.

        The will create files request is sent from the client to the server before files are actually
        created as long as the creation is triggered from within the client.

        The request can return a `WorkspaceEdit` which will be applied to workspace before the
        files are created. Hence the `WorkspaceEdit` can not manipulate the content of the file
        to be created.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/willCreateFiles", params, callback)

    async def workspace_will_create_files_async(
        self,
        params: types.CreateFilesParams,
    ) -> Optional[types.WorkspaceEdit]:
        """Make a :lsp:`workspace/willCreateFiles` request.

        The will create files request is sent from the client to the server before files are actually
        created as long as the creation is triggered from within the client.

        The request can return a `WorkspaceEdit` which will be applied to workspace before the
        files are created. Hence the `WorkspaceEdit` can not manipulate the content of the file
        to be created.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/willCreateFiles", params)

    def workspace_will_delete_files(
        self,
        params: types.DeleteFilesParams,
        callback: Optional[Callable[[Optional[types.WorkspaceEdit]], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/willDeleteFiles` request.

        The did delete files notification is sent from the client to the server when
        files were deleted from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/willDeleteFiles", params, callback)

    async def workspace_will_delete_files_async(
        self,
        params: types.DeleteFilesParams,
    ) -> Optional[types.WorkspaceEdit]:
        """Make a :lsp:`workspace/willDeleteFiles` request.

        The did delete files notification is sent from the client to the server when
        files were deleted from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/willDeleteFiles", params)

    def workspace_will_rename_files(
        self,
        params: types.RenameFilesParams,
        callback: Optional[Callable[[Optional[types.WorkspaceEdit]], None]] = None,
    ) -> Future:
        """Make a :lsp:`workspace/willRenameFiles` request.

        The will rename files request is sent from the client to the server before files are actually
        renamed as long as the rename is triggered from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return self.protocol.send_request("workspace/willRenameFiles", params, callback)

    async def workspace_will_rename_files_async(
        self,
        params: types.RenameFilesParams,
    ) -> Optional[types.WorkspaceEdit]:
        """Make a :lsp:`workspace/willRenameFiles` request.

        The will rename files request is sent from the client to the server before files are actually
        renamed as long as the rename is triggered from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        return await self.protocol.send_request_async("workspace/willRenameFiles", params)

    def cancel_request(self, params: types.CancelParams) -> None:
        """Send a :lsp:`$/cancelRequest` notification.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("$/cancelRequest", params)

    def exit(self, params: None) -> None:
        """Send a :lsp:`exit` notification.

        The exit event is sent from the client to the server to
        ask the server to exit its process.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("exit", params)

    def initialized(self, params: types.InitializedParams) -> None:
        """Send a :lsp:`initialized` notification.

        The initialized notification is sent from the client to the
        server after the client is fully initialized and the server
        is allowed to send requests from the server to the client.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("initialized", params)

    def notebook_document_did_change(self, params: types.DidChangeNotebookDocumentParams) -> None:
        """Send a :lsp:`notebookDocument/didChange` notification.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("notebookDocument/didChange", params)

    def notebook_document_did_close(self, params: types.DidCloseNotebookDocumentParams) -> None:
        """Send a :lsp:`notebookDocument/didClose` notification.

        A notification sent when a notebook closes.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("notebookDocument/didClose", params)

    def notebook_document_did_open(self, params: types.DidOpenNotebookDocumentParams) -> None:
        """Send a :lsp:`notebookDocument/didOpen` notification.

        A notification sent when a notebook opens.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("notebookDocument/didOpen", params)

    def notebook_document_did_save(self, params: types.DidSaveNotebookDocumentParams) -> None:
        """Send a :lsp:`notebookDocument/didSave` notification.

        A notification sent when a notebook document is saved.

        @since 3.17.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("notebookDocument/didSave", params)

    def progress(self, params: types.ProgressParams) -> None:
        """Send a :lsp:`$/progress` notification.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("$/progress", params)

    def set_trace(self, params: types.SetTraceParams) -> None:
        """Send a :lsp:`$/setTrace` notification.


        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("$/setTrace", params)

    def text_document_did_change(self, params: types.DidChangeTextDocumentParams) -> None:
        """Send a :lsp:`textDocument/didChange` notification.

        The document change notification is sent from the client to the server to signal
        changes to a text document.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("textDocument/didChange", params)

    def text_document_did_close(self, params: types.DidCloseTextDocumentParams) -> None:
        """Send a :lsp:`textDocument/didClose` notification.

        The document close notification is sent from the client to the server when
        the document got closed in the client. The document's truth now exists where
        the document's uri points to (e.g. if the document's uri is a file uri the
        truth now exists on disk). As with the open notification the close notification
        is about managing the document's content. Receiving a close notification
        doesn't mean that the document was open in an editor before. A close
        notification requires a previous open notification to be sent.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("textDocument/didClose", params)

    def text_document_did_open(self, params: types.DidOpenTextDocumentParams) -> None:
        """Send a :lsp:`textDocument/didOpen` notification.

        The document open notification is sent from the client to the server to signal
        newly opened text documents. The document's truth is now managed by the client
        and the server must not try to read the document's truth using the document's
        uri. Open in this sense means it is managed by the client. It doesn't necessarily
        mean that its content is presented in an editor. An open notification must not
        be sent more than once without a corresponding close notification send before.
        This means open and close notification must be balanced and the max open count
        is one.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("textDocument/didOpen", params)

    def text_document_did_save(self, params: types.DidSaveTextDocumentParams) -> None:
        """Send a :lsp:`textDocument/didSave` notification.

        The document save notification is sent from the client to the server when
        the document got saved in the client.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("textDocument/didSave", params)

    def text_document_will_save(self, params: types.WillSaveTextDocumentParams) -> None:
        """Send a :lsp:`textDocument/willSave` notification.

        A document will save notification is sent from the client to the server before
        the document is actually saved.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("textDocument/willSave", params)

    def window_work_done_progress_cancel(self, params: types.WorkDoneProgressCancelParams) -> None:
        """Send a :lsp:`window/workDoneProgress/cancel` notification.

        The `window/workDoneProgress/cancel` notification is sent from  the client to the server to cancel a progress
        initiated on the server side.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("window/workDoneProgress/cancel", params)

    def workspace_did_change_configuration(self, params: types.DidChangeConfigurationParams) -> None:
        """Send a :lsp:`workspace/didChangeConfiguration` notification.

        The configuration change notification is sent from the client to the server
        when the client's configuration has changed. The notification contains
        the changed configuration as defined by the language client.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didChangeConfiguration", params)

    def workspace_did_change_watched_files(self, params: types.DidChangeWatchedFilesParams) -> None:
        """Send a :lsp:`workspace/didChangeWatchedFiles` notification.

        The watched files notification is sent from the client to the server when
        the client detects changes to file watched by the language client.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didChangeWatchedFiles", params)

    def workspace_did_change_workspace_folders(self, params: types.DidChangeWorkspaceFoldersParams) -> None:
        """Send a :lsp:`workspace/didChangeWorkspaceFolders` notification.

        The `workspace/didChangeWorkspaceFolders` notification is sent from the client to the server when the workspace
        folder configuration changes.
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didChangeWorkspaceFolders", params)

    def workspace_did_create_files(self, params: types.CreateFilesParams) -> None:
        """Send a :lsp:`workspace/didCreateFiles` notification.

        The did create files notification is sent from the client to the server when
        files were created from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didCreateFiles", params)

    def workspace_did_delete_files(self, params: types.DeleteFilesParams) -> None:
        """Send a :lsp:`workspace/didDeleteFiles` notification.

        The will delete files request is sent from the client to the server before files are actually
        deleted as long as the deletion is triggered from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didDeleteFiles", params)

    def workspace_did_rename_files(self, params: types.RenameFilesParams) -> None:
        """Send a :lsp:`workspace/didRenameFiles` notification.

        The did rename files notification is sent from the client to the server when
        files were renamed from within the client.

        @since 3.16.0
        """
        if self.stopped:
            raise RuntimeError("Client has been stopped.")

        self.protocol.notify("workspace/didRenameFiles", params)
