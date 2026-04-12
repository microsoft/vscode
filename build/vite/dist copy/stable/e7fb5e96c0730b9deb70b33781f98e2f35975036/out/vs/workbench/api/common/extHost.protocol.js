/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createProxyIdentifier } from '../../services/extensions/common/proxyIdentifier.js';
export var TextEditorRevealType;
(function (TextEditorRevealType) {
    TextEditorRevealType[TextEditorRevealType["Default"] = 0] = "Default";
    TextEditorRevealType[TextEditorRevealType["InCenter"] = 1] = "InCenter";
    TextEditorRevealType[TextEditorRevealType["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
    TextEditorRevealType[TextEditorRevealType["AtTop"] = 3] = "AtTop";
})(TextEditorRevealType || (TextEditorRevealType = {}));
//#region --- tabs model
export var TabInputKind;
(function (TabInputKind) {
    TabInputKind[TabInputKind["UnknownInput"] = 0] = "UnknownInput";
    TabInputKind[TabInputKind["TextInput"] = 1] = "TextInput";
    TabInputKind[TabInputKind["TextDiffInput"] = 2] = "TextDiffInput";
    TabInputKind[TabInputKind["TextMergeInput"] = 3] = "TextMergeInput";
    TabInputKind[TabInputKind["NotebookInput"] = 4] = "NotebookInput";
    TabInputKind[TabInputKind["NotebookDiffInput"] = 5] = "NotebookDiffInput";
    TabInputKind[TabInputKind["CustomEditorInput"] = 6] = "CustomEditorInput";
    TabInputKind[TabInputKind["WebviewEditorInput"] = 7] = "WebviewEditorInput";
    TabInputKind[TabInputKind["TerminalEditorInput"] = 8] = "TerminalEditorInput";
    TabInputKind[TabInputKind["InteractiveEditorInput"] = 9] = "InteractiveEditorInput";
    TabInputKind[TabInputKind["ChatEditorInput"] = 10] = "ChatEditorInput";
    TabInputKind[TabInputKind["MultiDiffEditorInput"] = 11] = "MultiDiffEditorInput";
})(TabInputKind || (TabInputKind = {}));
export var TabModelOperationKind;
(function (TabModelOperationKind) {
    TabModelOperationKind[TabModelOperationKind["TAB_OPEN"] = 0] = "TAB_OPEN";
    TabModelOperationKind[TabModelOperationKind["TAB_CLOSE"] = 1] = "TAB_CLOSE";
    TabModelOperationKind[TabModelOperationKind["TAB_UPDATE"] = 2] = "TAB_UPDATE";
    TabModelOperationKind[TabModelOperationKind["TAB_MOVE"] = 3] = "TAB_MOVE";
})(TabModelOperationKind || (TabModelOperationKind = {}));
export var WebviewEditorCapabilities;
(function (WebviewEditorCapabilities) {
    WebviewEditorCapabilities[WebviewEditorCapabilities["Editable"] = 0] = "Editable";
    WebviewEditorCapabilities[WebviewEditorCapabilities["SupportsHotExit"] = 1] = "SupportsHotExit";
})(WebviewEditorCapabilities || (WebviewEditorCapabilities = {}));
export var WebviewMessageArrayBufferViewType;
(function (WebviewMessageArrayBufferViewType) {
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Int8Array"] = 1] = "Int8Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Uint8Array"] = 2] = "Uint8Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Uint8ClampedArray"] = 3] = "Uint8ClampedArray";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Int16Array"] = 4] = "Int16Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Uint16Array"] = 5] = "Uint16Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Int32Array"] = 6] = "Int32Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Uint32Array"] = 7] = "Uint32Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Float32Array"] = 8] = "Float32Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["Float64Array"] = 9] = "Float64Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["BigInt64Array"] = 10] = "BigInt64Array";
    WebviewMessageArrayBufferViewType[WebviewMessageArrayBufferViewType["BigUint64Array"] = 11] = "BigUint64Array";
})(WebviewMessageArrayBufferViewType || (WebviewMessageArrayBufferViewType = {}));
export var CellOutputKind;
(function (CellOutputKind) {
    CellOutputKind[CellOutputKind["Text"] = 1] = "Text";
    CellOutputKind[CellOutputKind["Error"] = 2] = "Error";
    CellOutputKind[CellOutputKind["Rich"] = 3] = "Rich";
})(CellOutputKind || (CellOutputKind = {}));
export var NotebookEditorRevealType;
(function (NotebookEditorRevealType) {
    NotebookEditorRevealType[NotebookEditorRevealType["Default"] = 0] = "Default";
    NotebookEditorRevealType[NotebookEditorRevealType["InCenter"] = 1] = "InCenter";
    NotebookEditorRevealType[NotebookEditorRevealType["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
    NotebookEditorRevealType[NotebookEditorRevealType["AtTop"] = 3] = "AtTop";
})(NotebookEditorRevealType || (NotebookEditorRevealType = {}));
export var CandidatePortSource;
(function (CandidatePortSource) {
    CandidatePortSource[CandidatePortSource["None"] = 0] = "None";
    CandidatePortSource[CandidatePortSource["Process"] = 1] = "Process";
    CandidatePortSource[CandidatePortSource["Output"] = 2] = "Output";
    CandidatePortSource[CandidatePortSource["Hybrid"] = 3] = "Hybrid";
})(CandidatePortSource || (CandidatePortSource = {}));
export class IdObject {
    static { this._n = 0; }
    static mixin(object) {
        // eslint-disable-next-line local/code-no-any-casts
        object._id = IdObject._n++;
        // eslint-disable-next-line local/code-no-any-casts
        return object;
    }
}
export var ISuggestDataDtoField;
(function (ISuggestDataDtoField) {
    ISuggestDataDtoField["label"] = "a";
    ISuggestDataDtoField["kind"] = "b";
    ISuggestDataDtoField["detail"] = "c";
    ISuggestDataDtoField["documentation"] = "d";
    ISuggestDataDtoField["sortText"] = "e";
    ISuggestDataDtoField["filterText"] = "f";
    ISuggestDataDtoField["preselect"] = "g";
    ISuggestDataDtoField["insertText"] = "h";
    ISuggestDataDtoField["insertTextRules"] = "i";
    ISuggestDataDtoField["range"] = "j";
    ISuggestDataDtoField["commitCharacters"] = "k";
    ISuggestDataDtoField["additionalTextEdits"] = "l";
    ISuggestDataDtoField["kindModifier"] = "m";
    ISuggestDataDtoField["commandIdent"] = "n";
    ISuggestDataDtoField["commandId"] = "o";
    ISuggestDataDtoField["commandArguments"] = "p";
})(ISuggestDataDtoField || (ISuggestDataDtoField = {}));
export var ISuggestResultDtoField;
(function (ISuggestResultDtoField) {
    ISuggestResultDtoField["defaultRanges"] = "a";
    ISuggestResultDtoField["completions"] = "b";
    ISuggestResultDtoField["isIncomplete"] = "c";
    ISuggestResultDtoField["duration"] = "d";
})(ISuggestResultDtoField || (ISuggestResultDtoField = {}));
/**
 * Represents a collection of {@link CompletionItem completion items} to be presented
 * in the editor.
 */
export class TerminalCompletionListDto {
    /**
     * Creates a new completion list.
     *
     * @param items The completion items.
     * @param isIncomplete The list is not complete.
     */
    constructor(items, resourceOptions) {
        this.items = items ?? [];
        this.resourceOptions = resourceOptions;
    }
}
export var ExtHostTestingResource;
(function (ExtHostTestingResource) {
    ExtHostTestingResource[ExtHostTestingResource["Workspace"] = 0] = "Workspace";
    ExtHostTestingResource[ExtHostTestingResource["TextDocument"] = 1] = "TextDocument";
})(ExtHostTestingResource || (ExtHostTestingResource = {}));
export var IAuthResourceMetadataSource;
(function (IAuthResourceMetadataSource) {
    IAuthResourceMetadataSource["Header"] = "header";
    IAuthResourceMetadataSource["WellKnown"] = "wellKnown";
    IAuthResourceMetadataSource["None"] = "none";
})(IAuthResourceMetadataSource || (IAuthResourceMetadataSource = {}));
export var IAuthServerMetadataSource;
(function (IAuthServerMetadataSource) {
    IAuthServerMetadataSource["ResourceMetadata"] = "resourceMetadata";
    IAuthServerMetadataSource["WellKnown"] = "wellKnown";
    IAuthServerMetadataSource["Default"] = "default";
})(IAuthServerMetadataSource || (IAuthServerMetadataSource = {}));
export var GitRefTypeDto;
(function (GitRefTypeDto) {
    GitRefTypeDto[GitRefTypeDto["Head"] = 0] = "Head";
    GitRefTypeDto[GitRefTypeDto["RemoteHead"] = 1] = "RemoteHead";
    GitRefTypeDto[GitRefTypeDto["Tag"] = 2] = "Tag";
})(GitRefTypeDto || (GitRefTypeDto = {}));
// --- proxy identifiers
export const MainContext = {
    MainThreadAuthentication: createProxyIdentifier('MainThreadAuthentication'),
    MainThreadBulkEdits: createProxyIdentifier('MainThreadBulkEdits'),
    MainThreadLanguageModels: createProxyIdentifier('MainThreadLanguageModels'),
    MainThreadEmbeddings: createProxyIdentifier('MainThreadEmbeddings'),
    MainThreadChatAgents2: createProxyIdentifier('MainThreadChatAgents2'),
    MainThreadCodeMapper: createProxyIdentifier('MainThreadCodeMapper'),
    MainThreadLanguageModelTools: createProxyIdentifier('MainThreadChatSkills'),
    MainThreadGitExtension: createProxyIdentifier('MainThreadGitExtension'),
    MainThreadClipboard: createProxyIdentifier('MainThreadClipboard'),
    MainThreadCommands: createProxyIdentifier('MainThreadCommands'),
    MainThreadComments: createProxyIdentifier('MainThreadComments'),
    MainThreadConfiguration: createProxyIdentifier('MainThreadConfiguration'),
    MainThreadConsole: createProxyIdentifier('MainThreadConsole'),
    MainThreadDebugService: createProxyIdentifier('MainThreadDebugService'),
    MainThreadDecorations: createProxyIdentifier('MainThreadDecorations'),
    MainThreadDiagnostics: createProxyIdentifier('MainThreadDiagnostics'),
    MainThreadDialogs: createProxyIdentifier('MainThreadDiaglogs'),
    MainThreadDocuments: createProxyIdentifier('MainThreadDocuments'),
    MainThreadDocumentContentProviders: createProxyIdentifier('MainThreadDocumentContentProviders'),
    MainThreadTextEditors: createProxyIdentifier('MainThreadTextEditors'),
    MainThreadEditorInsets: createProxyIdentifier('MainThreadEditorInsets'),
    MainThreadEditorTabs: createProxyIdentifier('MainThreadEditorTabs'),
    MainThreadErrors: createProxyIdentifier('MainThreadErrors'),
    MainThreadTreeViews: createProxyIdentifier('MainThreadTreeViews'),
    MainThreadDownloadService: createProxyIdentifier('MainThreadDownloadService'),
    MainThreadLanguageFeatures: createProxyIdentifier('MainThreadLanguageFeatures'),
    MainThreadLanguages: createProxyIdentifier('MainThreadLanguages'),
    MainThreadLogger: createProxyIdentifier('MainThreadLogger'),
    MainThreadMessageService: createProxyIdentifier('MainThreadMessageService'),
    MainThreadOutputService: createProxyIdentifier('MainThreadOutputService'),
    MainThreadProgress: createProxyIdentifier('MainThreadProgress'),
    MainThreadQuickDiff: createProxyIdentifier('MainThreadQuickDiff'),
    MainThreadQuickOpen: createProxyIdentifier('MainThreadQuickOpen'),
    MainThreadStatusBar: createProxyIdentifier('MainThreadStatusBar'),
    MainThreadSecretState: createProxyIdentifier('MainThreadSecretState'),
    MainThreadStorage: createProxyIdentifier('MainThreadStorage'),
    MainThreadSpeech: createProxyIdentifier('MainThreadSpeechProvider'),
    MainThreadTelemetry: createProxyIdentifier('MainThreadTelemetry'),
    MainThreadMeteredConnection: createProxyIdentifier('MainThreadMeteredConnection'),
    MainThreadTerminalService: createProxyIdentifier('MainThreadTerminalService'),
    MainThreadTerminalShellIntegration: createProxyIdentifier('MainThreadTerminalShellIntegration'),
    MainThreadWebviews: createProxyIdentifier('MainThreadWebviews'),
    MainThreadWebviewPanels: createProxyIdentifier('MainThreadWebviewPanels'),
    MainThreadWebviewViews: createProxyIdentifier('MainThreadWebviewViews'),
    MainThreadCustomEditors: createProxyIdentifier('MainThreadCustomEditors'),
    MainThreadUrls: createProxyIdentifier('MainThreadUrls'),
    MainThreadUriOpeners: createProxyIdentifier('MainThreadUriOpeners'),
    MainThreadProfileContentHandlers: createProxyIdentifier('MainThreadProfileContentHandlers'),
    MainThreadWorkspace: createProxyIdentifier('MainThreadWorkspace'),
    MainThreadFileSystem: createProxyIdentifier('MainThreadFileSystem'),
    MainThreadFileSystemEventService: createProxyIdentifier('MainThreadFileSystemEventService'),
    MainThreadExtensionService: createProxyIdentifier('MainThreadExtensionService'),
    MainThreadSCM: createProxyIdentifier('MainThreadSCM'),
    MainThreadSearch: createProxyIdentifier('MainThreadSearch'),
    MainThreadShare: createProxyIdentifier('MainThreadShare'),
    MainThreadTask: createProxyIdentifier('MainThreadTask'),
    MainThreadWindow: createProxyIdentifier('MainThreadWindow'),
    MainThreadPower: createProxyIdentifier('MainThreadPower'),
    MainThreadLabelService: createProxyIdentifier('MainThreadLabelService'),
    MainThreadNotebook: createProxyIdentifier('MainThreadNotebook'),
    MainThreadNotebookDocuments: createProxyIdentifier('MainThreadNotebookDocumentsShape'),
    MainThreadNotebookEditors: createProxyIdentifier('MainThreadNotebookEditorsShape'),
    MainThreadNotebookKernels: createProxyIdentifier('MainThreadNotebookKernels'),
    MainThreadNotebookRenderers: createProxyIdentifier('MainThreadNotebookRenderers'),
    MainThreadInteractive: createProxyIdentifier('MainThreadInteractive'),
    MainThreadTheming: createProxyIdentifier('MainThreadTheming'),
    MainThreadTunnelService: createProxyIdentifier('MainThreadTunnelService'),
    MainThreadManagedSockets: createProxyIdentifier('MainThreadManagedSockets'),
    MainThreadTimeline: createProxyIdentifier('MainThreadTimeline'),
    MainThreadTesting: createProxyIdentifier('MainThreadTesting'),
    MainThreadLocalization: createProxyIdentifier('MainThreadLocalizationShape'),
    MainThreadMcp: createProxyIdentifier('MainThreadMcpShape'),
    MainThreadAiRelatedInformation: createProxyIdentifier('MainThreadAiRelatedInformation'),
    MainThreadAiEmbeddingVector: createProxyIdentifier('MainThreadAiEmbeddingVector'),
    MainThreadChatStatus: createProxyIdentifier('MainThreadChatStatus'),
    MainThreadAiSettingsSearch: createProxyIdentifier('MainThreadAiSettingsSearch'),
    MainThreadDataChannels: createProxyIdentifier('MainThreadDataChannels'),
    MainThreadChatSessions: createProxyIdentifier('MainThreadChatSessions'),
    MainThreadChatOutputRenderer: createProxyIdentifier('MainThreadChatOutputRenderer'),
    MainThreadChatContext: createProxyIdentifier('MainThreadChatContext'),
    MainThreadChatDebug: createProxyIdentifier('MainThreadChatDebug'),
    MainThreadBrowsers: createProxyIdentifier('MainThreadBrowsers'),
};
export const ExtHostContext = {
    ExtHostCodeMapper: createProxyIdentifier('ExtHostCodeMapper'),
    ExtHostCommands: createProxyIdentifier('ExtHostCommands'),
    ExtHostConfiguration: createProxyIdentifier('ExtHostConfiguration'),
    ExtHostDiagnostics: createProxyIdentifier('ExtHostDiagnostics'),
    ExtHostDebugService: createProxyIdentifier('ExtHostDebugService'),
    ExtHostDecorations: createProxyIdentifier('ExtHostDecorations'),
    ExtHostDocumentsAndEditors: createProxyIdentifier('ExtHostDocumentsAndEditors'),
    ExtHostDocuments: createProxyIdentifier('ExtHostDocuments'),
    ExtHostDocumentContentProviders: createProxyIdentifier('ExtHostDocumentContentProviders'),
    ExtHostDocumentSaveParticipant: createProxyIdentifier('ExtHostDocumentSaveParticipant'),
    ExtHostEditors: createProxyIdentifier('ExtHostEditors'),
    ExtHostTreeViews: createProxyIdentifier('ExtHostTreeViews'),
    ExtHostFileSystem: createProxyIdentifier('ExtHostFileSystem'),
    ExtHostFileSystemInfo: createProxyIdentifier('ExtHostFileSystemInfo'),
    ExtHostFileSystemEventService: createProxyIdentifier('ExtHostFileSystemEventService'),
    ExtHostLanguages: createProxyIdentifier('ExtHostLanguages'),
    ExtHostLanguageFeatures: createProxyIdentifier('ExtHostLanguageFeatures'),
    ExtHostQuickOpen: createProxyIdentifier('ExtHostQuickOpen'),
    ExtHostQuickDiff: createProxyIdentifier('ExtHostQuickDiff'),
    ExtHostStatusBar: createProxyIdentifier('ExtHostStatusBar'),
    ExtHostShare: createProxyIdentifier('ExtHostShare'),
    ExtHostExtensionService: createProxyIdentifier('ExtHostExtensionService'),
    ExtHostLogLevelServiceShape: createProxyIdentifier('ExtHostLogLevelServiceShape'),
    ExtHostTerminalService: createProxyIdentifier('ExtHostTerminalService'),
    ExtHostTerminalShellIntegration: createProxyIdentifier('ExtHostTerminalShellIntegration'),
    ExtHostSCM: createProxyIdentifier('ExtHostSCM'),
    ExtHostSearch: createProxyIdentifier('ExtHostSearch'),
    ExtHostTask: createProxyIdentifier('ExtHostTask'),
    ExtHostWorkspace: createProxyIdentifier('ExtHostWorkspace'),
    ExtHostWindow: createProxyIdentifier('ExtHostWindow'),
    ExtHostPower: createProxyIdentifier('ExtHostPower'),
    ExtHostWebviews: createProxyIdentifier('ExtHostWebviews'),
    ExtHostWebviewPanels: createProxyIdentifier('ExtHostWebviewPanels'),
    ExtHostCustomEditors: createProxyIdentifier('ExtHostCustomEditors'),
    ExtHostWebviewViews: createProxyIdentifier('ExtHostWebviewViews'),
    ExtHostEditorInsets: createProxyIdentifier('ExtHostEditorInsets'),
    ExtHostEditorTabs: createProxyIdentifier('ExtHostEditorTabs'),
    ExtHostProgress: createProxyIdentifier('ExtHostProgress'),
    ExtHostComments: createProxyIdentifier('ExtHostComments'),
    ExtHostSecretState: createProxyIdentifier('ExtHostSecretState'),
    ExtHostStorage: createProxyIdentifier('ExtHostStorage'),
    ExtHostUrls: createProxyIdentifier('ExtHostUrls'),
    ExtHostUriOpeners: createProxyIdentifier('ExtHostUriOpeners'),
    ExtHostChatOutputRenderer: createProxyIdentifier('ExtHostChatOutputRenderer'),
    ExtHostProfileContentHandlers: createProxyIdentifier('ExtHostProfileContentHandlers'),
    ExtHostOutputService: createProxyIdentifier('ExtHostOutputService'),
    ExtHostLabelService: createProxyIdentifier('ExtHostLabelService'),
    ExtHostNotebook: createProxyIdentifier('ExtHostNotebook'),
    ExtHostNotebookDocuments: createProxyIdentifier('ExtHostNotebookDocuments'),
    ExtHostNotebookEditors: createProxyIdentifier('ExtHostNotebookEditors'),
    ExtHostNotebookKernels: createProxyIdentifier('ExtHostNotebookKernels'),
    ExtHostNotebookRenderers: createProxyIdentifier('ExtHostNotebookRenderers'),
    ExtHostNotebookDocumentSaveParticipant: createProxyIdentifier('ExtHostNotebookDocumentSaveParticipant'),
    ExtHostInteractive: createProxyIdentifier('ExtHostInteractive'),
    ExtHostChatAgents2: createProxyIdentifier('ExtHostChatAgents'),
    ExtHostLanguageModelTools: createProxyIdentifier('ExtHostChatSkills'),
    ExtHostChatProvider: createProxyIdentifier('ExtHostChatProvider'),
    ExtHostChatContext: createProxyIdentifier('ExtHostChatContext'),
    ExtHostChatDebug: createProxyIdentifier('ExtHostChatDebug'),
    ExtHostSpeech: createProxyIdentifier('ExtHostSpeech'),
    ExtHostEmbeddings: createProxyIdentifier('ExtHostEmbeddings'),
    ExtHostAiRelatedInformation: createProxyIdentifier('ExtHostAiRelatedInformation'),
    ExtHostAiEmbeddingVector: createProxyIdentifier('ExtHostAiEmbeddingVector'),
    ExtHostAiSettingsSearch: createProxyIdentifier('ExtHostAiSettingsSearch'),
    ExtHostTheming: createProxyIdentifier('ExtHostTheming'),
    ExtHostTunnelService: createProxyIdentifier('ExtHostTunnelService'),
    ExtHostManagedSockets: createProxyIdentifier('ExtHostManagedSockets'),
    ExtHostAuthentication: createProxyIdentifier('ExtHostAuthentication'),
    ExtHostTimeline: createProxyIdentifier('ExtHostTimeline'),
    ExtHostTesting: createProxyIdentifier('ExtHostTesting'),
    ExtHostTelemetry: createProxyIdentifier('ExtHostTelemetry'),
    ExtHostMeteredConnection: createProxyIdentifier('ExtHostMeteredConnection'),
    ExtHostLocalization: createProxyIdentifier('ExtHostLocalization'),
    ExtHostMcp: createProxyIdentifier('ExtHostMcp'),
    ExtHostDataChannels: createProxyIdentifier('ExtHostDataChannels'),
    ExtHostChatSessions: createProxyIdentifier('ExtHostChatSessions'),
    ExtHostGitExtension: createProxyIdentifier('ExtHostGitExtension'),
    ExtHostBrowsers: createProxyIdentifier('ExtHostBrowsers'),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdC5wcm90b2NvbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3QucHJvdG9jb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFzRmhHLE9BQU8sRUFBb0QscUJBQXFCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQTBOOUksTUFBTSxDQUFOLElBQVksb0JBS1g7QUFMRCxXQUFZLG9CQUFvQjtJQUMvQixxRUFBVyxDQUFBO0lBQ1gsdUVBQVksQ0FBQTtJQUNaLHlHQUE2QixDQUFBO0lBQzdCLGlFQUFTLENBQUE7QUFDVixDQUFDLEVBTFcsb0JBQW9CLEtBQXBCLG9CQUFvQixRQUsvQjtBQXdoQkQsd0JBQXdCO0FBRXhCLE1BQU0sQ0FBTixJQUFrQixZQWFqQjtBQWJELFdBQWtCLFlBQVk7SUFDN0IsK0RBQVksQ0FBQTtJQUNaLHlEQUFTLENBQUE7SUFDVCxpRUFBYSxDQUFBO0lBQ2IsbUVBQWMsQ0FBQTtJQUNkLGlFQUFhLENBQUE7SUFDYix5RUFBaUIsQ0FBQTtJQUNqQix5RUFBaUIsQ0FBQTtJQUNqQiwyRUFBa0IsQ0FBQTtJQUNsQiw2RUFBbUIsQ0FBQTtJQUNuQixtRkFBc0IsQ0FBQTtJQUN0QixzRUFBZSxDQUFBO0lBQ2YsZ0ZBQW9CLENBQUE7QUFDckIsQ0FBQyxFQWJpQixZQUFZLEtBQVosWUFBWSxRQWE3QjtBQUVELE1BQU0sQ0FBTixJQUFrQixxQkFLakI7QUFMRCxXQUFrQixxQkFBcUI7SUFDdEMseUVBQVEsQ0FBQTtJQUNSLDJFQUFTLENBQUE7SUFDVCw2RUFBVSxDQUFBO0lBQ1YseUVBQVEsQ0FBQTtBQUNULENBQUMsRUFMaUIscUJBQXFCLEtBQXJCLHFCQUFxQixRQUt0QztBQWlJRCxNQUFNLENBQU4sSUFBWSx5QkFHWDtBQUhELFdBQVkseUJBQXlCO0lBQ3BDLGlGQUFR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