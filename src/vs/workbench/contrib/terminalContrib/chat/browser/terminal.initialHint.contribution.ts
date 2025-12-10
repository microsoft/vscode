/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { IDecoration, ITerminalAddon, Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IChatAgent, IChatAgentService } from '../../../chat/common/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInstance } from '../../../terminal/browser/terminalInstance.js';
import { TerminalInitialHintSettingId } from '../common/terminalInitialHintConfiguration.js';
import './media/terminalInitialHint.css';
import { TerminalInlineHintWidget, TerminalInitialHintConstants } from './terminalInlineHintWidget.js';

export class InitialHintAddon extends Disposable implements ITerminalAddon {
	private readonly _onDidRequestCreateHint = this._register(new Emitter<void>());
	get onDidRequestCreateHint(): Event<void> { return this._onDidRequestCreateHint.event; }
	private readonly _disposables = this._register(new MutableDisposable<DisposableStore>());

	constructor(private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _onDidChangeAgents: Event<IChatAgent | undefined>) {
		super();
	}
	activate(terminal: RawXtermTerminal): void {
		const store = this._register(new DisposableStore());
		this._disposables.value = store;
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (capability) {
			store.add(Event.once(capability.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
		} else {
			this._register(this._capabilities.onDidAddCapability(e => {
				if (e.id === TerminalCapability.CommandDetection) {
					const capability = e.capability;
					store.add(Event.once(capability.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
					if (!capability.promptInputModel.value) {
						this._onDidRequestCreateHint.fire();
					}
				}
			}));
		}
		const agentListener = this._onDidChangeAgents((e) => {
			if (e?.locations.includes(ChatAgentLocation.Terminal)) {
				this._onDidRequestCreateHint.fire();
				agentListener.dispose();
			}
		});
		this._disposables.value?.add(agentListener);
	}
}

export class TerminalInitialHintContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.initialHint';

	private _addon: InitialHintAddon | undefined;

	private _hintWidget: HTMLElement | undefined;

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalInitialHintContribution | null {
		return instance.getContribution<TerminalInitialHintContribution>(TerminalInitialHintContribution.ID);
	}
	private _decoration: IDecoration | undefined;
	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;

	constructor(
		private readonly _ctx: ITerminalContributionContext | IDetachedCompatibleTerminalContributionContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
	) {
		super();

		// Reset hint state when config changes
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled)) {
				this._storageService.remove(TerminalInitialHintConstants.InitialHintHideStorageKey, StorageScope.APPLICATION);
			}
		}));
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Don't show is the terminal was launched by an extension or a feature like debug
		if (hasKey(this._ctx.instance, { shellLaunchConfig: true }) && (this._ctx.instance.shellLaunchConfig.isExtensionOwnedTerminal || this._ctx.instance.shellLaunchConfig.isFeatureTerminal)) {
			return;
		}
		// Don't show if disabled
		if (this._storageService.getBoolean(TerminalInitialHintConstants.InitialHintHideStorageKey, StorageScope.APPLICATION, false)) {
			return;
		}
		// Only show for the first terminal
		if (this._terminalGroupService.instances.length + this._terminalEditorService.instances.length !== 1) {
			return;
		}
		this._xterm = xterm;
		this._addon = this._register(this._instantiationService.createInstance(InitialHintAddon, this._ctx.instance.capabilities, this._chatAgentService.onDidChangeAgents));
		this._xterm.raw.loadAddon(this._addon);
		this._register(this._addon.onDidRequestCreateHint(() => this._createHint()));
	}

	private _createHint(): void {
		const instance = this._ctx.instance instanceof TerminalInstance ? this._ctx.instance : undefined;
		const commandDetectionCapability = instance?.capabilities.get(TerminalCapability.CommandDetection);
		if (!instance || !this._xterm || this._hintWidget || !commandDetectionCapability || commandDetectionCapability.promptInputModel.value || !!instance.shellLaunchConfig.attachPersistentProcess) {
			return;
		}

		if (!this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
			return;
		}

		if (!this._decoration) {
			const marker = this._xterm.raw.registerMarker();
			if (!marker) {
				return;
			}

			if (this._xterm.raw.buffer.active.cursorX === 0) {
				return;
			}
			this._register(marker);
			this._decoration = this._xterm.raw.registerDecoration({
				marker,
				x: this._xterm.raw.buffer.active.cursorX + 1,
			});
			if (this._decoration) {
				this._register(this._decoration);
			}
		}

		this._register(this._xterm.raw.onKey(() => this.dispose()));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
				this.dispose();
			}
		}));

		const inputModel = commandDetectionCapability.promptInputModel;
		if (inputModel) {
			this._register(inputModel.onDidChangeInput(() => {
				if (inputModel.value) {
					this.dispose();
				}
			}));
		}

		if (!this._decoration) {
			return;
		}
		this._register(this._decoration);
		this._register(this._decoration.onRender((e) => {
			if (!this._hintWidget && this._xterm?.isFocused && this._terminalGroupService.instances.length + this._terminalEditorService.instances.length === 1) {
				const terminalAgents = this._chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.Terminal));
				if (terminalAgents?.length) {
					const widget = this._register(this._instantiationService.createInstance(TerminalInitialHintWidget, instance));
					this._addon?.dispose();
					this._hintWidget = widget.getDomNode(terminalAgents);
					if (!this._hintWidget) {
						return;
					}
					e.appendChild(this._hintWidget);
					e.classList.add('terminal-initial-hint');
					const font = this._xterm.getFont();
					if (font) {
						e.style.fontFamily = font.fontFamily;
						e.style.fontSize = font.fontSize + 'px';
					}
				}
			}
			if (this._hintWidget && this._xterm) {
				const decoration = this._hintWidget.parentElement;
				if (decoration) {
					decoration.style.width = (this._xterm.raw.cols - this._xterm.raw.buffer.active.cursorX) / this._xterm!.raw.cols * 100 + '%';
				}
			}
		}));
	}
}
registerTerminalContribution(TerminalInitialHintContribution.ID, TerminalInitialHintContribution, false);
