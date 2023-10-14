/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtHostSpeechShape, IMainContext, MainContext, MainThreadSpeechShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class ExtHostSpeech implements ExtHostSpeechShape {

	private static ID_POOL = 1;

	private readonly proxy: MainThreadSpeechShape;
	private readonly providers = new Map<number, vscode.SpeechProvider>();
	private readonly sessions = new Map<number, CancellationTokenSource>();

	constructor(
		mainContext: IMainContext
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadSpeech);
	}

	async $createSpeechToTextSession(handle: number, session: number, token: CancellationToken): Promise<void> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		const cts = new CancellationTokenSource(token);
		this.sessions.set(session, cts);

		const speechToTextSession = provider.provideSpeechToTextSession(cts.token);
		if (cts.token.isCancellationRequested) {
			return;
		}

		const listener = speechToTextSession.onDidChange(e => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			this.proxy.$emitSpeechToTextEvent(session, e);
		});

		cts.token.onCancellationRequested(() => {
			listener.dispose();
			speechToTextSession.dispose();
		});
	}

	async $cancelSpeechToTextSession(session: number): Promise<void> {
		this.sessions.get(session)?.dispose(true);
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
