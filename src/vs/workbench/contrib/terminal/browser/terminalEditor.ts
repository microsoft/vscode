/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { ITerminalEditorService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditorInput } from 'vs/workbench/contrib/terminal/browser/terminalEditorInput';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminal/browser/terminalFindWidget';
import { KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE } from 'vs/workbench/contrib/terminal/common/terminal';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

const xtermSelector = '.terminal.xterm';
const findWidgetSelector = '.simple-find-part-wrapper';

export class TerminalEditor extends EditorPane {

	public static readonly ID = 'terminalEditor';

	private _parentElement: HTMLElement | undefined;

	private _editorInput?: TerminalEditorInput = undefined;

	private _lastDimension?: Dimension;

	private _findWidget: TerminalFindWidget;
	private _findWidgetVisible: IContextKey<boolean>;
	private _findState: FindReplaceState;

	get findState(): FindReplaceState { return this._findState; }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(TerminalEditor.ID, telemetryService, themeService, storageService);
		this._findState = new FindReplaceState();
		this._findWidget = instantiationService.createInstance(TerminalFindWidget, this._findState);
		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_VISIBLE.bindTo(contextKeyService);
	}

	override async setInput(newInput: TerminalEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this._editorInput?.terminalInstance?.detachFromElement();
		this._editorInput = newInput;
		await super.setInput(newInput, options, context, token);
		this._editorInput.terminalInstance?.attachToElement(this._parentElement!);
		if (this._lastDimension) {
			this.layout(this._lastDimension);
		}
		this._editorInput.terminalInstance?.setVisible(true);
		if (this._editorInput.terminalInstance) {
			// since the editor does not monitor focus changes, for ex. between the terminal
			// panel and the editors, this is needed so that the active instance gets set
			// when focus changes between them.
			this._register(this._editorInput.terminalInstance.onFocused(() => this._setActiveInstance()));
		}
	}

	private _setActiveInstance(): void {
		if (!this._editorInput?.terminalInstance) {
			return;
		}
		this._terminalEditorService.setActiveInstance(this._editorInput.terminalInstance);
	}

	override focus() {
		this._editorInput?.terminalInstance?.focus();
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention
	protected createEditor(parent: HTMLElement): void {
		this._parentElement = parent;
	}

	layout(dimension: Dimension): void {
		this._editorInput?.terminalInstance?.layout(dimension);
		this._lastDimension = dimension;
	}

	override setVisible(visible: boolean, group?: IEditorGroup): void {
		super.setVisible(visible, group);
		return this._editorInput?.terminalInstance?.setVisible(visible);
	}

	focusFindWidget() {
		if (this._parentElement && !this._parentElement?.querySelector(findWidgetSelector)) {
			this._parentElement.querySelector(xtermSelector)!.appendChild(this._findWidget.getDomNode());
		}
		this._findWidgetVisible.set(true);
		const activeInstance = this._terminalEditorService.activeInstance;
		if (activeInstance && activeInstance.hasSelection() && activeInstance.selection!.indexOf('\n') === -1) {
			this._findWidget.reveal(activeInstance.selection);
		} else {
			this._findWidget.reveal();
		}
	}

	hideFindWidget() {
		this._findWidgetVisible.reset();
		this.focus();
		this._findWidget.hide();
	}

	showFindWidget() {
		const activeInstance = this._terminalEditorService.activeInstance;
		if (activeInstance && activeInstance.hasSelection() && activeInstance.selection!.indexOf('\n') === -1) {
			this._findWidget.show(activeInstance.selection);
		} else {
			this._findWidget.show();
		}
	}

	getFindWidget(): TerminalFindWidget {
		return this._findWidget;
	}
}
