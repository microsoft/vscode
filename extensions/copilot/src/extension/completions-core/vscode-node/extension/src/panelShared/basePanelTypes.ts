/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Range } from 'vscode';
import { CopilotNamedAnnotationList } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';

// Base interface for a completion displayed in the panel.
export interface BasePanelCompletion {
	insertText: string;
	range: Range;
	copilotAnnotations?: CopilotNamedAnnotationList;
	postInsertionCallback: () => PromiseLike<void> | void;
}

// Interface for the suggestions panel, which handles work done notifications and item selections.
export interface ISuggestionsPanel {
	cancellationToken: CancellationToken;
	onWorkDone(_: { percentage: number }): void;
	onItem(_: BasePanelCompletion): void;
	onFinished(): void;
}

// Configuration for webview panels for completions.
export interface PanelConfig {
	panelTitle: string;
	webviewId: string;
	webviewScriptName: string;
	contextVariable: string;
	commands: {
		accept: string;
		navigatePrevious: string;
		navigateNext: string;
	};
	renderingMode: 'streaming' | 'batch';
	shuffleSolutions: boolean;
}

// Configuration for webview panels, used to pass settings to the webview.
export interface WebviewConfig {
	renderingMode: 'batch' | 'streaming';
	shuffleSolutions: boolean;
}
