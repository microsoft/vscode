/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IVariableReference } from '../../common/chatModes.js';
import { ChatRequestToolReferenceEntry } from '../../common/chatVariableEntries.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolSet } from '../../common/languageModelToolsService.js';

export class MockLanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

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

	getTools(): Iterable<Readonly<IToolData>> {
		return [];
	}

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

	getQualifiedToolNames(): Iterable<string> {
		throw new Error('Method not implemented.');
	}

	getToolByQualifiedName(qualifiedName: string): IToolData | ToolSet | undefined {
		throw new Error('Method not implemented.');
	}

	getQualifiedToolName(tool: IToolData, set?: ToolSet): string {
		throw new Error('Method not implemented.');
	}

	toQualifiedToolNames(map: IToolAndToolSetEnablementMap): string[] {
		throw new Error('Method not implemented.');
	}

	getDeprecatedQualifiedToolNames(): Map<string, string> {
		throw new Error('Method not implemented.');
	}

	mapGithubToolName(githubToolName: string): string {
		throw new Error('Method not implemented.');
	}
}
