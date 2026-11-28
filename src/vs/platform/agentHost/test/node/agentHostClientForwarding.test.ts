/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { connect } from 'net';
import { tmpdir } from 'os';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AGENT_HOST_CLIENT_FORWARDING_ENV, AgentHostClientForwardingService, IAgentHostForwardingClient } from '../../node/agentHostClientForwarding.js';
import { AgentHostClientForwardingMainService } from '../../node/agentHostClientForwardingMainService.js';
import { categorizeGitHost, categorizeProtocol, getClientForwardingSetup, parseGitCredentialRequest } from '../../node/agentHostClientForwardingTelemetry.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { IClientForwardingHost, IClientForwardingHostCommandResult, parseWindowsSocketFile } from '../../node/clientForwardingHost.js';
import { applyClientGitConfig, canCopyGitConfig, getCommandName } from '../../node/clientGitConfig.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';

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

	test('reports only fixed protocol and host categories of Git credential requests', () => {
		assert.deepStrictEqual([
			'protocol=https\nhost=octo.ghe.com\npath=org/repo.git\nusername=octocat\n\n',
			'url=http://GitHub.com:8080/org/repo\n\n',
			'protocol=ssh\r\nhost=dev.azure.com\r\n\r\n',
			'protocol=https\nhost=notgithub.com\n\n',
			'protocol=https\nhost=github.com.example.net\n\n',
			'protocol=https\nhost=[::1]:8080\n\n',
			'url=not a url\n\n',
		].map(input => {
			const { protocol, host } = parseGitCredentialRequest(input);
			return [categorizeProtocol(protocol), categorizeGitHost(host)];
		}), [
			['https', 'ghe'],
			['http', 'github'],
			['other', 'azureDevOps'],
			['https', 'other'],
			['https', 'other'],
			['https', 'other'],
			['none', 'none'],
		]);
	});

	test('reports the setup of each capability a client offers, and what a client forwarding only the identity does not as withheld', () => {
		const state = { sshAgentStarted: true, gitCredentialHelper: 'environment', gpgAgent: undefined, keyboxd: false, gitConfig: 'copied', gitIdentity: 'set' } as const;
		const description = { gitConfig: true, gitCredentials: true, sshAgent: true, gpgAgent: true, keyboxd: false };
		assert.deepStrictEqual([
			getClientForwardingSetup({ ...state, description, gpgAgent: 'ownKeys' }),
			// An agent a client offers is forwarded without its Git credentials as well.
			getClientForwardingSetup({ ...state, description: { ...description, gitCredentials: false, gpgAgent: false } }),
			getClientForwardingSetup({ ...state, description: undefined, gitCredentialHelper: 'legacyEnvironment' }),
			getClientForwardingSetup({ ...state, description: { ...description, sshAgent: false, gpgAgent: false }, sshAgentStarted: false, gitCredentialHelper: 'noGit' }),
		].map(setup => [setup.forwardSshAgent, setup.forwardGpgAgent, setup.forwardGitCredentialHelper]), [
			['local', 'ownKeys', 'environment'],
			['local', 'withheld', 'withheld'],
			['failed', 'failed', 'failed'],
			['failed', 'none', 'noGit'],
		]);
	});

	test('reports a client identity Git could not set as failed', async () => {
		const home = join(tmpdir(), `vscode-ah-fwd-missing-${generateUuid()}`);
		const apply = (code: number) => applyClientGitConfig({
			home,
			xdgConfigHome: join(home, '.config'),
			environment: {},
			run: async (_command, args) => args.includes('--replace-all') ? { stdout: '', code } : args.includes('--get') ? { stdout: '', code: 1 } : { stdout: 'git version 2.47.0\n', code: 0 },
		}, false, { sshAgent: false, gpgAgent: false }, async () => ({ user: { name: 'Client User', email: 'client@example.com' } }), () => { });
		assert.deepStrictEqual([await apply(0), await apply(255)], [{ config: 'notOffered', identity: 'set' }, { config: 'notOffered', identity: 'failed' }]);
	});

	test('rejects Git credential requests that fail on the client for reasons other than a missing credential', async () => {
		const results: (IClientForwardingHostCommandResult | undefined)[] = [
			{ code: 0, stdout: Buffer.from('password=secret\n'), stderr: Buffer.alloc(0) },
			{ code: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: could not read Username for \'https://example.com\': terminal prompts disabled\n') },
			{ code: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: bad config line 1 in file /home/user/.gitconfig\n') },
			undefined,
		];
		const host = new class extends mock<IClientForwardingHost>() {
			override async run() {
				return results.shift();
			}
		}();
		const service = store.add(new class extends AgentHostClientForwardingMainService {
			protected override _getHost() {
				return Promise.resolve(host);
			}
		}(new TestConfigurationService(), new class extends mock<INativeEnvironmentService>() { }(), new NullLogService()));
		const outcomes: string[] = [];
		for (let i = 0; i < 4; i++) {
			outcomes.push(await service.gitCredential('get', 'protocol=https\nhost=example.com\n\n').then(output => `output: ${output}`, error => `error: ${error.message}`));
		}
		assert.deepStrictEqual(outcomes, [
			'output: password=secret\n',
			'output: ',
			'error: git credential fill failed with exit code 128',
			'error: Git is not installed',
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
		const events: { eventName: string; data: ITelemetryData | undefined }[] = [];
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				events.push({ eventName, data });
			}
		}();
		const service = store.add(new AgentHostClientForwardingService(environment, process.execPath, new NullLogService(), stateManager, configuration, telemetryService));
		const onDidReceiveData = store.add(new Emitter<{ readonly connection: number; readonly data: VSBuffer }>());
		const onDidReceiveClose = store.add(new Emitter<number>());
		const requests: unknown[] = [];
		const closed = new DeferredPromise<void>();
		let duringCredentialLookup: (() => void) | undefined;
		const client: IAgentHostForwardingClient = {
			clientId: 'client',
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
				duringCredentialLookup?.();
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
			// A reconnecting client registers again, which neither copies its Git configuration nor reports its setup again.
			registration.dispose();
			registration = service.registerClient(client);
			await service.settled();
			const agentReply = (await request(Buffer.from('request'))).toString();
			// Closing the connection closes the client's.
			await closed.p;
			const gitOutput = await run('git', ['credential', 'fill'], 'protocol=https\nhost=example.com\n\n');
			const identity = await run('git', ['config', '--global', '--get-regexp', '^user\\.']);

			// A connection that stays open until a session turns sandboxing on.
			const held = connect(environment.SSH_AUTH_SOCK!);
			held.on('error', () => { });
			const heldClosed = new Promise<boolean>(resolve => held.once('close', () => resolve(true)));
			const heldReply = await new Promise<string>(resolve => {
				held.once('data', reply => resolve(reply.toString()));
				held.write('held');
			});
			// The processes of a sandboxed session share the environment, so nothing is forwarded once it exists, not even
			// what a pending lookup returns. Like the Copilot runtime, the session applies its sandbox state to its metadata.
			duringCredentialLookup = () => {
				const session = 'copilot:/sandboxed';
				stateManager.createSession({
					resource: session, provider: 'copilot', title: 'Sandboxed', status: SessionStatus.Idle,
					createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
					defaultChat: buildDefaultChatUri(session),
				});
				configuration.setChatSandboxEnabled({ session, chat: buildDefaultChatUri(session) }, true);
			};
			const sandboxed = {
				gitOutput: await run('git', ['credential', 'fill'], 'protocol=https\nhost=example.com\n\n'),
				heldReply,
				heldClosed: await heldClosed,
				reply: [...await request(requestIdentities)],
			};

			registration.dispose();
			await service.settled();
			const afterClient = { sshAuthSock: environment.SSH_AUTH_SOCK === sshAuthSock, reply: [...await request(requestIdentities)] };
			const use = (clientId: string | undefined, forwarded: string, operation: string, outcome: string, protocol?: string, hostCategory?: string) => ({ eventName: 'agentHost.forwardingUse', data: { clientId, service: forwarded, operation, outcome, protocol, hostCategory } });
			assert.deepStrictEqual({
				launcherVariable: environment[AGENT_HOST_CLIENT_FORWARDING_ENV],
				gitConfig: [environment.GIT_CONFIG_KEY_0, environment.GIT_CONFIG_VALUE_0, environment.GIT_CONFIG_KEY_1],
				withoutClient,
				agentReply,
				gitOutput,
				identity,
				sandboxed,
				requests,
				afterClient,
				events,
			}, {
				launcherVariable: undefined,
				gitConfig: ['core.autocrlf', 'false', 'credential.helper'],
				// SSH_AGENT_IDENTITIES_ANSWER without keys.
				withoutClient: [0, 0, 0, 5, 12, 0, 0, 0, 0],
				agentReply: 'agent:request',
				gitOutput: 'protocol=https\nhost=example.com\nusername=user\npassword=secret\n',
				identity: 'user.name Client User\nuser.email client@example.com\n',
				sandboxed: { gitOutput: '', heldReply: 'agent:held', heldClosed: true, reply: [0, 0, 0, 5, 12, 0, 0, 0, 0] },
				requests: [['gitConfig'], ['open', 'ssh-agent'], ['gitCredential', 'get', true], ['open', 'ssh-agent'], ['gitCredential', 'get', true]],
				afterClient: { sshAuthSock: true, reply: [0, 0, 0, 5, 12, 0, 0, 0, 0] },
				// The second connection to the client's SSH agent is the same use.
				events: [
					use(undefined, 'ssh-agent', 'connect', 'emptyAgent'),
					{
						eventName: 'agentHost.forwardingSetup',
						data: { clientId: 'client', forwardSshAgent: 'local', forwardGpgAgent: 'none', forwardKeyboxd: 'none', forwardGitCredentialHelper: 'environment', forwardGitConfig: 'withheld', forwardGitIdentity: 'set' },
					},
					use('client', 'ssh-agent', 'connect', 'success'),
					use('client', 'git-credential-helper', 'get', 'credential', 'https', 'other'),
					use('client', 'git-credential-helper', 'get', 'sandboxed', 'https', 'other'),
					use('client', 'ssh-agent', 'connect', 'sandboxed'),
					use(undefined, 'ssh-agent', 'connect', 'sandboxed'),
				],
			});
		} finally {
			registration?.dispose();
			service.dispose();
			await rm(folder, { recursive: true, force: true });
		}
	});

	test('reports a connection that sandboxing closed while the client was connecting to its agent as sandboxed', async () => {
		const folder = await mkdtemp(join(tmpdir(), 'vscode-ah-fwd-test-'));
		const environment: NodeJS.ProcessEnv = { ...process.env, [AGENT_HOST_CLIENT_FORWARDING_ENV]: '1', HOME: folder, XDG_CONFIG_HOME: join(folder, '.config'), GIT_CONFIG_NOSYSTEM: '1' };
		delete environment.SSH_AUTH_SOCK;
		delete environment.GIT_CONFIG_GLOBAL;
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const configuration = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
		const uses: (ITelemetryData | undefined)[] = [];
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				if (eventName === 'agentHost.forwardingUse') {
					uses.push(data);
				}
			}
		}();
		const service = store.add(new AgentHostClientForwardingService(environment, process.execPath, new NullLogService(), stateManager, configuration, telemetryService));
		const opening = new DeferredPromise<void>();
		const opened = new DeferredPromise<void>();
		const registration = service.registerClient({
			clientId: 'client',
			onDidReceiveData: Event.None,
			onDidReceiveClose: Event.None,
			describe: async () => ({ gitConfig: false, gitCredentials: true, sshAgent: true, gpgAgent: false, keyboxd: false }),
			open: async () => {
				opening.complete();
				await opened.p;
			},
			sendData: () => { },
			sendClose: () => { },
			gitCredential: async () => '',
			gpgKeys: async () => ({}),
			gitConfig: async () => ({ user: {} }),
		});
		try {
			await service.settled();
			const socket = connect(environment.SSH_AUTH_SOCK!);
			socket.on('error', () => { });
			const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
			await opening.p;
			const session = 'copilot:/sandboxed';
			stateManager.createSession({
				resource: session, provider: 'copilot', title: 'Sandboxed', status: SessionStatus.Idle,
				createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
				defaultChat: buildDefaultChatUri(session),
			});
			configuration.setChatSandboxEnabled({ session, chat: buildDefaultChatUri(session) }, true);
			await closed;
			opened.complete();
			await timeout(0);
			assert.deepStrictEqual(uses, [{ clientId: 'client', service: 'ssh-agent', operation: 'connect', outcome: 'sandboxed', protocol: undefined, hostCategory: undefined }]);
		} finally {
			registration.dispose();
			service.dispose();
			await rm(folder, { recursive: true, force: true });
		}
	});
});