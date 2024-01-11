/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { AccessibilityVoiceSettingId, SpeechTimeoutDefault } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { isNumber } from 'vs/base/common/types';

export class StartTerminalSpeechToTextAction extends Action2 {

	static readonly ID = 'workbench.action.startTerminalSpeechToText';

	constructor() {
		super({
			id: 'workbench.action.startTerminalSpeechToText',
			title: {
				value: localize('workbench.action.startTerminalSpeechToText', "Start Terminal Speech To Text"),
				original: 'Start Terminal Speech To Text'
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, TerminalContextKeys.focus),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		VoiceSession.getInstance(instantiationService).start();
	}
}


export class StopTerminalSpeechToTextAction extends Action2 {

	static readonly ID = 'workbench.action.stopTerminalSpeechToText';

	constructor() {
		super({
			id: 'workbench.action.stopTerminalSpeechToText',
			title: {
				value: localize('workbench.action.stopTerminalSpeechToText', "Stop Terminal Speech To Text"),
				original: 'Stop Terminal Speech To Text'
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, TerminalContextKeys.focus),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		VoiceSession.getInstance(instantiationService).stop();
	}
}

class VoiceSession extends Disposable {
	private _input: string = '';
	private static instance: VoiceSession | undefined = undefined;
	static getInstance(instantiationService: IInstantiationService): VoiceSession {
		if (!VoiceSession.instance) {
			VoiceSession.instance = instantiationService.createInstance(VoiceSession);
		}

		return VoiceSession.instance;
	}
	private _cancellationTokenSource: CancellationTokenSource | undefined;
	private _disposables = new DisposableStore();
	constructor(
		@ISpeechService private readonly _speechService: ISpeechService,
		@ITerminalService readonly _terminalService: ITerminalService,
		@IConfigurationService readonly configurationService: IConfigurationService
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
		const acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
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
					break;
				case SpeechToTextStatus.Recognizing:
					// TODO: start audio cue, show in terminal by the cursor
					if (voiceTimeout > 0) {
						acceptTranscriptionScheduler.cancel();
					}
					break;
				case SpeechToTextStatus.Recognized:
					if (e.text) {
						this._input = [this._input, e.text].join(' ');
					}
					if (voiceTimeout > 0) {
						acceptTranscriptionScheduler.schedule();
					}
					break;
				case SpeechToTextStatus.Stopped:
					// TODO: stop audio cue, hide in terminal by the cursor
					this.stop();
					break;
			}
		}));
	}
	stop(): void {
		this._cancellationTokenSource?.cancel();
		this._disposables.dispose();
		this._input = '';
	}
}
