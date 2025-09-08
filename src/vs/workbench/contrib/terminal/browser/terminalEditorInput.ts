/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import Severity from '../../../../base/common/severity.js';
import { dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorIdentifier, IUntypedEditorInput } from '../../../common/editor.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { ITerminalInstance, ITerminalInstanceService, terminalEditorId } from './terminal.js';
import { getColorClass, getUriClasses } from './terminalIcon.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IShellLaunchConfig, TerminalExitReason, TerminalLocation, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ILifecycleService, ShutdownReason, WillShutdownEvent } from '../../../services/lifecycle/common/lifecycle.js';
import { ConfirmOnKill } from '../common/terminal.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { Emitter } from '../../../../base/common/event.js';

export class TerminalEditorInput extends EditorInput implements IEditorCloseHandler {

	static readonly ID = 'workbench.editors.terminal';

	override readonly closeHandler = this;

	private _isDetached = false;
	private _isShuttingDown = false;
	private _isReverted = false;
	private _copyLaunchConfig?: IShellLaunchConfig;
	private _terminalEditorFocusContextKey: IContextKey<boolean>;
	private _group: IEditorGroup | undefined;

	protected readonly _onDidRequestAttach = this._register(new Emitter<ITerminalInstance>());
	readonly onDidRequestAttach = this._onDidRequestAttach.event;

	setGroup(group: IEditorGroup | undefined) {
		this._group = group;
		if (group?.scopedContextKeyService) {
			this._terminalInstance?.setParentContextKeyService(group.scopedContextKeyService);
		}
	}

	get group(): IEditorGroup | undefined {
		return this._group;
	}

	override get typeId(): string {
		return TerminalEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return terminalEditorId;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor | EditorInputCapabilities.ForceDescription;
	}

	setTerminalInstance(instance: ITerminalInstance): void {
		if (this._terminalInstance) {
			throw new Error('cannot set instance that has already been set');
		}
		this._terminalInstance = instance;
		this._setupInstanceListeners();
	}

	override copy(): EditorInput {
		const instance = this._terminalInstanceService.createInstance(this._copyLaunchConfig || {}, TerminalLocation.Editor);
		instance.focusWhenReady();
		this._copyLaunchConfig = undefined;
		return this._instantiationService.createInstance(TerminalEditorInput, instance.resource, instance);
	}

	/**
	 * Sets the launch config to use for the next call to EditorInput.copy, which will be used when
	 * the editor's split command is run.
	 */
	setCopyLaunchConfig(launchConfig: IShellLaunchConfig) {
		this._copyLaunchConfig = launchConfig;
	}

	/**
	 * Returns the terminal instance for this input if it has not yet been detached from the input.
	 */
	get terminalInstance(): ITerminalInstance | undefined {
		return this._isDetached ? undefined : this._terminalInstance;
	}

	showConfirm(): boolean {
		if (this._isReverted) {
			return false;
		}
		const confirmOnKill = this._configurationService.getValue<ConfirmOnKill>(TerminalSettingId.ConfirmOnKill);
		if (confirmOnKill === 'editor' || confirmOnKill === 'always') {
			return this._terminalInstance?.hasChildProcesses || false;
		}
		return false;
	}

