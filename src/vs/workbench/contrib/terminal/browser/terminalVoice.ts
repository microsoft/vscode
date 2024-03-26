/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ISpeechService, ISpeechToTextEvent, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { isNumber } from 'vs/base/common/types';
import type { IDecoration } from '@xterm/xterm';
import { IXtermMarker } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ThemeIcon } from 'vs/base/common/themables';
import { Codicon } from 'vs/base/common/codicons';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { localize } from 'vs/nls';

const symbolMap: { [key: string]: string } = {
	'Ampersand': '&',
	'ampersand': '&',
	'Dollar': '$',
	'dollar': '$',
	'Percent': '%',
	'percent': '%',
	'Asterisk': '*',
	'asterisk': '*',
	'Plus': '+',
	'plus': '+',
	'Equals': '=',
	'equals': '=',
	'Exclamation': '!',
	'exclamation': '!',
	'Slash': '/',
	'slash': '/',
	'Backslash': '\\',
	'backslash': '\\',
	'Dot': '.',
	'dot': '.',
	'Period': '.',
	'period': '.',
	'Quote': '\'',
	'quote': '\'',
	'double quote': '"',
	'Double quote': '"',
};

export class TerminalVoiceSession extends Disposable {
	private _input: string = '';
	private _ghostText: IDecoration | undefined;
	private _decoration: IDecoration | undefined;
	private _marker: IXtermMarker | undefined;
	private _ghostTextMarker: IXtermMarker | undefined;
	private static _instance: TerminalVoiceSession | undefined = undefined;
	private _acceptTranscriptionScheduler: RunOnceScheduler | undefined;
	static getInstance(instantiationService: IInstantiationService): TerminalVoiceSession {
		if (!TerminalVoiceSession._instance) {
			TerminalVoiceSession._instance = instantiationService.createInstance(TerminalVoiceSession);
		}

		return TerminalVoiceSession._instance;
	}
	private _cancellationTokenSource: CancellationTokenSource | undefined;
	private readonly _disposables: DisposableStore;
	constructor(
		@ISpeechService private readonly _speechService: ISpeechService,
		@ITerminalService readonly _terminalService: ITerminalService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IInstantiationService readonly _instantationService: IInstantiationService
	) {
		super();
		this._register(this._terminalService.onDidChangeActiveInstance(() => this.stop()));
		this._register(this._terminalService.onDidDisposeInstance(() => this.stop()));
		this._disposables = this._register(new DisposableStore());
	}

	async start(): Promise<void> {
		this.stop();
		let voiceTimeout = this.configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
		if (!isNumber(voiceTimeout) || voiceTimeout < 0) {
			voiceTimeout = SpeechTimeoutDefault;
		}
		this._acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
			this._sendText();
			this.stop();
		}, voiceTimeout));
		this._cancellationTokenSource = new CancellationTokenSource();
		this._register(toDisposable(() => this._cancellationTokenSource?.dispose(true)));
		const session = await this._speechService.createSpeechToTextSession(this._cancellationTokenSource?.token, 'terminal');

		this._disposables.add(session.onDidChange((e) => {
			if (this._cancellationTokenSource?.token.isCancellationRequested) {
				return;
			}
			switch (e.status) {
				case SpeechToTextStatus.Started:
					// TODO: play start audio cue
					if (!this._decoration) {
						this._createDecoration();
					}
					break;
				case SpeechToTextStatus.Recognizing: {
					this._updateInput(e);
					this._renderGhostText(e);
					if (voiceTimeout > 0) {
						this._acceptTranscriptionScheduler!.cancel();
					}
					break;
				}
				case SpeechToTextStatus.Recognized:
					this._updateInput(e);
					if (voiceTimeout > 0) {
						this._acceptTranscriptionScheduler!.schedule();
					}
					break;
				case SpeechToTextStatus.Stopped:
					// TODO: play stop audio cue
					this.stop();
					break;
			}
		}));
	}
	stop(send?: boolean): void {
		this._setInactive();
		if (send) {
			this._acceptTranscriptionScheduler!.cancel();
			this._sendText();
		}
		this._marker?.dispose();
		this._ghostTextMarker?.dispose();
		this._ghostText?.dispose();
		this._ghostText = undefined;
		this._decoration?.dispose();
		this._decoration = undefined;
		this._cancellationTokenSource?.cancel();
		this._disposables.clear();
		this._input = '';
	}

	private _sendText(): void {
		this._terminalService.activeInstance?.sendText(this._input, false);
		alert(localize('terminalVoiceTextInserted', '{0} inserted', this._input));
	}

	private _updateInput(e: ISpeechToTextEvent): void {
		if (e.text) {
			let input = e.text.replaceAll(/[.,?;!]/g, '');
			for (const symbol of Object.entries(symbolMap)) {
				input = input.replace(new RegExp('\\b' + symbol[0] + '\\b'), symbol[1]);
			}
			this._input = ' ' + input;
		}
	}

	private _createDecoration(): void {
		const activeInstance = this._terminalService.activeInstance;
		const xterm = activeInstance?.xterm?.raw;
		if (!xterm) {
			return;
		}
		const onFirstLine = xterm.buffer.active.cursorY === 0;
		this._marker = activeInstance.registerMarker(onFirstLine ? 0 : -1);
		if (!this._marker) {
			return;
		}
		this._decoration = xterm.registerDecoration({
			marker: this._marker,
			layer: 'top',
			x: xterm.buffer.active.cursorX ?? 0,
		});
		this._decoration?.onRender((e: HTMLElement) => {
			e.classList.add(...ThemeIcon.asClassNameArray(Codicon.micFilled), 'terminal-voice', 'recording');
			e.style.transform = onFirstLine ? 'translate(10px, -2px)' : 'translate(-6px, -5px)';
		});
	}

	private _setInactive(): void {
		this._decoration?.element?.classList.remove('recording');
	}

	private _renderGhostText(e: ISpeechToTextEvent): void {
		this._ghostText?.dispose();
		const text = e.text;
		if (!text) {
			return;
		}
		const activeInstance = this._terminalService.activeInstance;
		const xterm = activeInstance?.xterm?.raw;
		if (!xterm) {
			return;
		}
		this._ghostTextMarker = activeInstance.registerMarker();
		if (!this._ghostTextMarker) {
			return;
		}
		const onFirstLine = xterm.buffer.active.cursorY === 0;
		this._ghostText = xterm.registerDecoration({
			marker: this._ghostTextMarker,
			layer: 'top',
			x: onFirstLine ? xterm.buffer.active.cursorX + 4 : xterm.buffer.active.cursorX + 1 ?? 0,
		});
		this._ghostText?.onRender((e: HTMLElement) => {
			e.classList.add('terminal-voice-progress-text');
			e.textContent = text;
			e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + '%';
		});
	}
}


