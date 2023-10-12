/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtHostSpeechProviderShape, IMainContext, MainContext, MainThreadSpeechProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class ExtHostSpeechProvider implements ExtHostSpeechProviderShape {

	private static ID_POOL = 1;

	private readonly proxy: MainThreadSpeechProviderShape;
	private readonly providers = new Map<number, vscode.SpeechProvider>();

	constructor(
		mainContext: IMainContext,
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadSpeechProvider);
	}

	async $provideSpeechToText(handle: number, token: CancellationToken): Promise<void> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		const event = provider.provideSpeechToText(token);
		if (token.isCancellationRequested) {
			return;
		}

		const subscription = event(e => {
			if (token.isCancellationRequested) {
				return;
			}

			this.proxy.$emitSpeechToTextEvent(handle, e);
		});

		token.onCancellationRequested(() => subscription.dispose());
	}

	registerProvider(extension: ExtensionIdentifier, identifier: string, provider: vscode.SpeechProvider): IDisposable {
		const handle = ExtHostSpeechProvider.ID_POOL++;

		this.providers.set(handle, provider);
		this.proxy.$registerProvider(handle, identifier, { extension, displayName: extension.value });

		return toDisposable(() => {
			this.proxy.$unregisterProvider(handle);
			this.providers.delete(handle);
		});
	}
}
