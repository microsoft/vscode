/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { IContentActionHandler, renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../../base/common/actions.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { IChatAgent } from '../../../chat/common/chatAgents.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalInitialHintSettingId } from '../common/terminalInitialHintConfiguration.js';
import './media/terminalInitialHint.css';
import { TerminalChatCommandId } from './terminalChat.js';

const $ = dom.$;

export const enum TerminalInitialHintConstants {
	InitialHintHideStorageKey = 'terminal.initialHint.hide'
}

export class TerminalInlineHintWidget extends Disposable {

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
			this._storageService.store(TerminalInitialHintConstants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
			this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'terminalInlineChat.hintAction',
				from: 'hint'
			});
			this._commandService.executeCommand(TerminalChatCommandId.Start, { from: 'hint' });
		};
		this._toDispose.add(this._commandService.onDidExecuteCommand(e => {
			if (e.commandId === TerminalChatCommandId.Start) {
				this._storageService.store(TerminalInitialHintConstants.InitialHintHideStorageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
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
