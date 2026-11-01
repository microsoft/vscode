/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import assert from 'assert';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotSandboxCertificate } from '../../node/copilot/copilotSandboxCertificate.js';
import { executeCopilotCertificateCommand, runAgentHostCertificateCommand } from '../../node/copilot/copilotSandboxCertificateCli.js';

type CertificateRpc = CopilotClient['rpc']['sandbox']['proxyCa'];
type CertificateStatus = Awaited<ReturnType<CertificateRpc['getStatus']>>;

suite('CopilotSandboxCertificateCli', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let calls: string[];
	let status: CertificateStatus;
	let failStart: boolean;
	let failOperation: boolean;
	let stopErrors: Error[];
	let rpc: CertificateRpc;
	let client: Pick<CopilotClient, 'start' | 'stop' | 'rpc'>;

	setup(() => {
		calls = [];
		status = { state: 'notInstalled', canInstall: true };
		failStart = false;
		failOperation = false;
		stopErrors = [];
		rpc = new class extends mock<CertificateRpc>() {
			override create = async (params: Parameters<CertificateRpc['create']>[0]) => {
				assert.deepStrictEqual(params, {});
				calls.push('create');
				if (failOperation) {
					throw new Error('Cannot create certificate');
				}
				return { certificatePath: 'public-ca.pem' };
			};
			override trust = async (params: Parameters<CertificateRpc['trust']>[0]) => {
				assert.deepStrictEqual(params, {});
				calls.push('trust');
				return status;
			};
			override remove = async () => {
				calls.push('remove');
				if (failOperation) {
					throw new Error('Cannot remove certificate trust');
				}
				return status;
			};
			override getStatus = async (params: Parameters<CertificateRpc['getStatus']>[0]) => {
				assert.deepStrictEqual(params, {});
				calls.push('status');
				return status;
			};
		};
		client = {
			start: async () => {
				calls.push('start');
				if (failStart) {
					throw new Error('Cannot start runtime');
				}
			},
			stop: async () => { calls.push('stop'); return stopErrors; },
			rpc: upcastPartial<CopilotClient['rpc']>({
				sandbox: upcastPartial<CopilotClient['rpc']['sandbox']>({ proxyCa: rpc }),
			}),
		};
	});

	test('create uses saved settings without a chat or OS trust and stops the runtime', async () => {
		const output: string[] = [];
		const code = await executeCopilotCertificateCommand('create', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message));
		assert.deepStrictEqual({ code, output, calls }, { code: 0, output: ['public-ca.pem'], calls: ['start', 'create', 'stop'] });
	});

	test('trust does not create or rotate the CA', async () => {
		status = { state: 'installed', canInstall: true };
		const output: string[] = [];
		const code = await executeCopilotCertificateCommand('trust', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message));
		assert.deepStrictEqual({ code, calls, output }, {
			code: 0, calls: ['start', 'trust', 'stop'],
			output: ['The sandbox certificate is trusted. Restart affected tools. Select Refresh in the remote chat\'s certificate notice. If Refresh is unavailable, restart the agent host and reconnect.'],
		});
	});

	test('remove uses the existing host removal operation and stops the runtime', async () => {
		const output: string[] = [];
		const code = await executeCopilotCertificateCommand('remove', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message));
		assert.deepStrictEqual({ code, calls, output }, {
			code: 0, calls: ['start', 'remove', 'stop'],
			output: ['The sandbox certificate was removed from OS trust. The stored CA and private key were retained. Restart affected tools. Select Refresh in the remote chat\'s certificate notice. If Refresh is unavailable, restart the agent host and reconnect.'],
		});
	});

	for (const state of ['installed', 'unsupported', 'error'] as const) {
		test(`remove rejects ${state} without reporting success`, async () => {
			status = { state, canInstall: false };
			const output: string[] = [];
			await assert.rejects(executeCopilotCertificateCommand('remove', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)), /did not confirm/);
			assert.deepStrictEqual({ calls, output }, { calls: ['start', 'remove', 'stop'], output: [] });
		});
	}

	test('remove reports OS authorization failure and still stops the runtime', async () => {
		status = { state: 'error', canInstall: true, detail: 'OS authorization denied' };
		const output: string[] = [];
		await assert.rejects(executeCopilotCertificateCommand('remove', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)), /OS authorization denied/);
		assert.deepStrictEqual({ calls, output }, { calls: ['start', 'remove', 'stop'], output: [] });
	});

	for (const failure of ['operation', 'shutdown'] as const) {
		test(`remove reports ${failure} failure without success output`, async () => {
			failOperation = failure === 'operation';
			stopErrors = failure === 'shutdown' ? [new Error('Cannot stop runtime')] : [];
			const output: string[] = [];
			await assert.rejects(executeCopilotCertificateCommand('remove', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)),
				failure === 'operation' ? /Cannot remove certificate trust/ : /Cannot stop runtime/);
			assert.deepStrictEqual({ calls, output }, { calls: ['start', 'remove', 'stop'], output: [] });
		});
	}

	for (const [state, detail, expectedCode] of [
		['installed', undefined, 0],
		['notInstalled', undefined, 3],
		['unsupported', undefined, 4],
		['installed', 'Rotation required', 5],
		['notInstalled', 'Rotation required', 5],
		['error', 'Access denied', 1],
	] as const) {
		test(`status returns ${expectedCode} for ${state} with ${detail}`, async () => {
			status = { state, detail, canInstall: false };
			const output: string[] = [];
			const code = await executeCopilotCertificateCommand('status', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message));
			assert.deepStrictEqual({ code, calls, output }, {
				code: expectedCode, calls: ['start', 'status', 'stop'], output: [detail ? `${state}: ${detail}` : state],
			});
		});
	}

	for (const failure of ['startup', 'operation', 'shutdown'] as const) {
		test(`reports ${failure} failure and attempts runtime cleanup`, async () => {
			failStart = failure === 'startup';
			failOperation = failure === 'operation';
			stopErrors = failure === 'shutdown' ? [new Error('Cannot stop runtime')] : [];
			await assert.rejects(executeCopilotCertificateCommand('create', client, new CopilotSandboxCertificate(new NullLogService()), () => { }),
				failure === 'startup' ? /Cannot start runtime/ : failure === 'operation' ? /Cannot create certificate/ : /Cannot stop runtime/);
			assert.deepStrictEqual(calls, failure === 'startup' ? ['start', 'stop'] : ['start', 'create', 'stop']);
		});
	}

	test('trust failure does not report success', async () => {
		status = { state: 'error', canInstall: true, detail: 'OS authorization denied' };
		const output: string[] = [];
		await assert.rejects(executeCopilotCertificateCommand('trust', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)), /OS authorization denied/);
		assert.deepStrictEqual({ calls, output }, { calls: ['start', 'trust', 'stop'], output: [] });
	});

	test('trust rejects an installed CA that needs rotation', async () => {
		status = { state: 'installed', canInstall: true, detail: 'Rotation required' };
		const output: string[] = [];
		await assert.rejects(executeCopilotCertificateCommand('trust', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)), /Rotation required/);
		assert.deepStrictEqual({ calls, output }, { calls: ['start', 'trust', 'stop'], output: [] });
	});

	test('operation and cleanup failures are both reported without success output', async () => {
		failOperation = true;
		stopErrors = [new Error('Cannot stop runtime')];
		const output: string[] = [];
		await assert.rejects(executeCopilotCertificateCommand('create', client, new CopilotSandboxCertificate(new NullLogService()), message => output.push(message)),
			/Cannot create certificate\nCannot stop runtime/);
		assert.deepStrictEqual({ calls, output }, { calls: ['start', 'create', 'stop'], output: [] });
	});

	test('invalid commands and unconfirmed trust changes fail before starting a runtime', async () => {
		await assert.rejects(runAgentHostCertificateCommand('delete', true), /Expected a certificate command/);
		await assert.rejects(runAgentHostCertificateCommand('trust', false), /requires explicit confirmation/);
		await assert.rejects(runAgentHostCertificateCommand('remove', false), /requires explicit confirmation/);
	});

});