	async confirm(terminals: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult> {
		const { confirmed } = await this._dialogService.confirm({
			type: Severity.Warning,
			message: localize('confirmDirtyTerminal.message', "Do you want to terminate running processes?"),
			primaryButton: localize({ key: 'confirmDirtyTerminal.button', comment: ['&& denotes a mnemonic'] }, "&&Terminate"),
			detail: terminals.length > 1 ?
				terminals.map(terminal => terminal.editor.getName()).join('\n') + '\n\n' + localize('confirmDirtyTerminals.detail', "Closing will terminate the running processes in the terminals.") :
				localize('confirmDirtyTerminal.detail', "Closing will terminate the running processes in this terminal.")
		});

		return confirmed ? ConfirmResult.DONT_SAVE : ConfirmResult.CANCEL;
	}

	override async revert(): Promise<void> {
		// On revert just treat the terminal as permanently non-dirty
		this._isReverted = true;
	}

	constructor(
		public readonly resource: URI,
		private _terminalInstance: ITerminalInstance | undefined,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalInstanceService private readonly _terminalInstanceService: ITerminalInstanceService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IDialogService private readonly _dialogService: IDialogService
	) {
		super();

		this._terminalEditorFocusContextKey = TerminalContextKeys.editorFocus.bindTo(_contextKeyService);

		if (_terminalInstance) {
			this._setupInstanceListeners();
		}
	}

	private _setupInstanceListeners(): void {
		const instance = this._terminalInstance;
		if (!instance) {
			return;
		}

		const instanceOnDidFocusListener = instance.onDidFocus(() => this._terminalEditorFocusContextKey.set(true));
		const instanceOnDidBlurListener = instance.onDidBlur(() => this._terminalEditorFocusContextKey.reset());

		const disposeListeners = [
			instance.onExit((e) => {
				if (!instance.waitOnExit) {
					this.dispose();
				}
			}),
			instance.onDisposed(() => this.dispose()),
			instance.onTitleChanged(() => this._onDidChangeLabel.fire()),
			instance.onIconChanged(() => this._onDidChangeLabel.fire()),
			instanceOnDidFocusListener,
			instanceOnDidBlurListener,
			instance.statusList.onDidChangePrimaryStatus(() => this._onDidChangeLabel.fire())
		];

		this._register(toDisposable(() => {
			if (!this._isDetached && !this._isShuttingDown) {
				// Will be ignored if triggered by onExit or onDisposed terminal events
				// as disposed was already called
				instance.dispose(TerminalExitReason.User);
			}
			dispose(disposeListeners);
			dispose([instanceOnDidFocusListener, instanceOnDidBlurListener]);
		}));

		// Don't dispose editor when instance is torn down on shutdown to avoid extra work and so
		// the editor/tabs don't disappear
		this._register(this._lifecycleService.onWillShutdown((e: WillShutdownEvent) => {
			this._isShuttingDown = true;
			dispose(disposeListeners);

			// Don't touch processes if the shutdown was a result of reload as they will be reattached
			const shouldPersistTerminals = this._configurationService.getValue<boolean>(TerminalSettingId.EnablePersistentSessions) && e.reason === ShutdownReason.RELOAD;
			if (shouldPersistTerminals) {
				instance.detachProcessAndDispose(TerminalExitReason.Shutdown);
			} else {
				instance.dispose(TerminalExitReason.Shutdown);
			}
		}));
	}

	override getName() {
		return this._terminalInstance?.title || this.resource.fragment;
	}

	override getIcon(): ThemeIcon | undefined {
		if (!this._terminalInstance || !ThemeIcon.isThemeIcon(this._terminalInstance.icon)) {
			return undefined;
		}
		return this._terminalInstance.icon;
	}

	override getLabelExtraClasses(): string[] {
		if (!this._terminalInstance) {
			return [];
		}
		const extraClasses: string[] = ['terminal-tab', 'predefined-file-icon'];
		const colorClass = getColorClass(this._terminalInstance);
		if (colorClass) {
			extraClasses.push(colorClass);
		}
		const uriClasses = getUriClasses(this._terminalInstance, this._themeService.getColorTheme().type);
		if (uriClasses) {
			extraClasses.push(...uriClasses);
		}
		return extraClasses;
	}

	/**
	 * Detach the instance from the input such that when the input is disposed it will not dispose
	 * of the terminal instance/process.
	 */
	detachInstance() {
		if (!this._isShuttingDown) {
			this._terminalInstance?.detachFromElement();
			this._terminalInstance?.setParentContextKeyService(this._contextKeyService);
			this._isDetached = true;
		}
	}

	public override getDescription(): string | undefined {
		return this._terminalInstance?.description;
	}

	public override toUntyped(): IUntypedEditorInput {
		return {
			resource: this.resource,
			options: {
				override: terminalEditorId,
				pinned: true,
				forceReload: true
			}
		};
	}
}
