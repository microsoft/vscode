/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isNumber } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { SpeechTimeoutDefault } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ISpeechService, AccessibilityVoiceSettingId, ISpeechToTextEvent, SpeechToTextStatus } from '../../../speech/common/speechService.js';
import type { IMarker, IDecoration } from '@xterm/xterm';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';


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
	private _marker: IMarker | undefined;
	private _ghostTextMarker: IMarker | undefined;
	private static _instance: TerminalVoiceSession | undefined = undefined;
	private _acceptTranscriptionScheduler: RunOnceScheduler | undefined;
	private readonly _terminalDictationInProgress: IContextKey<boolean>;
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
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this._register(this._terminalService.onDidChangeActiveInstance(() => this.stop()));
		this._register(this._terminalService.onDidDisposeInstance(() => this.stop()));
		this._disposables = this._register(new DisposableStore());
		this._terminalDictationInProgress = TerminalContextKeys.terminalDictationInProgress.bindTo(contextKeyService);
	}

	async start(): Promise<void> {
		this.stop();
		let voiceTimeout = this._configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
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
					this._terminalDictationInProgress.set(true);
					if (!this._decoration) {
						this._createDecoration();
					}
					break;
				case SpeechToTextStatus.Recognizing: {
					this._updateInput(e);
					this._renderGhostText(e);
					this._updateDecoration();
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
		this._ghostText = undefined;
		this._decoration?.dispose();
		this._decoration = undefined;
		this._marker?.dispose();
		this._marker = undefined;
		this._ghostTextMarker = undefined;
		this._cancellationTokenSource?.cancel();
		this._disposables.clear();
		this._input = '';
		this._terminalDictationInProgress.reset();
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

		// Calculate x position based on current cursor position and input length
		const inputLength = this._input.length;
		const xPosition = xterm.buffer.active.cursorX + inputLength;

		this._marker = activeInstance.registerMarker(onFirstLine ? 0 : -1);
		if (!this._marker) {
			return;
		}
		this._decoration = xterm.registerDecoration({
			marker: this._marker,
			layer: 'top',
			x: xPosition,
		});
		if (!this._decoration) {
			this._marker.dispose();
			this._marker = undefined;
			return;
		}
		this._decoration.onRender((e: HTMLElement) => {
			e.classList.add(...ThemeIcon.asClassNameArray(Codicon.micFilled), 'terminal-voice', 'recording');
			e.style.transform = onFirstLine ? 'translate(10px, -2px)' : 'translate(-6px, -5px)';
		});
	}

	private _updateDecoration(): void {
		// Dispose the old decoration and recreate it at the new position
		this._decoration?.dispose();
		this._marker?.dispose();
		this._decoration = undefined;
		this._marker = undefined;
		this._createDecoration();
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
		this._disposables.add(this._ghostTextMarker);
		const onFirstLine = xterm.buffer.active.cursorY === 0;
		this._ghostText = xterm.registerDecoration({
			marker: this._ghostTextMarker,
			layer: 'top',
			x: onFirstLine ? xterm.buffer.active.cursorX + 4 : xterm.buffer.active.cursorX + 1,
		});
		if (this._ghostText) {
			this._disposables.add(this._ghostText);
		}
		this._ghostText?.onRender((e: HTMLElement) => {
			e.classList.add('terminal-voice-progress-text');
			e.textContent = text;
			e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + '%';
		});
	}
}
