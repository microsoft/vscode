/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { OpenAILanguageModelServer } from './oaiLanguageModelServer';

export class LanguageModelProxyProvider implements vscode.LanguageModelProxyProvider {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	async provideModelProxy(forExtensionId: string, token: vscode.CancellationToken): Promise<vscode.LanguageModelProxy | undefined> {
		const server = this.instantiationService.createInstance(OpenAILanguageModelServer);
		await server.start();

		return new OpenAILanguageModelProxy(server);
	}
}

class OpenAILanguageModelProxy extends Disposable implements vscode.LanguageModelProxy {
	public readonly uri: vscode.Uri;
	public readonly key: string;

	constructor(
		runningServer: OpenAILanguageModelServer,
	) {
		super();
		this._register(runningServer);

		const config = runningServer.getConfig();
		this.uri = URI.parse(`http://localhost:${config.port}`);
		this.key = config.nonce;
	}
}
