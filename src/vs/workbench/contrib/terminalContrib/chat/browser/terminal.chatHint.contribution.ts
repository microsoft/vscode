/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from 'vs/base/common/lifecycle';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import type { Terminal as RawXtermTerminal, IDecoration } from '@xterm/xterm';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, ITerminalProcessInfo } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';

class TerminalChatHintContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.chatHint';

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalChatHintContribution | null {
		return instance.getContribution<TerminalChatHintContribution>(TerminalChatHintContribution.ID);
	}

	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;
	private _chatHint: IDecoration | undefined;

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IChatService private readonly _chatService: IChatService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._xterm = xterm;
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (capability) {
			this._register(Event.once(capability.onCommandStarted)(() => this._addChatHint()));
		} else {
			this._register(this._instance.capabilities.onDidAddCapability(e => {
				if (e.capability.type === TerminalCapability.CommandDetection) {
					const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
					this._register(Event.once(capability!.onCommandStarted)(() => this._addChatHint()));
				}
			}));
		}

		if (!this._chatHint && !this._chatService.getProviderInfos().length) {
			this._register(Event.once(this._chatService.onDidRegisterProvider)(() => this._addChatHint()));
		}
	}

	private _addChatHint(): void {
		if (!this._xterm || !this._chatService.getProviderInfos().length || this._chatHint || this._instance.capabilities.get(TerminalCapability.CommandDetection)?.hasInput) {
			return;
		}

		const marker = this._xterm.raw.registerMarker();
		if (!marker) {
			return;
		}

		if (this._xterm.raw.buffer.active.cursorX === 0) {
			return;
		}
		this._register(marker);
		this._chatHint = this._xterm.raw.registerDecoration({
			marker,
			x: this._xterm.raw.buffer.active.cursorX + 1
		});
		const keybinding = this._keybindingService.lookupKeybinding('github.copilot.terminal.suggestCommand');
		if (!keybinding) {
			return;
		}
		this._register(this._xterm.raw.onKey(() => this._chatHint?.dispose()));
		this._chatHint?.onRender((e) => {
			e.textContent = localize('terminalChat', 'Press {0} for help from GitHub Copilot Chat. Start typing to dismiss.', keybinding.getLabel());
			e.classList.add('terminal-ghost-text');
			e.style.width = (this._xterm!.raw.cols - this._xterm!.raw.buffer.active.cursorX) / this._xterm!.raw.cols * 100 + '%';
		});
	}
}
registerTerminalContribution(TerminalChatHintContribution.ID, TerminalChatHintContribution, false);
