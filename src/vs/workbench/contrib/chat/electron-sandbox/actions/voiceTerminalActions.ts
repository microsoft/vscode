/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

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
		@ITerminalService readonly _terminalService: ITerminalService
	) {
		super();
	}
	start(): void {
		this.stop();
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
					// TODO: start audio cue, show in status bar
					break;
				case SpeechToTextStatus.Recognized:
					if (e.text) {
						this._terminalService.activeInstance?.sendText(e.text, false);
					}
					break;
				case SpeechToTextStatus.Stopped:
					// TODO: stop audio cue, hide in status bar
					this.stop();
					break;
			}
		}));
	}
	stop(): void {
		this._cancellationTokenSource?.cancel();
		this._disposables.dispose();
	}
}
