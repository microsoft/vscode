/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import type { Terminal as RawXtermTerminal, IDecoration, ITerminalAddon } from '@xterm/xterm';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, ITerminalProcessInfo } from 'vs/workbench/contrib/terminal/common/terminal';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { OS } from 'vs/base/common/platform';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IContentActionHandler, renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { status } from 'vs/base/browser/ui/aria/aria';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalChatCommandId } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import 'vs/css!./media/terminalInitialHint';
import { TerminalInitialHintSettingId } from 'vs/workbench/contrib/terminalContrib/chat/common/terminalInitialHintConfiguration';
import { ChatAgentLocation, IChatAgent, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

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
		private readonly _instance: Pick<ITerminalInstance, 'capabilities'> | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo | undefined,
		widgetManager: TerminalWidgetManager | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IStorageService private readonly _storageService: IStorageService,
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
		if (this._storageService.getBoolean(Constants.InitialHintHideStorageKey, StorageScope.APPLICATION, false)) {
			return;
		}
		if (this._terminalGroupService.instances.length + this._terminalEditorService.instances.length !== 1) {
			// only show for the first terminal
			return;
		}
		this._xterm = xterm;
		this._addon = this._register(this._instantiationService.createInstance(InitialHintAddon, this._instance.capabilities, this._chatAgentService.onDidChangeAgents));
		this._xterm.raw.loadAddon(this._addon);
		this._register(this._addon.onDidRequestCreateHint(() => this._createHint()));
	}

	private _createHint(): void {
		const instance = this._instance instanceof TerminalInstance ? this._instance : undefined;
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


	private domNode: HTMLElement | undefined;
	private readonly toDispose: DisposableStore = this._register(new DisposableStore());
	private isVisible = false;
	private ariaLabel: string = '';

	constructor(
		private readonly _instance: ITerminalInstance,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IStorageService private readonly _storageService: IStorageService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
		this.toDispose.add(_instance.onDidFocus(() => {
			if (this._instance.hasFocus && this.isVisible && this.ariaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.TerminalChat)) {
				status(this.ariaLabel);
			}
		}));
		this.toDispose.add(terminalService.onDidChangeInstances(() => {
			if (this.terminalService.instances.length !== 1) {
				this.dispose();
			}
		}));
		this.toDispose.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this.configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
				this.dispose();
			}
		}));
	}

	private _getHintInlineChat(agents: IChatAgent[]) {
		let providerName = (agents.length === 1 ? agents[0].fullName : undefined) ?? this.productService.nameShort;
		const defaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);
		if (defaultAgent?.extensionId.value === agents[0].extensionId.value) {
			providerName = defaultAgent.fullName ?? providerName;
		}

		let ariaLabel = `Ask ${providerName} something or start typing to dismiss.`;

		const handleClick = () => {
			this._storageService.store(Constants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'terminalInlineChat.hintAction',
				from: 'hint'
			});
			this.commandService.executeCommand(TerminalChatCommandId.Start, { from: 'hint' });
		};
		this.toDispose.add(this.commandService.onDidExecuteCommand(e => {
			if (e.commandId === TerminalChatCommandId.Start) {
				this._storageService.store(Constants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
				this.dispose();
			}
		}));

		const hintHandler: IContentActionHandler = {
			disposables: this.toDispose,
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

		const keybindingHint = this.keybindingService.lookupKeybinding(TerminalChatCommandId.Start);
		const keybindingHintLabel = keybindingHint?.getLabel();

		if (keybindingHint && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Press {0} to ask {1} to do something. ', keybindingHintLabel, providerName);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				const hintPart = $('a', undefined, fragment);
				this.toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CLICK, handleClick));
				return hintPart;
			});

			hintElement.appendChild(before);

			const label = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
			label.set(keybindingHint);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			label.element.style.cursor = 'pointer';
			this.toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, handleClick));

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
			}, '[[Ask {0} to do something]] or start typing to dismiss.', providerName);
			const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
			hintElement.appendChild(rendered);
		}

		return { ariaLabel, hintHandler, hintElement };
	}

	getDomNode(agents: IChatAgent[]): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.terminal-initial-hint');
			this.domNode!.style.paddingLeft = '4px';

			const { hintElement, ariaLabel } = this._getHintInlineChat(agents);
			this.domNode.append(hintElement);
			this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.TerminalChat));

			this.toDispose.add(dom.addDisposableListener(this.domNode, 'click', () => {
				this.domNode?.remove();
				this.domNode = undefined;
			}));

			this.toDispose.add(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
				this.contextMenuService.showContextMenu({
					getAnchor: () => { return new StandardMouseEvent(dom.getActiveWindow(), e); },
					getActions: () => {
						return [{
							id: 'workench.action.disableTerminalInitialHint',
							label: localize('disableInitialHint', "Disable Initial Hint"),
							tooltip: localize('disableInitialHint', "Disable Initial Hint"),
							enabled: true,
							class: undefined,
							run: () => this.configurationService.updateValue(TerminalInitialHintSettingId.Enabled, false)
						}
						];
					}
				});
			}));
		}
		return this.domNode;
	}

	override dispose(): void {
		this.domNode?.remove();
		super.dispose();
	}
}
