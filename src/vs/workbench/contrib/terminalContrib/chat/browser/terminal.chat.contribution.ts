/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { TerminalChatWidget } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatWidget';
import type { Terminal as RawXtermTerminal } from '@xterm/xterm';

class TerminalChatContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.Chat';

	/**
	 * Currently focused Chat widget. This is used to track action context since
	 * 'active terminals' are only tracked for non-detached terminal instanecs.
	 */
	static activeChatWidget?: TerminalChatContribution;

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalChatContribution | null {
		return instance.getContribution<TerminalChatContribution>(TerminalChatContribution.ID);
	}

	private _chatWidget: Lazy<TerminalChatWidget>;
	private _lastLayoutDimensions: IDimension | undefined;

	get chatWidget(): TerminalChatWidget { return this._chatWidget.value; }

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITerminalService terminalService: ITerminalService
	) {
		super();

		this._chatWidget = new Lazy(() => {
			const chatWidget = instantiationService.createInstance(TerminalChatWidget, this._instance);

			// Track focus and set state so we can force the scroll bar to be visible
			chatWidget.focusTracker.onDidFocus(() => {
				TerminalChatContribution.activeChatWidget = this;
				this._instance.forceScrollbarVisibility();
				if (!isDetachedTerminalInstance(this._instance)) {
					terminalService.setActiveInstance(this._instance);
				}
			});
			chatWidget.focusTracker.onDidBlur(() => {
				TerminalChatContribution.activeChatWidget = undefined;
				this._instance.resetScrollbarVisibility();
			});

			if (!this._instance.domElement) {
				throw new Error('FindWidget expected terminal DOM to be initialized');
			}

			this._instance.domElement?.appendChild(chatWidget.getDomNode());
			if (this._lastLayoutDimensions) {
				chatWidget.layout(this._lastLayoutDimensions.width);
			}

			return chatWidget;
		});
	}

	layout(_xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void {
		this._lastLayoutDimensions = dimension;
		this._chatWidget.rawValue?.layout(dimension.width);
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
	}

	override dispose() {
		if (TerminalChatContribution.activeChatWidget === this) {
			TerminalChatContribution.activeChatWidget = undefined;
		}
		super.dispose();
		this._chatWidget.rawValue?.dispose();
	}

}
registerTerminalContribution(TerminalChatContribution.ID, TerminalChatContribution, true);

registerActiveXtermAction({
	id: TerminalCommandId.FocusChat,
	title: localize2('workbench.action.terminal.focusChat', 'Focus Chat'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.or(TerminalContextKeys.chatFocused, TerminalContextKeys.focusInAny),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget.reveal();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.HideChat,
	title: localize2('workbench.action.terminal.hideChat', 'Hide Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.focusInAny, TerminalContextKeys.chatVisible),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (_xterm, _accessor, activeInstance) => {
		const contr = TerminalChatContribution.activeChatWidget || TerminalChatContribution.get(activeInstance);
		contr?.chatWidget.hide();
	}
});
