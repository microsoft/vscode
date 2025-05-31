/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolSet } from '../../common/languageModelToolsService.js';

export class MockLanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	constructor() { }

	cancelToolCallsForRequest(requestId: string): void {
	}

	onDidChangeTools: Event<void> = Event.None;

	registerToolData(toolData: IToolData): IDisposable {
		return Disposable.None;
	}

	resetToolAutoConfirmation(): void {

	}

	setToolAutoConfirmation(toolId: string, scope: 'workspace' | 'profile', autoConfirm?: boolean): void {

	}

	registerToolImplementation(name: string, tool: IToolImpl): IDisposable {
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

	createToolSet(): ToolSet & IDisposable {
		throw new Error('Method not implemented.');
	}

	toEnablementMap(toolOrToolSetNames: Iterable<string>): Record<string, boolean> {
		throw new Error('Method not implemented.');
	}
}
