/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as interfaces from './interfaces';
import { loadMessageBundle } from 'vscode-nls';
const localize = loadMessageBundle();

export default class MergeDectorator implements vscode.Disposable {

	private decorations: { [key: string]: vscode.TextEditorDecorationType } = {};

	private decorationUsesWholeLine: boolean = true; // Useful for debugging, set to false to see exact match ranges

	private config: interfaces.IExtensionConfiguration;
	private tracker: interfaces.IDocumentMergeConflictTracker;

	constructor(private context: vscode.ExtensionContext, trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('decorator');
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.config = config;
		this.registerDecorationTypes(config);

		// Check if we already have a set of active windows, attempt to track these.
		vscode.window.visibleTextEditors.forEach(e => this.applyDecorations(e));

		vscode.workspace.onDidOpenTextDocument(event => {
			this.applyDecorationsFromEvent(event);
		}, null, this.context.subscriptions);

		vscode.workspace.onDidChangeTextDocument(event => {
			this.applyDecorationsFromEvent(event.document);
		}, null, this.context.subscriptions);

		vscode.window.onDidChangeActiveTextEditor((e) => {
			// New editor attempt to apply
			this.applyDecorations(e);
		}, null, this.context.subscriptions);
	}

	configurationUpdated(config: interfaces.IExtensionConfiguration) {
		this.config = config;
		this.registerDecorationTypes(config);

		// Re-apply the decoration
		vscode.window.visibleTextEditors.forEach(e => {
			this.removeDecorations(e);
			this.applyDecorations(e);
		});
	}

	private registerDecorationTypes(config: interfaces.IExtensionConfiguration) {

		// Dispose of existing decorations
		Object.keys(this.decorations).forEach(k => this.decorations[k].dispose());
		this.decorations = {};

		// None of our features are enabled
		if (!config.enableDecorations || !config.enableEditorOverview) {
			return;
		}

		// Create decorators
		if (config.enableDecorations || config.enableEditorOverview) {
			this.decorations['current.content'] = vscode.window.createTextEditorDecorationType(
				this.generateBlockRenderOptions('merge.currentContentBackground', 'overviewRuler.currentContentForeground', config)
			);

			this.decorations['incoming.content'] = vscode.window.createTextEditorDecorationType(
				this.generateBlockRenderOptions('merge.incomingContentBackground', 'overviewRuler.incomingContentForeground', config)
			);
		}

		if (config.enableDecorations) {
			this.decorations['current.header'] = vscode.window.createTextEditorDecorationType({
				isWholeLine: this.decorationUsesWholeLine,
				backgroundColor: new vscode.ThemeColor('merge.currentHeaderBackground'),
				color: new vscode.ThemeColor('editor.foreground'),
				after: {
					contentText: ' ' + localize('currentChange', '(Current change)'),
					color: new vscode.ThemeColor('descriptionForeground')
				}
			});

			this.decorations['splitter'] = vscode.window.createTextEditorDecorationType({
				color: new vscode.ThemeColor('editor.foreground'),
				isWholeLine: this.decorationUsesWholeLine,
			});

			this.decorations['incoming.header'] = vscode.window.createTextEditorDecorationType({
				backgroundColor: new vscode.ThemeColor('merge.incomingHeaderBackground'),
				color: new vscode.ThemeColor('editor.foreground'),
				isWholeLine: this.decorationUsesWholeLine,
				after: {
					contentText: ' ' + localize('incomingChange', '(Incoming change)'),
					color: new vscode.ThemeColor('descriptionForeground')
				}
			});
		}
	}

	dispose() {

		// TODO: Replace with Map<string, T>
		Object.keys(this.decorations).forEach(name => {
			this.decorations[name].dispose();
		});

		this.decorations = {};
	}

	private generateBlockRenderOptions(backgroundColor: string, overviewRulerColor: string, config: interfaces.IExtensionConfiguration): vscode.DecorationRenderOptions {

		let renderOptions: vscode.DecorationRenderOptions = {};

		if (config.enableDecorations) {
			renderOptions.backgroundColor = new vscode.ThemeColor(backgroundColor);
			renderOptions.isWholeLine = this.decorationUsesWholeLine;
		}

		if (config.enableEditorOverview) {
			renderOptions.overviewRulerColor = new vscode.ThemeColor(overviewRulerColor);
			renderOptions.overviewRulerLane = vscode.OverviewRulerLane.Full;
		}

		return renderOptions;
	}

	private applyDecorationsFromEvent(eventDocument: vscode.TextDocument) {
		for (var i = 0; i < vscode.window.visibleTextEditors.length; i++) {
			if (vscode.window.visibleTextEditors[i].document === eventDocument) {
				// Attempt to apply
				this.applyDecorations(vscode.window.visibleTextEditors[i]);
			}
		}
	}

	private async applyDecorations(editor: vscode.TextEditor) {
		if (!editor || !editor.document) { return; }

		if (!this.config || (!this.config.enableDecorations && !this.config.enableEditorOverview)) {
			return;
		}

		// If we have a pending scan from the same origin, exit early.
		if (this.tracker.isPending(editor.document)) {
			return;
		}

		let conflicts = await this.tracker.getConflicts(editor.document);

		if (conflicts.length === 0) {
			this.removeDecorations(editor);
			return;
		}

		// Store decorations keyed by the type of decoration, set decoration wants a "style"
		// to go with it, which will match this key (see constructor);
		let matchDecorations: { [key: string]: vscode.DecorationOptions[] } = {};

		let pushDecoration = (key: string, d: vscode.DecorationOptions) => {
			matchDecorations[key] = matchDecorations[key] || [];
			matchDecorations[key].push(d);
		};

		conflicts.forEach(conflict => {
			// TODO, this could be more effective, just call getMatchPositions once with a map of decoration to position
			pushDecoration('current.content', { range: conflict.current.decoratorContent });
			pushDecoration('incoming.content', { range: conflict.incoming.decoratorContent });

			if (this.config.enableDecorations) {
				pushDecoration('current.header', { range: conflict.current.header });
				pushDecoration('splitter', { range: conflict.splitter });
				pushDecoration('incoming.header', { range: conflict.incoming.header });
			}
		});

		// For each match we've generated, apply the generated decoration with the matching decoration type to the
		// editor instance. Keys in both matches and decorations should match.
		Object.keys(matchDecorations).forEach(decorationKey => {
			let decorationType = this.decorations[decorationKey];

			if (decorationType) {
				editor.setDecorations(decorationType, matchDecorations[decorationKey]);
			}
		});
	}

	private removeDecorations(editor: vscode.TextEditor) {
		// Remove all decorations, there might be none
		Object.keys(this.decorations).forEach(decorationKey => {

			// Race condition, while editing the settings, it's possible to
			// generate regions before the configuration has been refreshed
			let decorationType = this.decorations[decorationKey];

			if (decorationType) {
				editor.setDecorations(decorationType, []);
			}
		});
	}
}