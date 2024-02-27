/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, DiagnosticModel } from '@volar/language-server';
import { startLanguageServer } from '@volar/test-utils';

export const testServers = new Map<string, ReturnType<typeof startLanguageServer>>();

export async function getTestServer(rootUri: string, capabilities?: ClientCapabilities) {
	let server = testServers.get(rootUri);
	let needInit = false;
	if (!server) {
		server = startLanguageServer(require.resolve('../node/htmlServerMain'));
		testServers.set(rootUri, server);
		needInit = true;
	}
	else if (capabilities) {
		await server.shutdown();
		needInit = true;
	}
	if (needInit) {
		await server.initialize(rootUri, {
			diagnosticModel: DiagnosticModel.Pull,
			semanticTokensLegend: {
				// fill missing modifiers from standard modifiers
				tokenModifiers: ['local'],
				tokenTypes: [],
			},
		}, capabilities);
	}
	return server;
}

let testsCount = 0;

export function onTestStart() {
	testsCount++;
}

export function onTestEnd() {
	testsCount--;
	if (testsCount === 0) {
		for (const server of testServers.values()) {
			server.connection.dispose();
		}
		testServers.clear();
	}
}
