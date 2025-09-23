/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'erdos' {
	import * as vscode from 'vscode';

	export interface StatementRange {
		readonly range: vscode.Range;
		readonly code?: string;
	}

	export interface StatementRangeProvider {
		provideStatementRange(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<StatementRange>;
	}

	export interface HelpTopicProvider {
		provideHelpTopic(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<string>;
	}

	export interface PreviewOptions extends vscode.WebviewPanelOptions, vscode.WebviewOptions {
	}

	export interface PreviewPanelOnDidChangeViewStateEvent {
		readonly previewPanel: PreviewPanel;
	}

	export interface PreviewPanel {
		readonly viewType: string;
		title: string;
		readonly webview: vscode.Webview;
		readonly active: boolean;
		readonly visible: boolean;
		readonly onDidChangeViewState: vscode.Event<PreviewPanelOnDidChangeViewStateEvent>;
		readonly onDidDispose: vscode.Event<void>;
		reveal(preserveFocus?: boolean): void;
		dispose(): any;
	}

	export enum RuntimeCodeExecutionMode {
		Interactive = 'interactive',
		NonInteractive = 'non-interactive',
		Transient = 'transient',
		Silent = 'silent'
	}

	export enum RuntimeErrorBehavior {
		Stop = 'stop',
		Continue = 'continue',
	}

	namespace languages {
		export function registerStatementRangeProvider(selector: vscode.DocumentSelector, provider: StatementRangeProvider): vscode.Disposable;
		export function registerHelpTopicProvider(selector: vscode.DocumentSelector, provider: HelpTopicProvider): vscode.Disposable;
	}

	namespace window {
		export function createPreviewPanel(viewType: string, title: string, preserveFocus?: boolean, options?: PreviewOptions): PreviewPanel;
		export function previewUrl(url: vscode.Uri): PreviewPanel;
		export function previewHtml(path: string): void;
	}

	namespace runtime {
		export interface ExecutionObserver {
			token?: vscode.CancellationToken;
			onStarted?: () => void;
			onOutput?: (message: string) => void;
			onError?: (message: string) => void;
			onPlot?: (plotData: string) => void;
			onData?: (data: any) => void;
			onCompleted?: (result: Record<string, any>) => void;
			onFailed?: (error: Error) => void;
			onFinished?: () => void;
		}

		export function executeCode(languageId: string, code: string, focus: boolean, allowIncomplete?: boolean, mode?: RuntimeCodeExecutionMode, errorBehavior?: RuntimeErrorBehavior, observer?: ExecutionObserver): Thenable<Record<string, any>>;
	}
}
