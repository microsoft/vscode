/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ToolDataSource, ToolSet } from '../../../common/tools/languageModelToolsService.js';
export class MockLanguageModelToolsService extends Disposable {
    constructor() {
        super();
        this.vscodeToolSet = new ToolSet('vscode', 'vscode', ThemeIcon.fromId(Codicon.code.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
        this.executeToolSet = new ToolSet('execute', 'execute', ThemeIcon.fromId(Codicon.terminal.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
        this.readToolSet = new ToolSet('read', 'read', ThemeIcon.fromId(Codicon.book.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
        this.agentToolSet = new ToolSet('agent', 'agent', ThemeIcon.fromId(Codicon.agent.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
        this._onDidInvokeTool = this._register(new Emitter());
        this._registeredToolIds = new Set();
        this._registeredToolSetNames = new Set();
        this._toolSetTools = new Map();
        this.onDidChangeTools = Event.None;
        this.onDidPrepareToolCallBecomeUnresponsive = Event.None;
        this.onDidInvokeTool = this._onDidInvokeTool.event;
        this.toolSets = constObservable([]);
    }
    fireOnDidInvokeTool(event) {
        this._onDidInvokeTool.fire(event);
    }
    registerToolData(toolData) {
        return Disposable.None;
    }
    resetToolAutoConfirmation() {
    }
    getToolPostExecutionAutoConfirmation(toolId) {
        return 'never';
    }
    resetToolPostExecutionAutoConfirmation() {
    }
    flushToolUpdates() {
    }
    cancelToolCallsForRequest(requestId) {
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setToolAutoConfirmation(toolId, scope) {
    }
    getToolAutoConfirmation(toolId) {
        return 'never';
    }
    registerToolImplementation(name, tool) {
        return Disposable.None;
    }
    registerTool(toolData, tool) {
        return Disposable.None;
    }
    getTools() {
        return [];
    }
    getAllToolsIncludingDisabled() {
        return [];
    }
    addRegisteredToolId(id) {
        this._registeredToolIds.add(id);
    }
    getTool(id) {
        if (this._registeredToolIds.has(id)) {
            return { id, source: ToolDataSource.Internal, displayName: id, modelDescription: id };
        }
        return undefined;
    }
    observeTools() {
        return constObservable([]);
    }
    getToolByName(name) {
        return undefined;
    }
    acceptProgress(sessionId, callId, progress) {
    }
    async invokeTool(dto, countTokens, token) {
        return {
            content: [{ kind: 'text', value: 'result' }]
        };
    }
    beginToolCall(_options) {
        // Mock implementation - return undefined
        return undefined;
    }
    async updateToolStream(_toolCallId, _partialInput, _token) {
        // Mock implementation - do nothing
    }
    getToolSetsForModel(model, reader) {
        return [];
    }
    addRegisteredToolSetName(name, tools) {
        this._registeredToolSetNames.add(name);
        if (tools) {
            this._toolSetTools.set(name, tools);
        }
    }
    getToolSetByName(name) {
        if (this._registeredToolSetNames.has(name)) {
            const tools = this._toolSetTools.get(name) ?? [];
            return { id: name, referenceName: name, icon: ThemeIcon.fromId(Codicon.tools.id), source: ToolDataSource.Internal, getTools: () => tools };
        }
        return undefined;
    }
    getToolSet(id) {
        return undefined;
    }
    createToolSet() {
        throw new Error('Method not implemented.');
    }
    toToolAndToolSetEnablementMap(toolOrToolSetNames) {
        throw new Error('Method not implemented.');
    }
    toToolReferences(variableReferences) {
        throw new Error('Method not implemented.');
    }
    getFullReferenceNames() {
        throw new Error('Method not implemented.');
    }
    getToolByFullReferenceName(qualifiedName) {
        throw new Error('Method not implemented.');
    }
    getFullReferenceName(tool, set) {
        throw new Error('Method not implemented.');
    }
    toFullReferenceNames(map) {
        throw new Error('Method not implemented.');
    }
    getDeprecatedFullReferenceNames() {
        throw new Error('Method not implemented.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Rvb2xzL21vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUF3QixNQUFNLDZDQUE2QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0RUFBNEUsQ0FBQztBQU1uSCxPQUFPLEVBQXlMLGNBQWMsRUFBRSxPQUFPLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVwUixNQUFNLE9BQU8sNkJBQThCLFNBQVEsVUFBVTtJQWE1RDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBWlQsa0JBQWEsR0FBWSxJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxjQUFjLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsSUFBSSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDeEssbUJBQWMsR0FBWSxJQUFJLE9BQU8sQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFB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