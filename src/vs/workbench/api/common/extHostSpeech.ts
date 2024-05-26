/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtHostSpeechShape, IMainContext, MainContext, MainThreadSpeechShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class ExtHostSpeech implements ExtHostSpeechShape {

	private static ID_POOL = 1;

	private readonly proxy: MainThreadSpeechShape;

	private readonly providers = new Map<number, vscode.SpeechProvider>();
	private readonly sessions = new Map<number, CancellationTokenSource>();
	private readonly synthesizers = new Map<number, vscode.TextToSpeechSession>();

	constructor(
		mainContext: IMainContext
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadSpeech);
	}

	async $createSpeechToTextSession(handle: number, session: number, language?: string): Promise<void> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		const disposables = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.sessions.set(session, cts);

		const speechToTextSession = await provider.provideSpeechToTextSession(cts.token, language ? { language } : undefined);
		if (!speechToTextSession) {
			return;
		}

		disposables.add(speechToTextSession.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.proxy.$emitSpeechToTextEvent(session, e);
		}));

		disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
	}

	async $cancelSpeechToTextSession(session: number): Promise<void> {
		this.sessions.get(session)?.dispose(true);
		this.sessions.delete(session);
	}

	async $createTextToSpeechSession(handle: number, session: number, language?: string): Promise<void> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		const disposables = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.sessions.set(session, cts);

		const textToSpeech = await provider.provideTextToSpeechSession(cts.token, language ? { language } : undefined);
		if (!textToSpeech) {
			return;
		}

		this.synthesizers.set(session, textToSpeech);

		disposables.add(textToSpeech.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.proxy.$emitTextToSpeechEvent(session, e);
		}));

		disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
	}

	async $synthesizeSpeech(session: number, text: string): Promise<void> {
		this.synthesizers.get(session)?.synthesize(text);
	}

	async $cancelTextToSpeechSession(session: number): Promise<void> {
		this.sessions.get(session)?.dispose(true);
		this.sessions.delete(session);
		this.synthesizers.delete(session);
	}

	async $createKeywordRecognitionSession(handle: number, session: number): Promise<void> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		const disposables = new DisposableStore();

		const cts = new CancellationTokenSource();
		this.sessions.set(session, cts);

		const keywordRecognitionSession = await provider.provideKeywordRecognitionSession(cts.token);
		if (!keywordRecognitionSession) {
			return;
		}

		disposables.add(keywordRecognitionSession.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.proxy.$emitKeywordRecognitionEvent(session, e);
		}));

		disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
	}

	async $cancelKeywordRecognitionSession(session: number): Promise<void> {
		this.sessions.get(session)?.dispose(true);
		this.sessions.delete(session);
	}

	registerProvider(extension: ExtensionIdentifier, identifier: string, provider: vscode.SpeechProvider): IDisposable {
		const handle = ExtHostSpeech.ID_POOL++;

		this.providers.set(handle, provider);
		this.proxy.$registerProvider(handle, identifier, { extension, displayName: extension.value });

		return toDisposable(() => {
			this.proxy.$unregisterProvider(handle);
			this.providers.delete(handle);
		});
	}
}
