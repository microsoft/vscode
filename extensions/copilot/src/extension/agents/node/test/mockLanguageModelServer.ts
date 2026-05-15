/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelServerConfig, LanguageModelServer } from '../langModelServer';

/**
 * Mock implementation of LanguageModelServer for unit tests. It avoids binding
 * sockets and returns a deterministic configuration.
 */
export class MockLanguageModelServer extends LanguageModelServer {
	private _cfg: ILanguageModelServerConfig = { port: 12345, nonce: 'test-nonce' };

	override async start(): Promise<void> {
	}

	setMockConfig(cfg: ILanguageModelServerConfig) { this._cfg = cfg; }

	override getConfig(): ILanguageModelServerConfig { return this._cfg; }
}
