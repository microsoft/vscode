/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { classifySSHConnectError } from '../../common/sshConnectTelemetry.js';
import { decodeSSHConnectFailureCode, encodeSSHConnectFailureCode, setSSHConnectFailureCode, SSHAuthenticationFailedError, SSHConnectFailureCode, SSHHostKeyDeniedError } from '../../common/sshRemoteAgentHost.js';
import { AHP_UNSUPPORTED_PROTOCOL_VERSION, ProtocolError } from '../../common/state/sessionProtocol.js';

suite('classifySSHConnectError', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/** Rejects across shared-process IPC, which only carries an error's name and message, and decodes like the renderer. */
	function acrossIPC(error: Error, code?: SSHConnectFailureCode): Error {
		if (code) {
			setSSHConnectFailureCode(error, code);
		}
		encodeSSHConnectFailureCode(error);
		const received = new Error(error.message);
		received.name = error.name;
		decodeSSHConnectFailureCode(received);
		return received;
	}

	test('classifies by error name and failure code, never by message', () => {
		const results = {
			cancelled: acrossIPC(new CancellationError(), SSHConnectFailureCode.CliInstall),
			hostKeyDenied: acrossIPC(new SSHHostKeyDeniedError('host'), SSHConnectFailureCode.Connection),
			authentication: acrossIPC(new SSHAuthenticationFailedError('Credentials rejected'), SSHConnectFailureCode.Connection),
			connectionRefused: acrossIPC(Object.assign(new AggregateError([], 'connect ECONNREFUSED 10.0.0.1:22'), { code: 'ECONNREFUSED' }), SSHConnectFailureCode.Network),
			hostKeyFormat: acrossIPC(new Error('Handshake failed: no matching host key format'), SSHConnectFailureCode.HostKeyFormat),
			kexAlgorithm: acrossIPC(new Error('Handshake failed: no matching key exchange algorithm'), SSHConnectFailureCode.KexAlgorithm),
			handshake: acrossIPC(new Error('Handshake failed: signature verification failed'), SSHConnectFailureCode.Handshake),
			remoteCommandOutput: acrossIPC(new Error('SSH command failed (exit 1)\nstderr: mkdir: Permission denied; Network is unreachable'), SSHConnectFailureCode.CliInstall),
			relay: acrossIPC(new Error('Failed to connect to the selected remote agent host'), SSHConnectFailureCode.Relay),
			unknown: acrossIPC(new Error('authentication failed: network error')),
		};
		assert.deepStrictEqual({
			...Object.fromEntries(Object.entries(results).map(([key, error]) => [key, { name: error.name, ...classifySSHConnectError(error, false) }])),
			incompatible: classifySSHConnectError(new ProtocolError(AHP_UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version'), true),
		}, {
			cancelled: { name: 'Canceled', errorCategory: 'cancelled', stage: 'unknown' },
			hostKeyDenied: { name: 'SSHHostKeyDenied', errorCategory: 'hostKeyDenied', stage: 'ssh' },
			authentication: { name: 'SSHAuthenticationFailed', errorCategory: 'authentication', stage: 'ssh' },
			connectionRefused: { name: 'AggregateError', errorCategory: 'network', stage: 'ssh' },
			hostKeyFormat: { name: 'Error', errorCategory: 'hostKeyFormat', stage: 'ssh' },
			kexAlgorithm: { name: 'Error', errorCategory: 'kexAlgorithm', stage: 'ssh' },
			handshake: { name: 'Error', errorCategory: 'handshake', stage: 'ssh' },
			remoteCommandOutput: { name: 'Error', errorCategory: 'other', stage: 'cliInstall' },
			relay: { name: 'Error', errorCategory: 'other', stage: 'relay' },
			unknown: { name: 'Error', errorCategory: 'other', stage: 'unknown' },
			incompatible: { errorCategory: 'incompatible', stage: 'protocol' },
		});
	});
});
