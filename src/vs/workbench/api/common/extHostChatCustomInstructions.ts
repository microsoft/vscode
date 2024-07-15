/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostChatCustomInstructionsShape, IChatCustomInstructionDto, IChatVariableResolverProgressDto, IMainContext, MainContext, MainThreadChatVariablesShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { IChatRequestVariableValue, IChatVariableData } from 'vs/workbench/contrib/chat/common/chatVariables';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import type * as vscode from 'vscode';

export class ExtHostChatCustomInstructions implements ExtHostChatCustomInstructionsShape {


	private static _idPool = 0;
	private readonly _proxy: MainThreadChatCustomInstructionsShape;

	private readonly providers = new Map<number, vscode.ChatCustomInstructionProvider>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChatVariables);
	}
	$provideCustomInstructions(handle: number, token: CancellationToken): Promise<IChatCustomInstructionDto[]> {
		throw new Error('Method not implemented.');
	}

	registerCustomInstructionProvider(extension: IRelaxedExtensionDescription, provider: vscode.ChatCustomInstructionProvider): vscode.Disposable {
		const handle = ExtHostChatCustomInstructions._idPool++;

		this.providers.set(handle, provider);
		this.proxy.$registerProvider(handle, identifier, { extension, displayName: extension.value });

		return toDisposable(() => {
			this.proxy.$unregisterProvider(handle);
			this.providers.delete(handle);
		});
	}


}

