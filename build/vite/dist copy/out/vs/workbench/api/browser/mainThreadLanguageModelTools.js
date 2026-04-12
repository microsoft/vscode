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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { isUriComponents, URI } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { toToolSetKey } from '../../contrib/chat/common/tools/languageModelToolsContribution.js';
import { ILanguageModelToolsService, ToolDataSource, toolResultHasBuffers, ToolSet } from '../../contrib/chat/common/tools/languageModelToolsService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadLanguageModelTools = class MainThreadLanguageModelTools extends Disposable {
    constructor(extHostContext, _languageModelToolsService, _logService, _productService) {
        super();
        this._languageModelToolsService = _languageModelToolsService;
        this._logService = _logService;
        this._productService = _productService;
        this._tools = this._register(new DisposableMap());
        this._runningToolCalls = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageModelTools);
        this._register(this._languageModelToolsService.onDidChangeTools(e => this._proxy.$onDidChangeTools(this.getToolDtos())));
    }
    getToolDtos() {
        return Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled())
            .map(tool => ({
            id: tool.id,
            displayName: tool.displayName,
            toolReferenceName: tool.toolReferenceName,
            legacyToolReferenceFullNames: tool.legacyToolReferenceFullNames,
            fullReferenceName: tool.source.type === 'mcp' ? this._languageModelToolsService.getFullReferenceName(tool) : undefined,
            tags: tool.tags,
            userDescription: tool.userDescription,
            modelDescription: tool.modelDescription,
            inputSchema: tool.inputSchema,
            source: tool.source,
        }));
    }
    async $getTools() {
        return this.getToolDtos();
    }
    async $invokeTool(dto, token) {
        const result = await this._languageModelToolsService.invokeTool(revive(dto), (input, token) => this._proxy.$countTokensForInvocation(dto.callId, input, token), token ?? CancellationToken.None);
        // Only return content and metadata to EH
        const out = {
            content: result.content,
            toolMetadata: result.toolMetadata,
            toolResultError: result.toolResultError,
        };
        return toolResultHasBuffers(result) ? new SerializableObjectWithBuffers(out) : out;
    }
    $acceptToolProgress(callId, progress) {
        this._runningToolCalls.get(callId)?.progress.report(progress);
    }
    $countTokensForInvocation(callId, input, token) {
        const fn = this._runningToolCalls.get(callId);
        if (!fn) {
            throw new Error(`Tool invocation call ${callId} not found`);
        }
        return fn.countTokens(input, token);
    }
    $registerTool(id, hasHandleToolStream) {
        const disposable = this._languageModelToolsService.registerToolImplementation(id, {
            invoke: async (dto, countTokens, progress, token) => {
                try {
                    this._runningToolCalls.set(dto.callId, { countTokens, progress });
                    const resultSerialized = await this._proxy.$invokeTool(dto, token);
                    const resultDto = resultSerialized instanceof SerializableObjectWithBuffers ? resultSerialized.value : resultSerialized;
                    return revive(resultDto);
                }
                finally {
                    this._runningToolCalls.delete(dto.callId);
                }
            },
            prepareToolInvocation: (context, token) => this._proxy.$prepareToolInvocation(id, context, token),
            handleToolStream: hasHandleToolStream ? (context, token) => this._proxy.$handleToolStream(id, context, token) : undefined,
        });
        this._tools.set(id, disposable);
    }
    $registerToolWithDefinition(extensionId, definition, hasHandleToolStream) {
        let icon;
        if (definition.icon) {
            if (ThemeIcon.isThemeIcon(definition.icon)) {
                icon = definition.icon;
            }
            else if (typeof definition.icon === 'object' && definition.icon !== null && isUriComponents(definition.icon)) {
                icon = { dark: URI.revive(definition.icon) };
            }
            else {
                const iconObj = definition.icon;
                icon = { dark: URI.revive(iconObj.dark), light: iconObj.light ? URI.revive(iconObj.light) : undefined };
            }
        }
        // Convert source from DTO, matching the isBuiltinTool logic from languageModelToolsContribution
        const isBuiltinTool = this._productService.defaultChatAgent?.chatExtensionId
            ? ExtensionIdentifier.equals(extensionId, this._productService.defaultChatAgent.chatExtensionId)
            : false;
        const source = isBuiltinTool
            ? ToolDataSource.Internal
            : revive(definition.source);
        // Create the tool data
        const toolData = {
            id: definition.id,
            displayName: definition.displayName,
            toolReferenceName: definition.toolReferenceName,
            legacyToolReferenceFullNames: definition.legacyToolReferenceFullNames,
            tags: definition.tags,
            userDescription: definition.userDescription,
            modelDescription: definition.modelDescription,
            inputSchema: definition.inputSchema,
            source,
            icon,
            models: definition.models,
            canBeReferencedInPrompt: !!definition.userDescription && !definition.toolSet,
        };
        // Register both tool data and implementation
        const id = definition.id;
        const store = new DisposableStore();
        store.add(this._languageModelToolsService.registerTool(toolData, {
            invoke: async (dto, countTokens, progress, token) => {
                try {
                    this._runningToolCalls.set(dto.callId, { countTokens, progress });
                    const resultSerialized = await this._proxy.$invokeTool(dto, token);
                    const resultDto = resultSerialized instanceof SerializableObjectWithBuffers ? resultSerialized.value : resultSerialized;
                    return revive(resultDto);
                }
                finally {
                    this._runningToolCalls.delete(dto.callId);
                }
            },
            handleToolStream: hasHandleToolStream ? (context, token) => this._proxy.$handleToolStream(id, context, token) : undefined,
            prepareToolInvocation: (context, token) => this._proxy.$prepareToolInvocation(id, context, token),
        }));
        if (definition.toolSet) {
            const ts = this._languageModelToolsService.getToolSet(toToolSetKey(extensionId, definition.toolSet)) || this._languageModelToolsService.getToolSet(definition.toolSet);
            if (!ts || !(ts instanceof ToolSet)) {
                this._logService.warn(`ToolSet ${definition.toolSet} not found for tool ${definition.id} from extension ${extensionId.value}`);
            }
            else {
                store.add(ts.addTool(toolData));
            }
        }
        this._tools.set(id, store);
    }
    $unregisterTool(name) {
        this._tools.deleteAndDispose(name);
    }
};
MainThreadLanguageModelTools = __decorate([
    extHostNamedCustomer(MainContext.MainThreadLanguageModelTools),
    __param(1, ILanguageModelToolsService),
    __param(2, ILogService),
    __param(3, IProductService)
], MainThreadLanguageModelTools);
export { MainThreadLanguageModelTools };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZExhbmd1YWdlTW9kZWxUb29scy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbFRvb2xzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9GLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDakcsT0FBTyxFQUF1QiwwQkFBMEIsRUFBOEQsY0FBYyxFQUFnQixvQkFBb0IsRUFBRSxPQUFPLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN4UCxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFPLDZCQUE2QixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekcsT0FBTyxFQUFFLGNBQWMsRUFBb0UsV0FBVyxFQUFxQyxNQUFNLCtCQUErQixDQUFDO0FBRzFLLElBQU0sNEJBQTRCLEdBQWxDLE1B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