import { ClientCapabilities, DiagnosticModel } from '@volar/language-server';
import { startLanguageServer } from '@volar/test-utils';
import * as path from 'path';

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
			typescript: { tsdk: path.dirname(require.resolve('typescript')) },
			diagnosticModel: DiagnosticModel.Pull,
			fullCompletionList: true,
		}, capabilities);
	}
	return server;
}
