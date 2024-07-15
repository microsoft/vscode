/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostChatCustomInstructionsShape, IChatCustomInstructionDto, IMainContext, MainContext, MainThreadChatCustomInstructionsShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';

export class ExtHostChatCustomInstructions implements ExtHostChatCustomInstructionsShape {


	private static _idPool = 0;
	private readonly _proxy: MainThreadChatCustomInstructionsShape;

	private readonly providers = new Map<number, vscode.ChatCustomInstructionProvider>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatCustomInstructions);
	}
	$provideCustomInstructions(handle: number, token: CancellationToken): Promise<IChatCustomInstructionDto[] | undefined> {
		const provider = this.providers.get(handle);
		if (provider) {
			return Promise.resolve(provider.provideCustomInstructions(token)).then(instructions => {
				return instructions ?? undefined;
			});
		}
		return Promise.resolve(undefined);
	}

	registerCustomInstructionProvider(extension: IRelaxedExtensionDescription, provider: vscode.ChatCustomInstructionProvider): vscode.Disposable {
		const handle = ExtHostChatCustomInstructions._idPool++;

		this.providers.set(handle, provider);
		this._proxy.$registerProvider(handle);

		return toDisposable(() => {
			this._proxy.$unregisterProvider(handle);
			this.providers.delete(handle);
		});
	}

}

