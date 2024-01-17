/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
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

export class TerminalSpeechToTextSession extends Disposable {
	private _input: string = '';
	private _decoration: IDecoration | undefined;
	private _marker: IXtermMarker | undefined;
	private static _instance: TerminalSpeechToTextSession | undefined = undefined;
	private _acceptTranscriptionScheduler: RunOnceScheduler | undefined;
	static getInstance(instantiationService: IInstantiationService): TerminalSpeechToTextSession {
		if (!TerminalSpeechToTextSession._instance) {
			TerminalSpeechToTextSession._instance = instantiationService.createInstance(TerminalSpeechToTextSession);
		}

		return TerminalSpeechToTextSession._instance;
	}
	private _cancellationTokenSource: CancellationTokenSource | undefined;
	private _disposables = new DisposableStore();
	constructor(
		@ISpeechService private readonly _speechService: ISpeechService,
		@ITerminalService readonly _terminalService: ITerminalService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IInstantiationService readonly _instantationService: IInstantiationService
	) {
		super();
		this._register(this._terminalService.onDidChangeActiveInstance(() => this.stop()));
		this._register(this._terminalService.onDidDisposeInstance(() => this.stop()));
	}

	start(): void {
		this.stop();
		let voiceTimeout = this.configurationService.getValue<number>(AccessibilityVoiceSettingId.SpeechTimeout);
		if (!isNumber(voiceTimeout) || voiceTimeout < 0) {
			voiceTimeout = SpeechTimeoutDefault;
		}
		this._acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
			this._terminalService.activeInstance?.sendText(this._input, false);
			this.stop();
		}, voiceTimeout));
		this._cancellationTokenSource = new CancellationTokenSource();
		const session = this._disposables.add(this._speechService.createSpeechToTextSession(this._cancellationTokenSource!.token));

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
		if (send) {
			this._acceptTranscriptionScheduler!.cancel();
			this._terminalService.activeInstance?.sendText(this._input, false);
		}
		this._marker?.dispose();
		this._decoration?.dispose();
		this._decoration = undefined;
		this._cancellationTokenSource?.cancel();
		this._disposables.clear();
		this._input = '';
	}

	private _updateInput(e: ISpeechToTextEvent): void {
		if (e.text) {
			let input = e.text.replaceAll(/[.,?;!]/g, '');
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

			for (const symbol in symbolMap) {
				const regex: RegExp = new RegExp(symbol);
				input = input.replace(regex, symbolMap[symbol]);
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
		this._marker = activeInstance.registerMarker(-1);
		if (!this._marker) {
			return;
		}
		this._decoration = xterm.registerDecoration({
			marker: this._marker,
			layer: 'top',
			x: xterm.buffer.active.cursorX ?? 0,
		});
		this._decoration?.onRender((e: HTMLElement) => {
			e.classList.add(...ThemeIcon.asClassNameArray(Codicon.mic));
			e.style.transform = 'translate(-5px, -5px)';
		});
	}
}


