/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { IDecoration, ITerminalAddon, Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { IContentActionHandler, renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatAgent, IChatAgentService } from '../../../chat/common/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInstance } from '../../../terminal/browser/terminalInstance.js';
import { TerminalInitialHintSettingId } from '../common/terminalInitialHintConfiguration.js';
import './media/terminalInitialHint.css';
import { TerminalChatCommandId } from './terminalChat.js';
import { hasKey } from '../../../../../base/common/types.js';

const $ = dom.$;

const enum Constants {
	InitialHintHideStorageKey = 'terminal.initialHint.hide'
}

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
				this._storageService.remove(Constants.InitialHintHideStorageKey, StorageScope.APPLICATION);
			}
		}));
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Don't show is the terminal was launched by an extension or a feature like debug
		if (hasKey(this._ctx.instance, { shellLaunchConfig: true }) && (this._ctx.instance.shellLaunchConfig.isExtensionOwnedTerminal || this._ctx.instance.shellLaunchConfig.isFeatureTerminal)) {
			return;
		}
		// Don't show if disabled
		if (this._storageService.getBoolean(Constants.InitialHintHideStorageKey, StorageScope.APPLICATION, false)) {
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

class TerminalInitialHintWidget extends Disposable {

	private _domNode: HTMLElement | undefined;
	private readonly _toDispose: DisposableStore = this._register(new DisposableStore());
	private _isVisible = false;
	private _ariaLabel: string = '';

	constructor(
		private readonly _instance: ITerminalInstance,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
		this._toDispose.add(_instance.onDidFocus(() => {
			if (this._instance.hasFocus && this._isVisible && this._ariaLabel && this._configurationService.getValue(AccessibilityVerbositySettingId.TerminalInlineChat)) {
				status(this._ariaLabel);
			}
		}));
		this._toDispose.add(_terminalService.onDidChangeInstances(() => {
			if (this._terminalService.instances.length !== 1) {
				this.dispose();
			}
		}));
		this._toDispose.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
				this.dispose();
			}
		}));
	}

	private _getHintInlineChat(agents: IChatAgent[]) {
		let ariaLabel = `Open chat.`;

		const handleClick = () => {
			this._storageService.store(Constants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
			this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'terminalInlineChat.hintAction',
				from: 'hint'
			});
			this._commandService.executeCommand(TerminalChatCommandId.Start, { from: 'hint' });
		};
		this._toDispose.add(this._commandService.onDidExecuteCommand(e => {
			if (e.commandId === TerminalChatCommandId.Start) {
				this._storageService.store(Constants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
				this.dispose();
			}
		}));

		const hintHandler: IContentActionHandler = {
			disposables: this._toDispose,
			callback: (index, _event) => {
				switch (index) {
					case '0':
						handleClick();
						break;
				}
			}
		};

		const hintElement = $('div.terminal-initial-hint');
		hintElement.style.display = 'block';

		const keybindingHint = this._keybindingService.lookupKeybinding(TerminalChatCommandId.Start);
		const keybindingHintLabel = keybindingHint?.getLabel();

		if (keybindingHint && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Open chat {0}. ', keybindingHintLabel);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				const hintPart = $('a', undefined, fragment);
				this._toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CLICK, handleClick));
				return hintPart;
			});

			hintElement.appendChild(before);

			const label = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
			label.set(keybindingHint);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			label.element.style.cursor = 'pointer';
			this._toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, handleClick));

			hintElement.appendChild(after);

			const typeToDismiss = localize('hintTextDismiss', 'Start typing to dismiss.');
			const textHint2 = $('span.detail', undefined, typeToDismiss);
			hintElement.appendChild(textHint2);

			ariaLabel = actionPart.concat(typeToDismiss);
		} else {
			const hintMsg = localize({
				key: 'inlineChatHint',
				comment: [
					'Preserve double-square brackets and their order',
				]
			}, '[[Open chat]] or start typing to dismiss.');
			const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
			hintElement.appendChild(rendered);
		}

		return { ariaLabel, hintHandler, hintElement };
	}

	getDomNode(agents: IChatAgent[]): HTMLElement {
		if (!this._domNode) {
			this._domNode = $('.terminal-initial-hint');
			this._domNode!.style.paddingLeft = '4px';

			const { hintElement, ariaLabel } = this._getHintInlineChat(agents);
			this._domNode.append(hintElement);
			this._ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.TerminalInlineChat));

			this._toDispose.add(dom.addDisposableListener(this._domNode, 'click', () => {
				this._domNode?.remove();
				this._domNode = undefined;
			}));

			this._toDispose.add(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, (e) => {
				this._contextMenuService.showContextMenu({
					getAnchor: () => { return new StandardMouseEvent(dom.getActiveWindow(), e); },
					getActions: () => {
						return [{
							id: 'workench.action.disableTerminalInitialHint',
							label: localize('disableInitialHint', "Disable Initial Hint"),
							tooltip: localize('disableInitialHint', "Disable Initial Hint"),
							enabled: true,
							class: undefined,
							run: () => this._configurationService.updateValue(TerminalInitialHintSettingId.Enabled, false)
						}
						];
					}
				});
			}));
		}
		return this._domNode;
	}

	override dispose(): void {
		this._domNode?.remove();
		super.dispose();
	}
}
