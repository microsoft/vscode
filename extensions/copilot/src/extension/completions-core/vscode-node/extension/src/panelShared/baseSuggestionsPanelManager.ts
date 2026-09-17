/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, Uri, ViewColumn, WebviewPanel, commands, window } from 'vscode';
import { IVSCodeExtensionContext } from '../../../../../../platform/extContext/common/extensionContext';
import { DisposableStore, IDisposable } from '../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { IPosition, ITextDocument } from '../../../lib/src/textDocument';
import { basename } from '../../../lib/src/util/uri';
import { registerCommandWrapper } from '../telemetry';
import { BasePanelCompletion, PanelConfig } from './basePanelTypes';
import { BaseSuggestionsPanel, SuggestionsPanelManagerInterface } from './baseSuggestionsPanel';

export interface ListDocumentInterface {
	runQuery(): Promise<void>;
}

export abstract class BaseSuggestionsPanelManager<TPanelCompletion extends BasePanelCompletion>
	implements SuggestionsPanelManagerInterface {
	activeWebviewPanel: BaseSuggestionsPanel<TPanelCompletion> | undefined;
	private _panelCount: number = 0;

	constructor(
		protected readonly config: PanelConfig,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IVSCodeExtensionContext protected readonly _extensionContext: IVSCodeExtensionContext,
	) { }

	protected abstract createListDocument(
		wrapped: ITextDocument,
		position: IPosition,
		panel: BaseSuggestionsPanel<TPanelCompletion>
	): ListDocumentInterface;

	protected abstract createSuggestionsPanel(
		panel: WebviewPanel,
		document: TextDocument,
		manager: this
	): BaseSuggestionsPanel<TPanelCompletion>;

	renderPanel(
		document: TextDocument,
		position: IPosition,
		wrapped: ITextDocument
	): BaseSuggestionsPanel<TPanelCompletion> {
		const title = `${this.config.panelTitle} for ${basename(document.uri.toString()) || document.uri.toString()}`;
		const panel = window.createWebviewPanel(this.config.webviewId, title, ViewColumn.Two, {
			enableScripts: true,
			localResourceRoots: [Uri.joinPath(this._extensionContext.extensionUri, 'dist')],
			retainContextWhenHidden: true,
		});

		const suggestionPanel = this.createSuggestionsPanel(panel, document, this);
		// Listen for the panel disposal event to clear our reference
		suggestionPanel.onDidDispose(() => {
			if (this.activeWebviewPanel === suggestionPanel) {
				this.activeWebviewPanel = undefined;
			}
		});

		void this.createListDocument(wrapped, position, suggestionPanel).runQuery();

		this.activeWebviewPanel = suggestionPanel;
		this._panelCount = this._panelCount + 1;
		return suggestionPanel;
	}

	registerCommands(): IDisposable {
		const disposableStore = new DisposableStore();

		disposableStore.add(this._instantiationService.invokeFunction(registerCommandWrapper, this.config.commands.accept, () => {
			return this.activeWebviewPanel?.acceptFocusedSolution();
		}));

		disposableStore.add(this._instantiationService.invokeFunction(registerCommandWrapper, this.config.commands.navigatePrevious, () => {
			return this.activeWebviewPanel?.postMessage({
				command: 'navigatePreviousSolution',
			});
		}));

		disposableStore.add(this._instantiationService.invokeFunction(registerCommandWrapper, this.config.commands.navigateNext, () => {
			return this.activeWebviewPanel?.postMessage({
				command: 'navigateNextSolution',
			});
		}));

		return disposableStore;
	}

	decrementPanelCount() {
		this._panelCount = this._panelCount - 1;
		if (this._panelCount === 0) {
			void commands.executeCommand('setContext', this.config.contextVariable, false);
		}
	}
}
