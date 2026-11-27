/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { connect } from 'net';
import { tmpdir } from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_CLIENT_FORWARDING_ENV, AgentHostClientForwardingService, IAgentHostForwardingClient } from '../../node/agentHostClientForwarding.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { parseWindowsSocketFile } from '../../node/clientForwardingHost.js';
import { canCopyGitConfig, getCommandName } from '../../node/clientGitConfig.js';

suite('AgentHostClientForwarding', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses Cygwin and Gpg4win socket files', () => {
		const nonce = Buffer.from('0123456789abcdef');
		assert.deepStrictEqual({
			cygwin: parseWindowsSocketFile(Buffer.from('!<socket >50123 s 01234567-89ABCDEF-01234567-89ABCDEF\0'), 7),
			gpg4win: parseWindowsSocketFile(Buffer.concat([Buffer.from('50124\n'), nonce])),
		}, {
			cygwin: {
				port: 50123,
				data: Buffer.from([0x67, 0x45, 0x23, 0x01, 0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01, 0xef, 0xcd, 0xab, 0x89, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
				skip: 28,
			},
			gpg4win: { port: 50124, data: nonce, skip: 0 },
		});
	});

	test('copies a client\'s Git configuration only once, and only where there is none of tools or identity only', () => {
		assert.deepStrictEqual({
			missing: canCopyGitConfig(undefined),
			toolsAndIdentity: canCopyGitConfig('[safe]\n\tdirectory = /workspace\n[filter "lfs"]\n\tclean = git-lfs clean -- %f\n[user]\n\temail = a@example.com\n'),
			copied: canCopyGitConfig('[safe]\n\tdirectory = /workspace\n# Copied from the client by VS Code.\n[user]\n\temail = a@example.com\n'),
			own: canCopyGitConfig('[core]\n\tautocrlf = input\n'),
			indentedOwn: canCopyGitConfig('[safe]\n\tdirectory = /workspace\n  [core]\n\tautocrlf = input\n'),
		}, { missing: true, toolsAndIdentity: true, copied: false, own: false, indentedOwn: false });
	});

	test('finds the program of a configured command as the shell Git runs it with', () => {
		assert.deepStrictEqual([
			'code --wait',
			'"C:/Program Files/Microsoft VS Code/bin/code" --wait',
			'C:/Program\\ Files/Git/mingw64/bin/git-credential-manager.exe get',
			'  /usr/bin/vim  ',
		].map(command => getCommandName(command)), [
			'code',
			'C:/Program Files/Microsoft VS Code/bin/code',
			'C:/Program Files/Git/mingw64/bin/git-credential-manager.exe',
			'/usr/bin/vim',
		]);
	});

	test('forwards what clients offer to the processes the agent host starts, which get the environment before a client connects', async () => {
		const folder = await mkdtemp(join(tmpdir(), 'vscode-ah-fwd-test-'));
		// Isolated from the machine's Git configuration, whose helpers could prompt.
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			[AGENT_HOST_CLIENT_FORWARDING_ENV]: '1',
			HOME: folder,
			XDG_CONFIG_HOME: join(folder, '.config'),
			GIT_CONFIG_NOSYSTEM: '1',
			GIT_TERMINAL_PROMPT: '0',
			GIT_CONFIG_COUNT: '1',
			GIT_CONFIG_KEY_0: 'core.autocrlf',
			GIT_CONFIG_VALUE_0: 'false',
		};
		delete environment.SSH_AUTH_SOCK;
		delete environment.GIT_CONFIG_GLOBAL;
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const configuration = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
		const service = store.add(new AgentHostClientForwardingService(environment, process.execPath, new NullLogService(), stateManager, configuration));
		const onDidReceiveData = store.add(new Emitter<{ readonly connection: number; readonly data: VSBuffer }>());
		const onDidReceiveClose = store.add(new Emitter<number>());
		const requests: unknown[] = [];
		const closed = new DeferredPromise<void>();
		const client: IAgentHostForwardingClient = {
			onDidReceiveData: onDidReceiveData.event,
			onDidReceiveClose: onDidReceiveClose.event,
			// Like a sandboxed container's client, it supplies only its identity, which works on any platform.
			describe: async () => ({ gitConfig: false, gitCredentials: true, sshAgent: true, gpgAgent: false, keyboxd: false }),
			open: async (_connection, socket) => {
				requests.push(['open', socket]);
			},
			// The client's agent replies to each message.
			sendData: (connection, data) => onDidReceiveData.fire({ connection, data: VSBuffer.concat([VSBuffer.fromString('agent:'), data]) }),
			sendClose: () => closed.complete(),
			gitCredential: async (operation, input) => {
				requests.push(['gitCredential', operation, input.includes('host=example.com\n')]);
				return 'protocol=https\nhost=example.com\nusername=user\npassword=secret\n';
			},
			gpgKeys: async () => ({}),
			gitConfig: async () => {
				requests.push(['gitConfig']);
				return { user: { name: 'Client User', email: 'client@example.com' } };
			},
		};
		const request = (data: Buffer) => new Promise<Buffer>((resolve, reject) => {
			const socket = connect(environment.SSH_AUTH_SOCK!);
			socket.once('error', reject);
			socket.once('data', reply => {
				socket.end();
				resolve(reply);
			});
			socket.write(data);
		});
		const run = (command: string, args: readonly string[], input = '') => new Promise<string>((resolve, reject) => {
			const child = spawn(command, args, { env: environment, cwd: folder });
			let output = '';
			child.stdout.on('data', data => output += data.toString());
			child.once('error', reject);
			child.once('close', () => resolve(output));
			child.stdin.end(input);
		});
		// SSH_AGENTC_REQUEST_IDENTITIES
		const requestIdentities = Buffer.from([0, 0, 0, 1, 11]);
		let registration: IDisposable | undefined;
		try {
			await service.whenEnvironmentReady();
			const sshAuthSock = environment.SSH_AUTH_SOCK;
			const withoutClient = [...await request(requestIdentities)];

			registration = service.registerClient(client);
			await service.settled();
			const agentReply = (await request(Buffer.from('request'))).toString();
			// Closing the connection closes the client's.
			await closed.p;
			const gitOutput = await run('git', ['credential', 'fill'], 'protocol=https\nhost=example.com\n\n');
			const identity = await run('git', ['config', '--global', '--get-regexp', '^user\\.']);

			// The processes of a sandboxed session share the environment, so nothing is forwarded while it exists.
			const session = 'copilot:/sandboxed';
			stateManager.createSession({
				resource: session, provider: 'copilot', title: 'Sandboxed', status: SessionStatus.Idle,
				createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
				defaultChat: buildDefaultChatUri(session),
			});
			configuration.setChatSandboxEnabled({ session, chat: buildDefaultChatUri(session) }, true);
			const sandboxed = {
				reply: [...await request(requestIdentities)],
				gitOutput: await run('git', ['credential', 'fill'], 'protocol=https\nhost=example.com\n\n'),
			};

			registration.dispose();
			await service.settled();
			assert.deepStrictEqual({
				launcherVariable: environment[AGENT_HOST_CLIENT_FORWARDING_ENV],
				gitConfig: [environment.GIT_CONFIG_KEY_0, environment.GIT_CONFIG_VALUE_0, environment.GIT_CONFIG_KEY_1],
				withoutClient,
				agentReply,
				gitOutput,
				identity,
				sandboxed,
				requests,
				afterClient: { sshAuthSock: environment.SSH_AUTH_SOCK === sshAuthSock, reply: [...await request(requestIdentities)] },
			}, {
				launcherVariable: undefined,
				gitConfig: ['core.autocrlf', 'false', 'credential.helper'],
				// SSH_AGENT_IDENTITIES_ANSWER without keys.
				withoutClient: [0, 0, 0, 5, 12, 0, 0, 0, 0],
				agentReply: 'agent:request',
				gitOutput: 'protocol=https\nhost=example.com\nusername=user\npassword=secret\n',
				identity: 'user.name Client User\nuser.email client@example.com\n',
				sandboxed: { reply: [0, 0, 0, 5, 12, 0, 0, 0, 0], gitOutput: '' },
				requests: [['gitConfig'], ['open', 'ssh-agent'], ['gitCredential', 'get', true]],
				afterClient: { sshAuthSock: true, reply: [0, 0, 0, 5, 12, 0, 0, 0, 0] },
			});
		} finally {
			registration?.dispose();
			service.dispose();
			await rm(folder, { recursive: true, force: true });
		}
	});
});