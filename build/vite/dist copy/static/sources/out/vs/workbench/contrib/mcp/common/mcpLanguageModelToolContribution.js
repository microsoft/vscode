/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { autorun } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IImageResizeService } from '../../../../platform/imageResize/common/imageResizeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { mcpAppsEnabledConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isContributionEnabled } from '../../chat/common/enablement.js';
import { ChatResponseResource, getAttachableImageExtension } from '../../chat/common/model/chatModel.js';
import { LanguageModelPartAudience } from '../../chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../chat/common/tools/languageModelToolsService.js';
import { IMcpRegistry } from './mcpRegistryTypes.js';
import { IMcpService, McpResourceURI, McpToolResourceLinkMimeType } from './mcpTypes.js';
import { mcpServerToSourceData } from './mcpTypesUtils.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { McpServer } from './mcpServer.js';
let McpLanguageModelToolContribution = class McpLanguageModelToolContribution extends Disposable {
    static { this.ID = 'workbench.contrib.mcp.languageModelTools'; }
    constructor(_toolsService, mcpService, _instantiationService, _mcpRegistry, lifecycleService) {
        super();
        this._toolsService = _toolsService;
        this._instantiationService = _instantiationService;
        this._mcpRegistry = _mcpRegistry;
        this.lifecycleService = lifecycleService;
        // Keep tools in sync with the tools service.
        const previous = this._register(new DisposableMap());
        this._register(autorun(reader => {
            const servers = mcpService.servers.read(reader);
            const toDelete = new Set(previous.keys());
            for (const server of servers) {
                // Skip disabled servers — don't register their tools.
                if (!isContributionEnabled(server.enablement.read(reader))) {
                    continue;
                }
                const previousRec = previous.get(server);
                if (previousRec) {
                    toDelete.delete(server);
                    if (!previousRec.source || equals(previousRec.source, mcpServerToSourceData(server, reader))) {
                        continue; // same definition, no need to update
                    }
                    previousRec.dispose();
                }
                const store = new DisposableStore();
                const rec = { dispose: () => store.dispose() };
                const toolSet = new Lazy(() => {
                    const source = rec.source = mcpServerToSourceData(server);
                    const referenceName = server.definition.label.toLowerCase().replace(/\s+/g, '-'); // see issue https://github.com/microsoft/vscode/issues/278152
                    const toolSet = store.add(this._toolsService.createToolSet(source, server.definition.id, referenceName, {
                        icon: Codicon.mcp,
                        description: localize('mcp.toolset', "{0}: All Tools", server.definition.label)
                    }));
                    return { toolSet, source };
                });
                this._syncTools(server, toolSet, store);
                previous.set(server, rec);
            }
            for (const key of toDelete) {
                previous.deleteAndDispose(key);
            }
        }));
    }
    _syncTools(server, collectionData, store) {
        const tools = new Map();
        const collectionObservable = this._mcpRegistry.collections.map(collections => collections.find(c => c.id === server.collection.id));
        store.add(autorun(reader => {
            const toDelete = new Set(tools.keys());
            // toRegister is deferred until deleting tools that moving a tool between
            // servers (or deleting one instance of a multi-instance server) doesn't cause an error.
            const toRegister = [];
            const registerTool = (tool, toolData, store) => {
                store.add(this._toolsService.registerTool(toolData, this._instantiationService.createInstance(McpToolImplementation, tool, server)));
                store.add(collectionData.value.toolSet.addTool(toolData));
            };
            // Don't bother cleaning up tools internally during shutdown. This just costs time for no benefit.
            if (this.lifecycleService.willShutdown) {
                return;
            }
            const collection = collectionObservable.read(reader);
            if (!collection) {
                tools.forEach(t => t.store.dispose());
                tools.clear();
                return;
            }
            for (const tool of server.tools.read(reader)) {
                // Skip app-only tools - they should not be registered with the language model tools service
                if (!(tool.visibility & 1 /* McpToolVisibility.Model */)) {
                    continue;
                }
                const existing = tools.get(tool.id);
                const icons = tool.icons.getUrl(22);
                const toolData = {
                    id: tool.id,
                    source: collectionData.value.source,
                    icon: icons || Codicon.tools,
                    // duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
                    displayName: tool.definition.annotations?.title || tool.definition.title || tool.definition.name,
                    toolReferenceName: tool.referenceName,
                    modelDescription: tool.definition.description ?? '',
                    userDescription: tool.definition.description ?? '',
                    inputSchema: tool.definition.inputSchema,
                    canBeReferencedInPrompt: true,
                    alwaysDisplayInputOutput: true,
                    canRequestPreApproval: !tool.definition.annotations?.readOnlyHint,
                    canRequestPostApproval: !!tool.definition.annotations?.openWorldHint,
                    runsInWorkspace: collection?.scope === 1 /* StorageScope.WORKSPACE */ || !!collection?.remoteAuthority,
                    tags: ['mcp'],
                };
                if (existing) {
                    if (!equals(existing.toolData, toolData)) {
                        existing.toolData = toolData;
                        existing.store.clear();
                        // We need to re-register both the data and implementation, as the
                        // implementation is discarded when the data is removed (#245921)
                        registerTool(tool, toolData, existing.store);
                    }
                    toDelete.delete(tool.id);
                }
                else {
                    const store = new DisposableStore();
                    toRegister.push(() => registerTool(tool, toolData, store));
                    tools.set(tool.id, { toolData, store });
                }
            }
            for (const id of toDelete) {
                const tool = tools.get(id);
                if (tool) {
                    tool.store.dispose();
                    tools.delete(id);
                }
            }
            for (const fn of toRegister) {
                fn();
            }
            // Important: flush tool updates when the server is fully registered so that
            // any consuming (e.g. autostarting) requests have the tools available immediately.
            this._toolsService.flushToolUpdates();
        }));
        store.add(toDisposable(() => {
            for (const tool of tools.values()) {
                tool.store.dispose();
            }
        }));
    }
};
McpLanguageModelToolContribution = __decorate([
    __param(0, ILanguageModelToolsService),
    __param(1, IMcpService),
    __param(2, IInstantiationService),
    __param(3, IMcpRegistry),
    __param(4, ILifecycleService)
], McpLanguageModelToolContribution);
export { McpLanguageModelToolContribution };
let McpToolImplementation = class McpToolImplementation {
    constructor(_tool, _server, _configurationService, _productService, _fileService, _imageResizeService) {
        this._tool = _tool;
        this._server = _server;
        this._configurationService = _configurationService;
        this._productService = _productService;
        this._fileService = _fileService;
        this._imageResizeService = _imageResizeService;
    }
    async prepareToolInvocation(context) {
        const tool = this._tool;
        const server = this._server;
        // ToDO: need to be revisited as the first tool invocation doesnt have sandbox info and we are optimistically assuming it is not sandboxed. We should ideally have the sandbox info.
        const sandboxEnabled = await McpServer.callOn(server, async (_handler, connection) => {
            return connection.definition.sandboxEnabled;
        });
        const isSandboxedServer = sandboxEnabled === true;
        const mcpToolWarning = localize('mcp.tool.warning', "Note that MCP servers or malicious conversation content may attempt to misuse '{0}' through tools.", this._productService.nameShort);
        // duplicative: https://github.com/modelcontextprotocol/modelcontextprotocol/pull/813
        const title = tool.definition.annotations?.title || tool.definition.title || ('`' + tool.definition.name + '`');
        let confirm;
        if (!isSandboxedServer) {
            confirm = {};
            if (!tool.definition.annotations?.readOnlyHint) {
                confirm.title = new MarkdownString(localize('msg.title', "Run {0}", title));
                confirm.message = new MarkdownString(tool.definition.description, { supportThemeIcons: true });
                confirm.disclaimer = mcpToolWarning;
                confirm.allowAutoConfirm = true;
            }
            if (tool.definition.annotations?.openWorldHint) {
                confirm.confirmResults = true;
            }
        }
        const mcpUiEnabled = this._configurationService.getValue(mcpAppsEnabledConfig);
        return {
            confirmationMessages: confirm,
            invocationMessage: new MarkdownString(localize('msg.run', "Running {0}", title)),
            pastTenseMessage: new MarkdownString(localize('msg.ran', "Ran {0} ", title)),
            originMessage: localize('msg.subtitle', "{0} (MCP Server)", server.definition.label),
            toolSpecificData: {
                kind: 'input',
                rawInput: context.parameters,
                mcpAppData: mcpUiEnabled && tool.uiResourceUri ? {
                    resourceUri: tool.uiResourceUri,
                    serverDefinitionId: server.definition.id,
                    collectionId: server.collection.id,
                } : undefined,
            }
        };
    }
    async invoke(invocation, _countTokens, progress, token) {
        const result = {
            content: []
        };
        const callResult = await this._tool.callWithProgress(invocation.parameters, progress, { chatRequestId: invocation.chatRequestId, chatSessionResource: invocation.context?.sessionResource }, token);
        const details = {
            input: JSON.stringify(invocation.parameters, undefined, 2),
            output: [],
            isError: callResult.isError === true,
        };
        for (const item of callResult.content) {
            const audience = item.annotations?.audience?.map(a => {
                if (a === 'assistant') {
                    return LanguageModelPartAudience.Assistant;
                }
                else if (a === 'user') {
                    return LanguageModelPartAudience.User;
                }
                else {
                    return undefined;
                }
            }).filter(isDefined);
            // Explicit user parts get pushed to progress to show in the status UI
            if (audience?.includes(LanguageModelPartAudience.User)) {
                if (item.type === 'text') {
                    progress.report({ message: item.text });
                }
            }
            // Rewrite image resources to images so they are inlined nicely
            const addAsInlineData = async (mimeType, value, uri) => {
                details.output.push({ type: 'embed', mimeType, value, uri, audience });
                if (isForModel) {
                    let finalData;
                    try {
                        const resized = await this._imageResizeService.resizeImage(decodeBase64(value).buffer, mimeType);
                        finalData = VSBuffer.wrap(resized);
                    }
                    catch {
                        finalData = decodeBase64(value);
                    }
                    result.content.push({ kind: 'data', value: { mimeType, data: finalData }, audience });
                }
            };
            const addAsLinkedResource = (uri, mimeType) => {
                const json = { uri, underlyingMimeType: mimeType };
                result.content.push({
                    kind: 'data',
                    audience,
                    value: {
                        mimeType: McpToolResourceLinkMimeType,
                        data: VSBuffer.fromString(JSON.stringify(json)),
                    },
                });
            };
            const isForModel = !audience || audience.includes(LanguageModelPartAudience.Assistant);
            if (item.type === 'text') {
                details.output.push({ type: 'embed', isText: true, value: item.text });
                // structured content 'represents the result of the tool call', so take
                // that in place of any textual description when present.
                if (isForModel && !callResult.structuredContent) {
                    result.content.push({
                        kind: 'text',
                        audience,
                        value: item.text
                    });
                }
            }
            else if (item.type === 'image' || item.type === 'audio') {
                // default to some image type if not given to hint
                await addAsInlineData(item.mimeType || 'image/png', item.data);
            }
            else if (item.type === 'resource_link') {
                const uri = McpResourceURI.fromServer(this._server.definition, item.uri);
                details.output.push({
                    type: 'ref',
                    uri,
                    audience,
                    mimeType: item.mimeType,
                });
                if (isForModel) {
                    if (item.mimeType && getAttachableImageExtension(item.mimeType)) {
                        result.content.push({
                            kind: 'data',
                            audience,
                            value: {
                                mimeType: item.mimeType,
                                data: await this._fileService.readFile(uri).then(f => f.value).catch(() => VSBuffer.alloc(0)),
                            }
                        });
                    }
                    else {
                        addAsLinkedResource(uri, item.mimeType);
                    }
                }
            }
            else if (item.type === 'resource') {
                const uri = McpResourceURI.fromServer(this._server.definition, item.resource.uri);
                if (item.resource.mimeType && getAttachableImageExtension(item.resource.mimeType) && 'blob' in item.resource) {
                    await addAsInlineData(item.resource.mimeType, item.resource.blob, uri);
                }
                else {
                    details.output.push({
                        type: 'embed',
                        uri,
                        isText: 'text' in item.resource,
                        mimeType: item.resource.mimeType,
                        value: 'blob' in item.resource ? item.resource.blob : item.resource.text,
                        audience,
                        asResource: true,
                    });
                    if (isForModel) {
                        const permalink = invocation.context && ChatResponseResource.createUri(invocation.context.sessionResource, invocation.callId, result.content.length, basename(uri));
                        addAsLinkedResource(permalink || uri, item.resource.mimeType);
                    }
                }
            }
        }
        if (callResult.structuredContent) {
            details.output.push({ type: 'embed', isText: true, value: JSON.stringify(callResult.structuredContent, null, 2), audience: [LanguageModelPartAudience.Assistant] });
            result.content.push({ kind: 'text', value: JSON.stringify(callResult.structuredContent), audience: [LanguageModelPartAudience.Assistant] });
        }
        // Add raw MCP output for MCP App UI rendering if this tool has UI
        if (this._tool.uiResourceUri) {
            details.mcpOutput = callResult;
        }
        result.toolResultDetails = details;
        return result;
    }
};
McpToolImplementation = __decorate([
    __param(2, IConfigurationService),
    __param(3, IProductService),
    __param(4, IFileService),
    __param(5, IImageResizeService)
], McpToolImplementation);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTGFuZ3VhZ2VNb2RlbFRvb2xDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcExhbmd1YWdlTW9kZWxUb29sQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdILE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQVcsTUFBTSxrQ0FBa0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8s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