/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ExtHostSpeechProviderShape, IMainContext, MainContext, MainThreadSpeechProviderShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

type SpeechProviderData = {
	readonly extension: ExtensionIdentifier;
	readonly provider: vscode.SpeechProvider;
};

export class ExtHostSpeechProvider implements ExtHostSpeechProviderShape {

	private static ID_POOL = 1;

	private readonly proxy: MainThreadSpeechProviderShape;
	private readonly providers = new Map<number, SpeechProviderData>();

	constructor(
		mainContext: IMainContext,
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadSpeechProvider);
	}

	async $provideSpeechToText(handle: number, token: CancellationToken): Promise<any> {
		const provider = this.providers.get(handle);
		if (!provider) {
			return;
		}

		return provider.provider.provideSpeechToText(token);
	}

	registerProvider(extension: ExtensionIdentifier, identifier: string, provider: vscode.SpeechProvider): IDisposable {
		const handle = ExtHostSpeechProvider.ID_POOL++;
		this.providers.set(handle, { extension, provider });
		this.proxy.$registerProvider(handle, identifier, { extension, displayName: extension.value });

		return toDisposable(() => {
			this.proxy.$unregisterProvider(handle);
			this.providers.delete(handle);
		});
	}
}
