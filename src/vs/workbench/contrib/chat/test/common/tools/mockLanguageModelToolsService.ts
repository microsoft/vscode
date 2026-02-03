/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, IReader } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IProgressStep } from '../../../../../../platform/progress/common/progress.js';
import { ChatRequestToolReferenceEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IVariableReference } from '../../../common/chatModes.js';
import { IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { CountTokensCallback, IBeginToolCallOptions, ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolImpl, IToolInvocation, IToolInvokedEvent, IToolResult, IToolSet, ToolDataSource, ToolSet } from '../../../common/tools/languageModelToolsService.js';

export class MockLanguageModelToolsService extends Disposable implements ILanguageModelToolsService {
	_serviceBrand: undefined;
	vscodeToolSet: ToolSet = new ToolSet('vscode', 'vscode', ThemeIcon.fromId(Codicon.code.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
	executeToolSet: ToolSet = new ToolSet('execute', 'execute', ThemeIcon.fromId(Codicon.terminal.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
	readToolSet: ToolSet = new ToolSet('read', 'read', ThemeIcon.fromId(Codicon.book.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());
	agentToolSet: ToolSet = new ToolSet('agent', 'agent', ThemeIcon.fromId(Codicon.agent.id), ToolDataSource.Internal, undefined, undefined, new MockContextKeyService());

	private readonly _onDidInvokeTool = this._register(new Emitter<IToolInvokedEvent>());

	constructor() {
		super();
	}

	readonly onDidChangeTools: Event<void> = Event.None;
	readonly onDidPrepareToolCallBecomeUnresponsive: Event<{ sessionResource: URI; toolData: IToolData }> = Event.None;
	readonly onDidInvokeTool = this._onDidInvokeTool.event;

	fireOnDidInvokeTool(event: IToolInvokedEvent): void {
		this._onDidInvokeTool.fire(event);
	}

	registerToolData(toolData: IToolData): IDisposable {
		return Disposable.None;
	}

	resetToolAutoConfirmation(): void {

	}

	getToolPostExecutionAutoConfirmation(toolId: string): 'workspace' | 'profile' | 'session' | 'never' {
		return 'never';
	}

	resetToolPostExecutionAutoConfirmation(): void {

	}

	flushToolUpdates(): void {

	}

	cancelToolCallsForRequest(requestId: string): void {

	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	setToolAutoConfirmation(toolId: string, scope: any): void {

	}

	getToolAutoConfirmation(toolId: string): 'never' {
		return 'never';
	}

	registerToolImplementation(name: string, tool: IToolImpl): IDisposable {
		return Disposable.None;
	}

	registerTool(toolData: IToolData, tool: IToolImpl): IDisposable {
		return Disposable.None;
	}

	getTools(): Iterable<IToolData> {
		return [];
	}

	getAllToolsIncludingDisabled(): Iterable<IToolData> {
		return [];
	}

	getTool(id: string): IToolData | undefined {
		return undefined;
	}

	observeTools(): IObservable<readonly IToolData[]> {
		return constObservable([]);
	}

	getToolByName(name: string): IToolData | undefined {
		return undefined;
	}

	acceptProgress(sessionId: string | undefined, callId: string, progress: IProgressStep): void {

	}

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		return {
			content: [{ kind: 'text', value: 'result' }]
		};
	}

	beginToolCall(_options: IBeginToolCallOptions): IChatToolInvocation | undefined {
		// Mock implementation - return undefined
		return undefined;
	}

	async updateToolStream(_toolCallId: string, _partialInput: unknown, _token: CancellationToken): Promise<void> {
		// Mock implementation - do nothing
	}

	toolSets: IObservable<readonly IToolSet[]> = constObservable([]);

	getToolSetsForModel(model: ILanguageModelChatMetadata | undefined, reader?: IReader): Iterable<IToolSet> {
		return [];
	}

	getToolSetByName(name: string): IToolSet | undefined {
		return undefined;
	}

	getToolSet(id: string): IToolSet | undefined {
		return undefined;
	}

	createToolSet(): ToolSet & IDisposable {
		throw new Error('Method not implemented.');
	}

	toToolAndToolSetEnablementMap(toolOrToolSetNames: readonly string[], target: string | undefined): IToolAndToolSetEnablementMap {
		throw new Error('Method not implemented.');
	}

	toToolReferences(variableReferences: readonly IVariableReference[]): ChatRequestToolReferenceEntry[] {
		throw new Error('Method not implemented.');
	}

	getFullReferenceNames(): Iterable<string> {
		throw new Error('Method not implemented.');
	}

	getToolByFullReferenceName(qualifiedName: string): IToolData | IToolSet | undefined {
		throw new Error('Method not implemented.');
	}

	getFullReferenceName(tool: IToolData, set?: IToolSet): string {
		throw new Error('Method not implemented.');
	}

	toFullReferenceNames(map: IToolAndToolSetEnablementMap): string[] {
		throw new Error('Method not implemented.');
	}

	getDeprecatedFullReferenceNames(): Map<string, Set<string>> {
		throw new Error('Method not implemented.');
	}
}
