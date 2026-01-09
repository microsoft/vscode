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
import { hasKey } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ITerminalCapabilityStore, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatAgent, IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { IDetachedTerminalInstance, ITerminalConfigurationService, ITerminalContribution, ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution, type IDetachedCompatibleTerminalContributionContext, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInstance } from '../../../terminal/browser/terminalInstance.js';
import { TerminalChatCommandId } from '../../chat/browser/terminalChat.js';
import { TerminalInitialHintSettingId } from '../common/terminalInitialHintConfiguration.js';
import './media/terminalInitialHint.css';
import { TerminalSuggestCommandId } from '../../suggest/common/terminal.suggest.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const $ = dom.$;

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
	private readonly _decoration = this._register(new MutableDisposable<IDecoration>());
	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;
	private readonly _cursorMoveListener = this._register(new MutableDisposable());

	constructor(
		private readonly _ctx: ITerminalContributionContext | IDetachedCompatibleTerminalContributionContext,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		// Don't show is the terminal was launched by an extension or a feature like debug
		if (hasKey(this._ctx.instance, { shellLaunchConfig: true }) && (this._ctx.instance.shellLaunchConfig.isExtensionOwnedTerminal || this._ctx.instance.shellLaunchConfig.isFeatureTerminal)) {
			return;
		}
		// Don't show if disabled
		if (!this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
			return;
		}
		// Don't show if keybindings are sent to shell, the hint's keybindings won't work
		if (this._terminalConfigurationService.config.sendKeybindingsToShell) {
			return;
		}
		this._xterm = xterm;
		this._addon = this._register(this._instantiationService.createInstance(InitialHintAddon, this._ctx.instance.capabilities, this._chatAgentService.onDidChangeAgents));
		this._xterm.raw.loadAddon(this._addon);
		this._register(this._addon.onDidRequestCreateHint(() => this._createHint()));
	}

	private _disposeHint(): void {
		this._hintWidget?.remove();
		this._hintWidget = undefined;
		this._decoration.clear();
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

		if (!this._decoration.value) {
			const marker = this._xterm.raw.registerMarker();
			if (!marker) {
				return;
			}

			if (this._xterm.raw.buffer.active.cursorX === 0) {
				return;
			}
			this._register(marker);
			this._decoration.value = this._xterm.raw.registerDecoration({
				marker,
				x: this._xterm.raw.buffer.active.cursorX + 1,
			});
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

		// Listen to cursor move and recreate the hint (only if no input has been received)
		// Fixes #286080 an issue where the hint would not reposition correctly when the terminal's prompt changed
		this._cursorMoveListener.value = this._xterm.raw.onCursorMove(() => {
			if (!inputModel?.value) {
				this._disposeHint();
				this._createHint();
			}
		});

		if (!this._decoration.value) {
			return;
		}
		this._register(this._decoration.value.onRender((e) => {
			if (!this._hintWidget && this._xterm?.isFocused) {
				const widget = this._register(this._instantiationService.createInstance(TerminalInitialHintWidget, instance));
				this._addon?.dispose();
				this._hintWidget = widget.getDomNode();
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
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._toDispose.add(_instance.onDidFocus(() => {
			if (this._instance.hasFocus && this._isVisible && this._ariaLabel && this._configurationService.getValue(AccessibilityVerbositySettingId.TerminalInlineChat)) {
				status(this._ariaLabel);
			}
		}));
		this._toDispose.add(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalInitialHintSettingId.Enabled) && !this._configurationService.getValue(TerminalInitialHintSettingId.Enabled)) {
				this.dispose();
			}
		}));
	}

	private _getHintInlineChat() {
		const ariaLabelParts: string[] = [];

		const handleClick = () => {
			this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'terminalInlineChat.hintAction',
				from: 'hint'
			});
			this._commandService.executeCommand(TerminalChatCommandId.Start, { from: 'hint' });
		};
		const handleDontShowClick = () => {
			this._configurationService.updateValue(TerminalInitialHintSettingId.Enabled, false);
		};

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
		const dontShowHintHandler: IContentActionHandler = {
			disposables: this._toDispose,
			callback: (index, _event) => {
				switch (index) {
					case '0':
						handleDontShowClick();
						break;
				}
			}
		};

		const hintElement = $('div.terminal-initial-hint');
		hintElement.style.display = 'block';

		// Chat hint
		if (!this._chatEntitlementService.sentiment.hidden) {
			const keybindingHint = this._keybindingService.lookupKeybinding(TerminalChatCommandId.Start);
			const keybindingHintLabel = keybindingHint?.getLabel();

			if (keybindingHint && keybindingHintLabel) {
				const terminalAgents = this._chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.Terminal));
				if (terminalAgents?.length) {
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

					ariaLabelParts.push(actionPart);
				}
			} else {
				const hintMsg = localize({
					key: 'inlineChatHint',
					comment: [
						'Preserve double-square brackets and their order',
					]
				}, '[[Open chat]] or start typing to dismiss.');
				const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
				hintElement.appendChild(rendered);

				ariaLabelParts.push(localize('openChatHint', 'Open chat or start typing to dismiss.'));
			}
		}

		// Suggest hint
		const suggestKeybinding = this._keybindingService.lookupKeybinding(TerminalSuggestCommandId.TriggerSuggest);
		const suggestKeybindingLabel = suggestKeybinding?.getLabel();
		if (suggestKeybinding && suggestKeybindingLabel) {
			const suggestActionPart = localize('showSuggestHint', 'Show suggestions {0}. ', suggestKeybindingLabel);

			const handleSuggestClick = () => {
				this._commandService.executeCommand(TerminalSuggestCommandId.TriggerSuggest);
			};

			const [suggestBefore, suggestAfter] = suggestActionPart.split(suggestKeybindingLabel).map((fragment) => {
				const hintPart = $('a', undefined, fragment);
				this._toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CLICK, handleSuggestClick));
				return hintPart;
			});

			hintElement.appendChild(suggestBefore);

			const suggestLabel = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
			suggestLabel.set(suggestKeybinding);
			suggestLabel.element.style.width = 'min-content';
			suggestLabel.element.style.display = 'inline';
			suggestLabel.element.style.cursor = 'pointer';
			this._toDispose.add(dom.addDisposableListener(suggestLabel.element, dom.EventType.CLICK, handleSuggestClick));

			hintElement.appendChild(suggestAfter);

			ariaLabelParts.push(suggestActionPart);
		}

		const typeToDismiss = localize({
			key: 'hintTextDismiss',
			comment: [
				'Preserve double-square brackets and their order',
			]
		}, ' Start typing to dismiss or [[don\'t show]] this again.');
		const typeToDismissRendered = renderFormattedText(typeToDismiss, { actionHandler: dontShowHintHandler });
		typeToDismissRendered.classList.add('detail');
		hintElement.appendChild(typeToDismissRendered);
		ariaLabelParts.push(localize('hintTextDismissAriaLabel', 'Start typing to dismiss or don\'t show this again.'));

		return { ariaLabel: ariaLabelParts.join(' '), hintHandler, hintElement };
	}

	getDomNode(): HTMLElement {
		if (!this._domNode) {
			this._domNode = $('.terminal-initial-hint');
			this._domNode!.style.paddingLeft = '4px';

			const { hintElement, ariaLabel } = this._getHintInlineChat();
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
