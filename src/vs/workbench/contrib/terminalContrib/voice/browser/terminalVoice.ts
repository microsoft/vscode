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
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../chat/browser/speechToText/chatSpeechToTextService.js';
import { getDictationPreparingLabel } from '../../../chat/browser/speechToText/dictationDownloadRing.js';
import type { IMarker, IDecoration } from '@xterm/xterm';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { getActiveWindow } from '../../../../../base/browser/dom.js';
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
	/** True while the current session is driven by the built-in on-device engine. */
	private _usingBuiltin = false;
	/** True while awaiting the built-in engine's final transcript during accept. */
	private _builtinFinalizing = false;
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
		@IChatSpeechToTextService private readonly _chatSpeechToTextService: IChatSpeechToTextService,
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
			// The built-in engine returns its final utterance only from
			// stopAndTranscribe(), so accept through stop(true) rather than
			// sending the interim text and discarding the recording.
			if (this._usingBuiltin) {
				this.stop(true);
				return;
			}
			this._sendText();
			this.stop();
		}, voiceTimeout));
		this._cancellationTokenSource = new CancellationTokenSource();
		this._register(toDisposable(() => this._cancellationTokenSource?.dispose(true)));

		// Prefer the built-in on-device engine (private, in-box) when configured,
		// falling back to the speech extension's provider otherwise.
		if (this._chatSpeechToTextService.isConfigured) {
			return this._startBuiltin(voiceTimeout);
		}

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
					// Send text immediately like editor dictation
					this._sendText();
					// Clear ghost text and input for next recognition
					this._ghostText?.dispose();
					this._ghostText = undefined;
					this._ghostTextMarker?.dispose();
					this._ghostTextMarker = undefined;
					// Update decoration position for next recognition
					this._updateDecoration();
					this._input = '';
					break;
				case SpeechToTextStatus.Stopped:
					this.stop();
					break;
			}
		}));
	}

	/**
	 * Drive terminal dictation from the built-in on-device engine. Unlike the
	 * extension provider (which emits discrete `Recognizing`/`Recognized` events
	 * per utterance), the built-in engine streams a single growing cumulative
	 * transcript. We render it live as ghost text and keep it staged in
	 * `_input`, then send it once the silence timeout elapses or the user stops.
	 */
	private async _startBuiltin(voiceTimeout: number): Promise<void> {
		const service = this._chatSpeechToTextService;

		// Only one dictation can run at a time (the on-device engine is a shared
		// singleton). If it is already recording elsewhere (chat input or an
		// editor), `service.start()` would no-op while these listeners stayed
		// attached and streamed that other surface's transcript into the
		// terminal. Reject a non-idle engine before subscribing.
		if (service.state !== ChatSpeechToTextState.Idle) {
			this.stop();
			return;
		}

		this._usingBuiltin = true;
		this._terminalDictationInProgress.set(true);
		if (!this._decoration) {
			this._createDecoration();
		}

		// On first use the model downloads/loads before any transcript arrives.
		// Unlike the chat input (which has a toolbar download ring), the terminal
		// has no progress affordance, so surface a "Preparing…/Downloading… X%"
		// hint in the ghost-text slot until the model is ready and real
		// transcripts start streaming.
		const renderPreparing = () => {
			if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
				return;
			}
			if (service.isPreparingModel) {
				this._renderPreparingText(getDictationPreparingLabel(service));
			}
		};
		renderPreparing();
		this._disposables.add(service.onDidChangePreparingModel(() => renderPreparing()));
		this._disposables.add(service.onDidChangeModelDownloadProgress(() => renderPreparing()));

		this._disposables.add(service.onDidUpdateTranscript(update => {
			if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
				return;
			}
			// Reuse the provider-path rendering by shaping the cumulative
			// transcript as a recognizing event. The staged text is only sent
			// once accepted (silence timeout or Stop Dictation), which fetches
			// the engine's final transcript. The first real transcript replaces
			// any lingering "Preparing…" hint.
			const event: ISpeechToTextEvent = { status: SpeechToTextStatus.Recognizing, text: update.text };
			this._updateInput(event);
			this._renderGhostText(event);
			this._updateDecoration();
			if (voiceTimeout > 0) {
				this._acceptTranscriptionScheduler!.cancel();
				this._acceptTranscriptionScheduler!.schedule();
			}
		}));

		// If the engine ends the session on its own (e.g. the model failed to
		// load), abort the terminal-side rendering. Guarded so neither the
		// accept-triggered nor the abort-triggered Idle transition re-enters.
		this._disposables.add(service.onDidChangeState(state => {
			if (state === ChatSpeechToTextState.Idle && !this._builtinFinalizing && !this._cancellationTokenSource?.token.isCancellationRequested) {
				this.stop();
			}
		}));

		try {
			await service.start(getActiveWindow(), 'terminal');
		} catch {
			// Microphone acquisition/connection failure is surfaced by the service.
			this.stop();
		}
	}

	/**
	 * Accept the built-in dictation: fetch the engine's final transcript (the
	 * last utterance is only returned by `stopAndTranscribe`, not the interim
	 * stream), stage it, then tear down and send it. Used by the silence timeout
	 * and the Stop Dictation action; abort/error teardown uses `cancel()` instead.
	 */
	private async _finalizeBuiltinThenStop(): Promise<void> {
		let finalText: string | undefined;
		try {
			finalText = await this._chatSpeechToTextService.stopAndTranscribe();
		} catch {
			// Fall back to the last interim text already staged in `_input`.
		}
		// A concurrent abort (e.g. the terminal was disposed) already tore down.
		if (!this._usingBuiltin || this._cancellationTokenSource?.token.isCancellationRequested) {
			return;
		}
		if (finalText !== undefined) {
			this._updateInput({ status: SpeechToTextStatus.Recognized, text: finalText });
		}
		// _builtinFinalizing is set, so this reaches the synchronous teardown and
		// sends the staged (final) text.
		this.stop(true);
	}

	stop(send?: boolean): void {
		// Built-in accept path: fetch the final transcript before tearing down.
		if (this._usingBuiltin && send && !this._builtinFinalizing) {
			this._builtinFinalizing = true;
			this._acceptTranscriptionScheduler?.cancel();
			this._finalizeBuiltinThenStop();
			return;
		}
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
		// Abort the on-device engine on teardown. On the accept path the engine
		// has already finished via stopAndTranscribe(), so this is a no-op there.
		if (this._usingBuiltin) {
			this._chatSpeechToTextService.cancel();
		}
		this._disposables.clear();
		this._input = '';
		this._terminalDictationInProgress.reset();
		this._usingBuiltin = false;
		this._builtinFinalizing = false;
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
		this._renderGhostTextContent(e.text, 'terminal-voice-progress-text');
	}

	/**
	 * Render a non-transcript hint (e.g. "Preparing…/Downloading… X%") in the
	 * ghost-text slot while the on-device model is still preparing on first use.
	 * Styled distinctly from the live transcript so it does not read as speech.
	 */
	private _renderPreparingText(label: string): void {
		this._renderGhostTextContent(label, 'terminal-voice-preparing-text');
	}

	private _renderGhostTextContent(text: string | undefined, className: string): void {
		this._ghostText?.dispose();
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
			e.classList.add(className);
			e.textContent = text;
			e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + '%';
		});
	}
}
