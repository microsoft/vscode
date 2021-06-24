/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';
import { TerminalLocation } from 'vs/workbench/contrib/terminal/common/terminal';
import { getColorClass, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';

export class TerminalEditorInput extends EditorInput {

	static readonly ID = 'workbench.editors.terminal';

	private _isDetached = false;

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return TerminalEditor.ID;
	}

	override copy(): IEditorInput {
		const instance = this._terminalInstanceService.createInstance({}, TerminalLocation.Editor);
		return new TerminalEditorInput(instance, this._themeService, this._terminalInstanceService);
	}

	/**
	 * Returns the terminal instance for this input if it has not yet been detached from the input.
	 */
	get terminalInstance(): ITerminalInstance | undefined {
		return this._isDetached ? undefined : this._terminalInstance;
	}

	get resource(): URI {
		return this._terminalInstance.resource;
	}

	constructor(
		private readonly _terminalInstance: ITerminalInstance,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService
	) {
		super();
		this._register(this._terminalInstance.onTitleChanged(() => this._onDidChangeLabel.fire()));
		this._register(this._terminalInstance.onIconChanged(() => this._onDidChangeLabel.fire()));
		this._register(this._terminalInstance.statusList.onDidChangePrimaryStatus(() => this._onDidChangeLabel.fire()));
		this._register(this._terminalInstance.onDisposed(() => this.dispose()));
		this._register(toDisposable(() => {
			if (!this._isDetached) {
				this._terminalInstance.dispose();
			}
		}));
	}

	override getName() {
		return this._terminalInstance.title;
	}

	override getLabelExtraClasses(): string[] {
		const extraClasses: string[] = ['terminal-tab'];
		const colorClass = getColorClass(this._terminalInstance);
		if (colorClass) {
			extraClasses.push(colorClass);
		}
		const uriClasses = getUriClasses(this._terminalInstance, this._themeService.getColorTheme().type);
		if (uriClasses) {
			extraClasses.push(...uriClasses);
		}
		if (ThemeIcon.isThemeIcon(this._terminalInstance.icon)) {
			extraClasses.push(`codicon-${this._terminalInstance.icon.id}`);
		}
		return extraClasses;
	}

	/**
	 * Detach the instance from the input such that when the input is disposed it will not dispose
	 * of the terminal instance/process.
	 */
	detachInstance() {
		this._terminalInstance.detachFromElement();
		this._isDetached = true;
	}
}
