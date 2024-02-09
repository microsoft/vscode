/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/chat';
import { IDimension } from 'vs/base/browser/dom';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize2 } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal, isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveXtermAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessInfo, ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';
import { Codicon } from 'vs/base/common/codicons';
import { MenuId } from 'vs/platform/actions/common/actions';
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TerminalChatContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.Chat';

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalChatContribution | null {
		return instance.getContribution<TerminalChatContribution>(TerminalChatContribution.ID);
	}
	/**
	 * Currently focused chat widget. This is used to track action context since
	 * 'active terminals' are only tracked for non-detached terminal instanecs.
	 */
	static activeChatWidget?: TerminalChatContribution;
	private _chatWidget: Lazy<TerminalChatWidget> | undefined;
	private _lastLayoutDimensions: IDimension | undefined;

	get chatWidget(): TerminalChatWidget | undefined { return this._chatWidget?.value; }

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
	}

	layout(_xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void {
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._lastLayoutDimensions = dimension;
		this._chatWidget?.rawValue?.layout(dimension.width);
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		if (!this._configurationService.getValue(TerminalSettingId.ExperimentalInlineChat)) {
			return;
		}
		this._chatWidget = new Lazy(() => {
			const chatWidget = this._instantiationService.createInstance(TerminalChatWidget, this._instance.domElement!, this._instance);
			chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatContribution.activeChatWidget = this;
				if (!isDetachedTerminalInstance(this._instance)) {
					this._terminalService.setActiveInstance(this._instance);
				}
			});
			chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatContribution.activeChatWidget = undefined;
				this._instance.resetScrollbarVisibility();
			});
			if (!this._instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}

			// this._instance.domElement?.appendChild(chatWidget.getDomNode());
			if (this._lastLayoutDimensions) {
				chatWidget.layout(this._lastLayoutDimensions.width);
			}

			return chatWidget;
		});
	}

	override dispose() {
		super.dispose();
		this._chatWidget?.rawValue?.dispose();
	}
}
registerTerminalContribution(TerminalChatContribution.ID, TerminalChatContribution, true);

registerActiveXtermAction({
	id: TerminalCommandId.FocusChat,
	title: localize2('workbench.action.terminal.focusChat', 'Terminal: Focus Chat'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused.negate(), TerminalContextKeys.focusInAny),
		weight: KeybindingWeight.WorkbenchContrib
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	),
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget?.reveal();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.HideChat,
	title: localize2('workbench.action.terminal.hideChat', 'Terminal: Hide Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused, TerminalContextKeys.chatVisible),
		weight: KeybindingWeight.WorkbenchContrib
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	),
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget?.hide();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.SubmitChat,
	title: localize2('workbench.action.terminal.submitChat', 'Terminal: Submit Chat'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatInputHasText
	),
	icon: Codicon.send,
	menu: {
		id: MenuId.ChatExecute,
		when: TerminalContextKeys.chatSessionInProgress.negate(),
		group: 'navigation',
	},
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget?.acceptInput();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.CancelChat,
	title: localize2('workbench.action.terminal.cancelChat', 'Cancel Chat'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatSessionInProgress,
	),
	icon: Codicon.debugStop,
	menu: {
		id: MenuId.ChatExecute,
		group: 'navigation',
	},
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget?.cancel();
	}
});
