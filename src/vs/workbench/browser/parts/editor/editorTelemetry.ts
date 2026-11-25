/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Editor IDs that are safe to send in telemetry: editors registered by core
 * and by built-in extensions, plus a few well-known first-party editors.
 *
 * Arbitrary editor IDs (e.g. extension custom editor or webview view types)
 * can contain sensitive data and must not be sent.
 */
const knownEditorIds: ReadonlySet<string> = new Set([
	// Core
	'default', // text, diff, merge and multi diff editors
	'workbench.editor.browser',
	'workbench.editor.chatSession',
	'workbench.editor.chatDebug',
	'workbench.editor.processExplorer',
	'workbench.editor.agentSessions.emptyFile',
	'workbench.editor.agentSessions.sessionChanges',
	'workbench.editors.gettingStartedInput',
	'workbench.editorinputs.searchEditorInput',
	'workbench.editorinputs.sidebysideEditorInput', // split JSON settings editor
	'workbench.input.issueReporter',
	'workbench.input.survey',
	'sessions.editor.canvas',
	'sessions.editor.windowCanvas',
	'imagePreview.previewEditor',
	'vscode.videoPreview',
	'vscode.audioPreview',
	'terminalEditor',
	'interactive',
	'repl',
	'notebookOutputEditor',

	// Built-in extensions
	'vscode.markdown.editor',
	'vscode.markdown.preview.editor',
	'jupyter-notebook',
	// Webview panels report their view type with this prefix
	'mainThreadWebview-markdown.preview',
	'mainThreadWebview-vscode.mermaid-markdown-features.preview',
	'mainThreadWebview-simpleBrowser.view',

	// Well-known first-party extensions
	'hexEditor.hexedit',
]);

/**
 * Maps an editor ID to a value that is safe to send in telemetry:
 * the ID itself if it is a known editor, `'other'` otherwise and
 * `'none'` if there is no editor ID.
 */
export function getEditorTelemetryId(editorId: string | undefined): string {
	if (editorId === undefined) {
		return 'none';
	}

	return knownEditorIds.has(editorId) ? editorId : 'other';
}
