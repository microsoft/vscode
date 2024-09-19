/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { CountTokensCallback, ILanguageModelToolsService, IToolData, IToolImpl, IToolInvocation, IToolResult } from '../../common/languageModelToolsService.js';

export class MockLanguageModelToolsService implements ILanguageModelToolsService {
	_serviceBrand: undefined;

	constructor() { }

	onDidChangeTools: Event<void> = Event.None;

	registerToolData(toolData: IToolData): IDisposable {
		return Disposable.None;
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

	getToolByName(name: string): IToolData | undefined {
		return undefined;
	}

	async invokeTool(dto: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult> {
		return {
			string: ''
		};
	}
}
