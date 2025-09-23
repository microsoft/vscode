


declare module 'positron' {

	import * as vscode from 'vscode';

	export interface PositronApi {
		version: string;
		runtime: PositronRuntime;
		languages: PositronLanguages;
		window: PositronWindow;
	}

	export interface PositronRuntime {
		executeCode(
			languageId: string,
			code: string,
			focus: boolean,
			allowIncomplete: boolean
		): Thenable<boolean>;
	}

	export interface PositronLanguages {
		registerStatementRangeProvider(
			selector: vscode.DocumentSelector,
			provider: StatementRangeProvider
		): vscode.Disposable;
		registerHelpTopicProvider(
			selector: vscode.DocumentSelector,
			provider: HelpTopicProvider
		): vscode.Disposable;
	}

	export interface StatementRangeProvider {
		provideStatementRange(
			document: vscode.TextDocument,
			position: vscode.Position,
			token: vscode.CancellationToken
		): vscode.ProviderResult<StatementRange>;
	}

	export interface HelpTopicProvider {
		provideHelpTopic(
			document: vscode.TextDocument,
			position: vscode.Position,
			token: vscode.CancellationToken
		): vscode.ProviderResult<string>;
	}

	export interface StatementRange {
		readonly range: vscode.Range;
		readonly code?: string;
	}

	export interface PositronWindow {
		createPreviewPanel(
			viewType: string,
			title: string,
			preserveFocus?: boolean,
			options?: PreviewOptions
		): PreviewPanel;
	}

	export interface PreviewOptions {
		readonly enableScripts?: boolean;
		readonly enableForms?: boolean;
		readonly localResourceRoots?: readonly vscode.Uri[];
		readonly portMapping?: readonly vscode.WebviewPortMapping[];
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

	export interface PreviewPanelOnDidChangeViewStateEvent {
		readonly previewPanel: PreviewPanel;
	}
}
