/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IVariableReference } from '../../common/chatModes.js';
import { ChatRequestToolReferenceEntry } from '../../common/chatVariableEntries.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolSet } from '../../common/languageModelToolsService.js';

export class MockLanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;
	vscodeToolSet: ToolSet = new ToolSet('vscode', 'vscode', ThemeIcon.fromId(Codicon.code.id), ToolDataSource.Internal);
	executeToolSet: ToolSet = new ToolSet('execute', 'execute', ThemeIcon.fromId(Codicon.terminal.id), ToolDataSource.Internal);
	readToolSet: ToolSet = new ToolSet('read', 'read', ThemeIcon.fromId(Codicon.eye.id), ToolDataSource.Internal);

	constructor() { }

	readonly onDidChangeTools: Event<void> = Event.None;
	readonly onDidPrepareToolCallBecomeUnresponsive: Event<{ sessionId: string; toolData: IToolData }> = Event.None;

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

	toolsObservable: IObservable<readonly IToolData[]> = constObservable([]);

	getTool(id: string): IToolData | undefined {
		return undefined;
	}

	getToolByName(name: string, includeDisabled?: boolean): IToolData | undefined {
		return undefined;
	}

	acceptProgress(sessionId: string | undefined, callId: string, progress: IProgressStep): void {

	}

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		return {
			content: [{ kind: 'text', value: 'result' }]
		};
	}

	toolSets: IObservable<readonly ToolSet[]> = constObservable([]);

	getToolSetByName(name: string): ToolSet | undefined {
		return undefined;
	}

	getToolSet(id: string): ToolSet | undefined {
		return undefined;
	}

	createToolSet(): ToolSet & IDisposable {
		throw new Error('Method not implemented.');
	}

	toToolAndToolSetEnablementMap(toolOrToolSetNames: readonly string[]): IToolAndToolSetEnablementMap {
		throw new Error('Method not implemented.');
	}

	toToolReferences(variableReferences: readonly IVariableReference[]): ChatRequestToolReferenceEntry[] {
		throw new Error('Method not implemented.');
	}

	getFullReferenceNames(): Iterable<string> {
		throw new Error('Method not implemented.');
	}

	getToolByFullReferenceName(qualifiedName: string): IToolData | ToolSet | undefined {
		throw new Error('Method not implemented.');
	}

	getFullReferenceName(tool: IToolData, set?: ToolSet): string {
		throw new Error('Method not implemented.');
	}

	toFullReferenceNames(map: IToolAndToolSetEnablementMap): string[] {
		throw new Error('Method not implemented.');
	}

	getDeprecatedFullReferenceNames(): Map<string, Set<string>> {
		throw new Error('Method not implemented.');
	}
}
