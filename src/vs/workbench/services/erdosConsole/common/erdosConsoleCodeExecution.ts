/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuntimeCodeExecutionMode, RuntimeErrorBehavior } from '../../languageRuntime/common/languageRuntimeService.js';

export const enum CodeAttributionSource {
	Assistant = 'assistant',
	Extension = 'extension',
	Interactive = 'interactive',
	Notebook = 'notebook',
	Paste = 'paste',
	Script = 'script',
}

export interface IConsoleCodeAttribution {
	source: CodeAttributionSource;
	metadata?: Record<string, any>;
}

export interface ILanguageRuntimeCodeExecutedEvent {
	executionId?: string;
	sessionId: string;
	languageId: string;
	code: string;
	attribution: IConsoleCodeAttribution;
	runtimeName: string;
	mode: RuntimeCodeExecutionMode;
	errorBehavior: RuntimeErrorBehavior;
}
