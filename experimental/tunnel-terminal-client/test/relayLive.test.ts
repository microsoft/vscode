/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { ManagementApiVersions, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { CancellationTokenSource, SshAlgorithms } from '@microsoft/dev-tunnels-ssh';
import { getAccessToken } from '../src/auth.js';
import { discoverMachines, relayConnectionFailure } from '../src/tunnel.js';
import { deadline } from '../src/wire.js';

const tunnelName = process.env.TUNNEL_TERMINAL_TEST_TUNNEL;

test('opt-in: real relay connects and still rejects an unexpected host key', {
	skip: !tunnelName,
	timeout: 90_000,
}, async t => {
	const signal = AbortSignal.timeout(60_000);
	const token = await getAccessToken({ provider: 'github', signal, log: message => t.diagnostic(message) });
	const cancellation = new CancellationTokenSource();
	t.after(() => { cancellation.cancel(); cancellation.dispose(); });
	const matching = (await discoverMachines(token, 'github', signal)).filter(machine => machine.name === tunnelName || machine.id === tunnelName);
	assert.equal(matching.length, 1, 'Select a unique test tunnel name or ID.');
	const management = new TunnelManagementHttpClient(
		'experimental-tunnel-terminal-client/0.0.1',
		ManagementApiVersions.Version20230927preview,
		async () => `github ${token}`,
	);
	const tunnel = await deadline(management.getTunnel({
		tunnelId: matching[0].id,
		clusterId: matching[0].cluster,
	}, { includePorts: true, tokenScopes: ['connect'] }, cancellation.token), 'Test tunnel lookup', signal);
	assert.ok(tunnel?.endpoints?.length, 'The test tunnel must have a live endpoint.');
	assert.ok(tunnel.endpoints.every(endpoint => endpoint.hostPublicKeys?.length), 'The test requires published host keys.');
	const secrets = [token, ...Object.values(tunnel.accessTokens ?? {})];
	const relay = new TunnelRelayTunnelClient(management);
	t.after(() => relay.dispose());
	relay.acceptLocalConnectionsForForwardedPorts = false;
	try {
		await deadline(relay.connect(tunnel, { enableRetry: false, enableReconnect: false }, cancellation.token), 'Test relay connection', signal);
		await deadline(relay.waitForForwardedPort(31546, cancellation.token), 'Test agent-host port', signal);
	} catch (error) {
		throw new Error(relayConnectionFailure(error, [...secrets, ...Object.values(relay.tunnel?.accessTokens ?? {})]));
	}
	await relay.dispose();

	const algorithm = SshAlgorithms.publicKey.rsaWithSha256;
	assert.ok(algorithm);
	const differentHostKey = algorithm.createKeyPair();
	t.after(() => differentHostKey.dispose());
	await differentHostKey.generate();
	const differentBytes = await differentHostKey.getPublicKeyBytes();
	assert.ok(differentBytes);
	let verificationRejected = false;
	// No management client: a refresh must not replace our intentionally incorrect expectation.
	const mismatchedRelay = new TunnelRelayTunnelClient(undefined, (_level, _id, message) => {
		verificationRejected ||= message === 'Host public key verification failed.';
	});
	t.after(() => mismatchedRelay.dispose());
	mismatchedRelay.acceptLocalConnectionsForForwardedPorts = false;
	await assert.rejects(deadline(mismatchedRelay.connect({
		...tunnel,
		endpoints: tunnel.endpoints.map(endpoint => ({ ...endpoint, hostPublicKeys: [differentBytes.toString('base64')] })),
	}, { enableRetry: false, enableReconnect: false }, cancellation.token), 'Test incorrect host key', signal));
	assert.equal(verificationRejected, true, 'The SDK must reject the mismatched key during host verification.');
});
