/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose, toDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IEditorInput } from 'vs/workbench/common/editor';
import { IThemeService, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITerminalInstance, ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalEditor } from 'vs/workbench/contrib/terminal/browser/terminalEditor';
import { getColorClass, getUriClasses } from 'vs/workbench/contrib/terminal/browser/terminalIcon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalLocation } from 'vs/platform/terminal/common/terminal';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class TerminalEditorInput extends EditorInput {

	static readonly ID = 'workbench.editors.terminal';

	private _isDetached = false;
	private _isShuttingDown = false;
	private _copyInstance?: ITerminalInstance;

	private _group: IEditorGroup | undefined;

	setGroup(group: IEditorGroup | undefined) {
		this._group = group;
	}

	get group(): IEditorGroup | undefined {
		return this._group;
	}

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return TerminalEditor.ID;
	}

	override copy(): IEditorInput {
		const instance = this._copyInstance || this._terminalInstanceService.createInstance({}, TerminalLocation.Editor);
		instance.focusWhenReady();
		this._copyInstance = undefined;
		return this._instantiationService.createInstance(TerminalEditorInput, instance);
	}

	/**
	 * Sets what instance to use for the next call to IEditorInput.copy, this is used to define what
	 * terminal instance is used when the editor's split command is run.
	 */
	setCopyInstance(instance: ITerminalInstance) {
		this._copyInstance = instance;
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
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		super();

		this._register(toDisposable(() => {
			if (!this._isDetached && !this._isShuttingDown) {
				this._terminalInstance.dispose();
			}
		}));

		const disposeListeners = [
			this._terminalInstance.onExit(() => this.dispose()),
			this._terminalInstance.onDisposed(() => this.dispose()),
			this._terminalInstance.onTitleChanged(() => this._onDidChangeLabel.fire()),
			this._terminalInstance.onIconChanged(() => this._onDidChangeLabel.fire()),
			this._terminalInstance.statusList.onDidChangePrimaryStatus(() => this._onDidChangeLabel.fire())
		];

		// Don't dispose editor when instance is torn down on shutdown to avoid extra work and so
		// the editor/tabs don't disappear
		lifecycleService.onWillShutdown(() => {
			this._isShuttingDown = true;
			dispose(disposeListeners);
		});
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
		if (!this._isShuttingDown) {
			this._terminalInstance.detachFromElement();
			this._isDetached = true;
		}
	}
}
