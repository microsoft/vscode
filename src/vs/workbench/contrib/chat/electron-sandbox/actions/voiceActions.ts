/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { HasSpeechProvider, ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';


export class StartEditorSpeechToTextAction extends Action2 {

	static readonly ID = 'workbench.action.startEditorSpeechToText';

	constructor() {
		super({
			id: 'workbench.action.startEditorSpeechToText',
			title: {
				value: localize('workbench.action.startEditorSpeechToText', "Start Editor Speech To Text"),
				original: 'Start Editor Speech To Text'
			},
			precondition: ContextKeyExpr.and(HasSpeechProvider, EditorContextKeys.focus),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		VoiceSession.getInstance(instantiationService).start('editor');
	}
}


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
		VoiceSession.getInstance(instantiationService).start('terminal');
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
		private readonly _speechService: ISpeechService,
		private readonly _editorService: IEditorService,
		private readonly _terminalService: ITerminalService
	) {
		super();
	}
	start(type: 'terminal' | 'editor'): void {
		this.stop();
		if (this._cancellationTokenSource) {
			this._cancellationTokenSource.cancel();
		} else {
			this._cancellationTokenSource = new CancellationTokenSource();
		}
		const session = this._disposables.add(this._speechService.createSpeechToTextSession(this._cancellationTokenSource!.token));
		this._disposables.add(session.onDidChange((e) => {
			switch (e.status) {
				case SpeechToTextStatus.Started:
					console.log('started', e.text);
					break;
				case SpeechToTextStatus.Recognizing:
					console.log('recognizing', e.text);
					if (type === 'terminal') {
						this._terminalService.activeInstance?.sendText(e.text!, true);
					} else {
						this._editorService.activeTextEditorControl?.trigger?.('type', 'type', { text: e.text });
					}
					break;
				case SpeechToTextStatus.Recognized:
					console.log('recognized', e.text);
					if (type === 'terminal') {
						this._terminalService.activeInstance?.sendText(e.text!, true);
					} else {
						this._editorService.activeTextEditorControl?.trigger?.('type', 'type', { text: e.text });
					}
					break;
				case SpeechToTextStatus.Stopped:
					console.log('stopped', e.text);
					break;
			}
		}));
	}
	stop(): void {
		this._cancellationTokenSource?.cancel();
		this._disposables.dispose();
	}
}
