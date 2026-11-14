/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Application, ApplicationOptions, Logger, Quality } from '../../../../automation';
import { createApp, dumpFailureDiagnostics, getCopilotSmokeTestEnv, getMockLlmServerPath, getMockLlmServerUrl, installAppAfterHandler, installDiagnosticsHandler, latestUserInputCarriesTag, MockLlmServer, preseedChatExtensionEnablement, suiteCrashPath, suiteLogsPath } from '../../utils';
import { shellEchoResponseMatcher, shellEchoScenario } from '../chat/shellScenarios';
import { CONFIGURED_PROXY_CREDENTIALS_ANSWERED_LOG, createRemoteDevContainerFixture, getDevContainerCliInstallCommand, getTunnelSmokeTestAvailability, IRemoteDevContainerFixture, RemoteDevContainerTransport } from './remoteDevContainerFixtures';

// Selector for the send button in the Agents Window new-session homepage.
// Kept in sync with `SEND_BUTTON_ENABLED` in `test/automation/src/agentsWindow.ts`
// (without the `:not(.disabled)` filter so we can observe the disabled state).
const AGENTS_SEND_BUTTON_SELECTOR = '.sessions-chat-widget .new-chat-widget-container .sessions-shared-chat-input .chat-execute-toolbar .action-item.chat-submit-button';
const NETWORK_PROXY_HEADER_NAME = 'X-VSCode-Smoke-Proxy';

function mockServerStartOptions(logger: (message: string) => void, captureRequests = false) {
	const requiredRequestHeaderValue = process.env.VSCODE_SMOKE_TEST_PROXY_HEADER;
	const certificatePath = process.env.VSCODE_SMOKE_TEST_MOCK_CERT;
	const keyPath = process.env.VSCODE_SMOKE_TEST_MOCK_KEY;
	if (!!certificatePath !== !!keyPath) {
		throw new Error('Mock HTTPS requires both VSCODE_SMOKE_TEST_MOCK_CERT and VSCODE_SMOKE_TEST_MOCK_KEY');
	}
	return {
		logger,
		verbose: true,
		captureRequests,
		requiredRequestHeader: requiredRequestHeaderValue ? { name: NETWORK_PROXY_HEADER_NAME, value: requiredRequestHeaderValue } : undefined,
		trustedRequestHost: requiredRequestHeaderValue ? process.env.VSCODE_SMOKE_TEST_MOCK_HOST : undefined,
		tls: certificatePath && keyPath ? {
			cert: fs.readFileSync(certificatePath, 'utf8'),
			key: fs.readFileSync(keyPath, 'utf8'),
		} : undefined,
	};
}

const CODEX_SCENARIO_ID = 'smoke-hello-codex';
const CODEX_REPLY = 'MOCKED_CODEX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpCodexModel} to pre-pay
// the Codex session cold-start cost (native codex app-server spawn + model
// list resolution) before the real assertion runs.
const CODEX_WARMUP_SCENARIO_ID = 'smoke-hello-codex-warmup';
const CODEX_WARMUP_REPLY = 'MOCKED_CODEX_WARMUP_RESPONSE';

const AGENT_HOST_SCENARIO_ID = 'smoke-hello-agent-host';
const AGENT_HOST_REPLY = 'MOCKED_AGENT_HOST_RESPONSE';
const AGENT_HOST_MODEL = 'gpt-5.3-codex';
const AGENT_HOST_REPLACEMENT_SCENARIO_ID = 'smoke-agent-host-session-replacement';
const AGENT_HOST_REPLACEMENT_REPLY = 'MOCKED_AGENT_HOST_REPLACEMENT_RESPONSE';
const DEV_CONTAINER_SCENARIO_ID = 'smoke-dev-container-agent-host';

function prepareDevContainerWorkspace(workspacePath: string, port: number, options: ApplicationOptions): void {
	const configDirectory = path.join(workspacePath, '.devcontainer');
	const mockServerUrl = `http://vscode-smoke.test:${port}`;
	fs.mkdirSync(configDirectory, { recursive: true });
	fs.writeFileSync(path.join(configDirectory, 'devcontainer.json'), JSON.stringify({
		name: 'Agents Window Smoke',
		image: 'mcr.microsoft.com/devcontainers/base:ubuntu-24.04',
		remoteUser: 'vscode',
		runArgs: ['--add-host=vscode-smoke.test:host-gateway'],
		containerEnv: {
			COPILOT_API_URL: mockServerUrl,
			COPILOT_DEBUG_GITHUB_API_URL: mockServerUrl,
			GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
			VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: mockServerUrl,
			VSCODE_SMOKE_TEST_PROXY_HEADER: process.env.VSCODE_SMOKE_TEST_PROXY_HEADER ?? 'dev-container',
		},
		postCreateCommand: getDevContainerCliInstallCommand(options.codePath),
	}, null, 2));
}

function removeDevContainerConfiguration(workspacePath: string): void {
	fs.rmSync(path.join(workspacePath, '.devcontainer'), { recursive: true, force: true });
}

function cleanupDevContainerWorkspace(workspacePath: string): void {
	removeDevContainerConfiguration(workspacePath);
	removeDevContainer(workspacePath);
}

function removeDevContainer(workspacePath: string): number {
	// URI.fsPath normalizes the Windows drive letter in the container label.
	const labeledPath = process.platform === 'win32' ? workspacePath.replace(/^[A-Z]:/, drive => drive.toLowerCase()) : workspacePath;
	const containerIds = cp.execFileSync('docker', ['ps', '-aq', '--filter', `label=devcontainer.local_folder=${labeledPath}`], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
	if (containerIds.length > 0) {
		cp.execFileSync('docker', ['rm', '--force', ...containerIds], { stdio: 'pipe' });
	}
	return containerIds.length;
}

const AGENT_HOST_SDK_SANDBOX_SCENARIO_ID = 'smoke-hello-agent-host-sdk-sandbox';
const AGENT_HOST_SDK_SANDBOX_REPLY = 'MOCKED_AGENT_HOST_SDK_SANDBOX_RESPONSE';

// Lightweight throwaway scenario used by {@link warmUpAgentHostModel} to
// prime the CLI model list before the real assertion. Registered in every
// AgentHost suite by {@link setupAgentHostSuite}.
const AGENT_HOST_WARMUP_SCENARIO_ID = 'smoke-hello-agent-host-warmup';
const AGENT_HOST_WARMUP_REPLY = 'MOCKED_AGENT_HOST_WARMUP_RESPONSE';

const DOCKER_PROBE_TIMEOUT_MS = 60_000;

function probeLinuxDocker(): Promise<{ readonly available: boolean; readonly reason?: string }> {
	return new Promise(resolve => {
		cp.execFile('docker', ['info', '--format', '{{.OSType}}'], {
			encoding: 'utf8',
			timeout: DOCKER_PROBE_TIMEOUT_MS,
			windowsHide: true,
		}, (error, stdout, stderr) => {
			const operatingSystem = stdout.trim().toLowerCase();
			resolve(!error && operatingSystem === 'linux'
				? { available: true }
				: {
					available: false,
					reason: error?.message
						?? (stderr.trim() || undefined)
						?? `Docker daemon reports '${operatingSystem || 'unknown'}' containers`,
				});
		});
	});
}

function installDockerPrerequisite(logger: Logger, required: boolean): void {
	before('check Linux Docker availability', async function () {
		this.timeout(DOCKER_PROBE_TIMEOUT_MS + 15_000);
		const label = this.test?.parent?.title ?? 'Dev Container';
		const start = Date.now();
		logger.log(`${label}: checking Linux Docker availability (timeout ${DOCKER_PROBE_TIMEOUT_MS}ms)`);
		const docker = await probeLinuxDocker();
		logger.log(`${label}: Docker probe completed in ${Date.now() - start}ms: ${docker.available ? 'available' : docker.reason}`);
		if (!docker.available && !required) {
			logger.log(`Skipping ${label}: ${docker.reason}`);
			this.skip();
		}
		assert.ok(docker.available, `Expected a reachable Linux Docker daemon: ${docker.reason}`);
	});
}

export function setup(logger: Logger, quality: Quality) {

	describe('Agents Window (local AgentHost)', () => {

		const agentHost = setupAgentHostSuite(logger, {
			serverLabel: 'AgentHost',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(AGENT_HOST_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLY).build());
				registerScenario(AGENT_HOST_REPLACEMENT_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_REPLACEMENT_REPLY).build());
			},
			settings: {},
		});

		it('Replaces the new session UI with the in-progress AgentHost session', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				const requestsBefore = agentHost.mockServer.getRequests().length;
				const requestTag = `[proxy-request:${randomUUID()}]`;
				const worktreesBefore = process.env.VSCODE_SMOKE_TEST_PROXY_HEADER
					? cp.execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: app.workspacePathOrFolder, encoding: 'utf8' })
					: undefined;
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				await app.workbench.agentsWindow.submitNewSessionPrompt(`replace the new session UI [scenario:${AGENT_HOST_REPLACEMENT_SCENARIO_ID}] ${requestTag}`);
				await app.workbench.agentsWindow.waitForActiveSessionView();
				await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLACEMENT_REPLY);
				if (process.env.VSCODE_SMOKE_TEST_PROXY_HEADER) {
					await waitForPromptRequest(agentHost.mockServer, requestsBefore, requestTag);
					assert.strictEqual(
						cp.execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: app.workspacePathOrFolder, encoding: 'utf8' }),
						worktreesBefore,
						'Expected authenticated prompt validation without creating a worktree'
					);
				}
				if (process.env.VSCODE_SMOKE_TEST_HTTP_PROXY) {
					const agentHostLogPath = path.join(agentHost.logsPath, 'agenthost.log');
					assert.ok(
						CONFIGURED_PROXY_CREDENTIALS_ANSWERED_LOG.test(await waitForLogContent(() => readFileIfExists(agentHostLogPath), CONFIGURED_PROXY_CREDENTIALS_ANSWERED_LOG)),
						`Expected the Agent Host to answer the Copilot runtime's Basic proxy challenge with the credentials of the http.proxy setting in ${agentHostLogPath}`
					);
				}
				await app.workbench.agentsWindow.startNewSession();
			} catch (error) {
				logger.log(`Agents Window (AgentHost replacement) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost replacement)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});

		it('Test Copilot CLI session via AgentHost', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await warmUpAgentHostModel(app, logger, 'Agents Window (AgentHost)');

				const requestsBefore = agentHost.mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SCENARIO_ID}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_REPLY);
				logger.log(`Agents Window (AgentHost) response: ${text}`);

				assert.ok(
					agentHost.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to have received a new request from the AgentHost session'
				);

				// Confirm the request flowed through the AgentHost process (not
				// the renderer-side Copilot Chat extension fallback) by checking
				// for a `chat/turnStarted` frame in the AHP JSONL transcript.
				// In the multi-chat protocol turns are dispatched as chat
				// actions on the session's default chat channel. The transcript
				// is written through an async queue (see AhpJsonlLogger), so the
				// frame may not be on disk yet even after the assistant reply has
				// rendered — poll briefly.
				const ahpLogDir = path.join(agentHost.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"chat/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"chat/turnStarted"'),
					`expected the AgentHost process to have received a chat/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
				);
			} catch (error) {
				logger.log(`Agents Window (AgentHost) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});

	});

	const runDevContainerSuite = quality !== Quality.Exploration;
	if (!runDevContainerSuite) {
		logger.log('Skipping Agents Window (Dev Container AgentHost) on Exploration builds');
	}
	(runDevContainerSuite ? describe : describe.skip)('Agents Window (Dev Container AgentHost)', () => {
		installDockerPrerequisite(logger, process.platform === 'linux');

		const devContainer = setupAgentHostSuite(logger, {
			serverLabel: 'Dev Container AgentHost',
			mockServerHost: '0.0.0.0',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(DEV_CONTAINER_SCENARIO_ID, new ScenarioBuilder().emit('OK').build());
			},
			settings: {
				'chat.agentHost.devContainer.enabled': true,
				'chat.agentHost.devContainer.worktree.enabled': false,
				'chat.remoteAgentHostsEnabled': true,
				// The Agent Host in a local container resolves proxies through this client. The mock CAPI host only
				// resolves inside the container, so a proxy configured on the CI machine cannot reach it.
				'http.useLocalProxyConfiguration': false,
			},
			prepareWorkspace: (workspacePath, options) => prepareDevContainerWorkspace(workspacePath, devContainer.mockServer.port, options),
			cleanupWorkspace: cleanupDevContainerWorkspace,
		});

		it('Starts a session in a Dev Container', async function () {
			this.timeout(10 * 60 * 1000);
			const app = this.app as Application;

			try {
				const requestsBefore = devContainer.mockServer.requestCount();
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				await app.workbench.agentsWindow.selectDevContainer();
				const prompt = `start Dev Container [scenario:${DEV_CONTAINER_SCENARIO_ID}]`;
				await app.workbench.agentsWindow.submitNewSessionPrompt(prompt, 1_800);
				await app.workbench.agentsWindow.waitForSessionPreparation(prompt);
				await app.workbench.agentsWindow.showSessionPreparationLog();
				await app.workbench.agentsWindow.cancelSessionPreparation(prompt);
				await app.workbench.agentsWindow.retrySessionPreparation();
				await app.workbench.agentsWindow.waitForSessionPreparation(prompt);
				await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
				const text = await app.workbench.agentsWindow.waitForAssistantText('OK', 5 * 60 * 1000);
				await app.workbench.agentsWindow.verifyInputEnabledAfterPreparation();
				logger.log(`Agents Window (Dev Container AgentHost) response: ${text}`);
				assert.ok(
					devContainer.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to receive the Dev Container Agent Host request'
				);

				const ahpFrames = await waitForLogContent(
					() => readAhpFrames(path.join(devContainer.logsPath, 'ahp')),
					/"transport":"devcontainer"/,
					30_000,
				);
				assert.match(ahpFrames, /"vscode\.clientConnectionKind":"dev_container"/);
				assert.match(ahpFrames, /"transport":"devcontainer"/);

				const rendererLogs = await waitForLogContent(
					() => readRendererLogs(devContainer.logsPath),
					/\[AgentHost\] _invokeAgent called for resource: remote-devcontainer__/,
					30_000,
				);
				assert.match(rendererLogs, /\[AgentHost\] _invokeAgent called for resource: remote-devcontainer__/);

				await app.workbench.agentsWindow.startNewSession();
				await app.workbench.agentsWindow.selectDevContainer();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				assert.strictEqual(removeDevContainer(app.workspacePathOrFolder), 1, 'Expected to remove the fixture container');
				await waitForLogContent(
					() => readRendererLogs(devContainer.logsPath),
					/\[RemoteAgentHostProtocol\] Reconnecting to devcontainer:/,
					30_000,
				);
				const requestsBeforeReconnect = devContainer.mockServer.requestCount();
				const reconnectPrompt = `join reconnecting Dev Container [scenario:${DEV_CONTAINER_SCENARIO_ID}]`;
				await app.workbench.agentsWindow.submitNewSessionPrompt(reconnectPrompt, 1_800);
				await app.workbench.agentsWindow.waitForSessionPreparation(reconnectPrompt);
				await app.workbench.agentsWindow.waitForAssistantText('OK', 5 * 60 * 1000);
				assert.ok(devContainer.mockServer.requestCount() > requestsBeforeReconnect, 'Expected a request after joining the automatic reconnect');
			} catch (error) {
				logger.log(`Agents Window (Dev Container AgentHost) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (Dev Container AgentHost)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});

	for (const transport of ['ssh', 'tunnel', 'wsl'] as const) {
		const label = transport === 'ssh' ? 'SSH' : transport === 'wsl' ? 'WSL' : 'Tunnel';
		const isCI = !!process.env.CI || !!process.env.TF_BUILD;
		const required = transport === 'wsl' && process.env.VSCODE_SMOKE_TEST_WSL_REQUIRED === '1';
		const supportedPlatform = transport === 'wsl' ? process.platform === 'win32' : process.platform !== 'win32' && (!isCI || process.platform === 'linux');
		const requested = transport === 'ssh' || (transport === 'wsl' ? !!process.env.VSCODE_SMOKE_TEST_WSL_DISTRO : !!process.env.VSCODE_SMOKE_TEST_TUNNEL_TOKEN);
		const enabled = runDevContainerSuite && (required || (supportedPlatform && requested));
		if (!enabled) {
			logger.log(`Skipping Agents Window (${label} Dev Container AgentHost): ${!runDevContainerSuite ? 'not supported on Exploration builds' : !supportedPlatform ? 'unsupported platform' : transport === 'wsl' ? 'set VSCODE_SMOKE_TEST_WSL_DISTRO to enable the WSL fixture' : 'set VSCODE_SMOKE_TEST_TUNNEL_TOKEN to enable the real tunnel fixture'}`);
		}
		(enabled ? describe : describe.skip)(`Agents Window (${label} Dev Container AgentHost)`, () => {
			if (transport !== 'wsl') {
				installDockerPrerequisite(logger, process.platform === 'linux' || transport === 'tunnel');
			}
			before(() => {
				if (required) {
					assert.ok(supportedPlatform, 'Required WSL smoke tests need Windows.');
					assert.ok(process.env.VSCODE_SMOKE_TEST_WSL_DISTRO, 'Required WSL smoke tests need VSCODE_SMOKE_TEST_WSL_DISTRO from successful provisioning.');
					assert.ok(process.env.VSCODE_SMOKE_TEST_WSL_SERVER_PATH, 'Required WSL smoke tests need VSCODE_SMOKE_TEST_WSL_SERVER_PATH from successful provisioning.');
				}
				if (transport === 'tunnel') {
					const availability = getTunnelSmokeTestAvailability();
					assert.ok(availability.available, availability.reason);
				}
			});
			const scenario = `${DEV_CONTAINER_SCENARIO_ID}-${transport}`;
			const reply = `DEV_CONTAINER_${label.toUpperCase()}_RESPONSE`;
			const context = setupAgentHostSuite(logger, {
				serverLabel: `${label} Dev Container AgentHost`,
				mockServerHost: '0.0.0.0',
				remoteTransport: transport,
				registerScenarios: ({ ScenarioBuilder, registerScenario }) => registerScenario(scenario, new ScenarioBuilder().emit(reply).build()),
				settings: {
					'chat.agentHost.devContainer.enabled': true,
					'chat.agentHost.devContainer.worktree.enabled': false,
					'chat.remoteAgentHostsEnabled': true,
				},
				prepareWorkspace: (workspacePath, options) => prepareDevContainerWorkspace(workspacePath, context.mockServer.port, options),
				// The WSL fixture removes its container from the Docker daemon in WSL, and the Windows host
				// may have no Docker daemon of its own.
				cleanupWorkspace: transport === 'wsl' ? removeDevContainerConfiguration : cleanupDevContainerWorkspace,
			});

			it(`Starts and reopens a Dev Container session over ${label}`, async function () {
				this.timeout(10 * 60 * 1000);
				const app = this.app as Application;
				const fixture = context.remoteFixture;
				assert.ok(fixture, 'Expected the remote connection fixture');
				const workspacePath = fixture.workspacePath ?? app.workspacePathOrFolder;
				const workspaceLabel = `${path.basename(workspacePath)} [${fixture.name}]`;
				const prompt = `start ${label} Dev Container [scenario:${scenario}]`;
				try {
					await app.workbench.agentsWindow.waitForNewSessionView();
					if (transport === 'ssh') {
						assert.ok(fixture.ssh);
						await app.workbench.agentsWindow.connectSSHHost({ ...fixture.ssh, name: fixture.name }, workspacePath);
					} else if (transport === 'wsl') {
						await app.workbench.agentsWindow.connectWSLHost(fixture.name, workspacePath);
					} else {
						await app.workbench.agentsWindow.connectTunnelHost(fixture.name, workspacePath);
					}
					await app.workbench.agentsWindow.selectSessionType('Copilot', { providerLabel: fixture.name });
					await app.workbench.agentsWindow.selectDevContainer(workspaceLabel);
					const requestsBefore = context.mockServer.requestCount();
					await app.workbench.agentsWindow.submitNewSessionPrompt(prompt, 1_800);
					await app.workbench.agentsWindow.waitForSessionPreparation(prompt);
					await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
					await app.workbench.agentsWindow.waitForAssistantText(reply, 5 * 60 * 1000);
					assert.ok(context.mockServer.requestCount() > requestsBefore, 'Expected a new request at the mock LLM server');
					await assertRemoteDevContainerRouting(context.logsPath, transport, workspacePath, reply);
					await fixture.verifyMockServerRouting?.();
					await app.workbench.agentsWindow.startNewSession();
					await app.workbench.agentsWindow.activateSessionByLabel([prompt, reply], reply, 60_000);
					await app.workbench.agentsWindow.waitForAssistantText(reply);
				} catch (error) {
					logger.log(`Agents Window (${label} Dev Container) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
					if (fixture.dumpConnectionDiagnostics) {
						let uiState: string;
						try {
							uiState = await app.workbench.agentsWindow.getRemoteConnectionDiagnostics();
						} catch (diagnosticError) {
							uiState = `UI state unavailable: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`;
						}
						try {
							await fixture.dumpConnectionDiagnostics(uiState);
						} catch (diagnosticError) {
							const message = `Agents Window (${label} Dev Container) connection diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`;
							logger.log(message);
							console.error(message);
						}
					}
					await dumpFailureDiagnostics(app, logger, `Agents Window (${label} Dev Container)`, { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
					throw error;
				}
			});
		});
	}

	// Run by test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1, which provisions the WSL KDC and proxy, the
	// Windows Kerberos realm, CA and PAC, and launches the smoke tests with the realm credentials.
	const wslKerberosProxyScheme = process.platform === 'win32' ? process.env.VSCODE_SMOKE_TEST_WSL_KERBEROS_PROXY : undefined;
	if (!wslKerberosProxyScheme) {
		logger.log('Skipping the WSL AgentHost Kerberos proxy suites: run test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1 on Windows');
	}
	(wslKerberosProxyScheme ? describe : describe.skip)('Agents Window (WSL AgentHost, Kerberos proxy)', () => {
		const scenario = 'smoke-wsl-kerberos-proxy-agent-host';
		const reply = 'WSL_KERBEROS_PROXY_RESPONSE';
		const context = setupAgentHostSuite(logger, {
			serverLabel: 'WSL Kerberos proxy AgentHost',
			mockServerHost: '0.0.0.0',
			remoteTransport: 'wsl',
			wslClientProxy: 'agentHost',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => registerScenario(scenario, new ScenarioBuilder().emit(reply).build()),
			settings: {
				'chat.remoteAgentHostsEnabled': true,
				'chat.agentHost.githubEnvironments.enabled': true,
			},
		});

		it('Uses the Windows proxy, Kerberos ticket and certificates from a WSL AgentHost', async function () {
			this.timeout(10 * 60 * 1000);
			const app = this.app as Application;
			const fixture = context.remoteFixture;
			assert.ok(fixture, 'Expected the WSL connection fixture');
			const requestTag = `[proxy-request:${randomUUID()}]`;
			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.connectWSLHost(fixture.name, fixture.workspacePath ?? app.workspacePathOrFolder, '.git');
				await app.workbench.agentsWindow.selectSessionType('Copilot', { providerLabel: fixture.name });
				const requestsBefore = context.mockServer.getRequests().length;
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello through the Windows proxy [scenario:${scenario}] ${requestTag}`);
				await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
				await app.workbench.agentsWindow.waitForAssistantText(reply, 2 * 60 * 1000);
				await waitForPromptRequest(context.mockServer, requestsBefore, requestTag);
				await fixture.verifyMockServerRouting?.();
				await assertClientNetworkServed(context.logsPath, 'wsl', wslKerberosProxyScheme === 'https' ? 'HTTPS' : 'PROXY', 'Kerberos');
			} catch (error) {
				logger.log(`Agents Window (WSL Kerberos proxy) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				if (fixture.dumpConnectionDiagnostics) {
					try {
						await fixture.dumpConnectionDiagnostics(await app.workbench.agentsWindow.getRemoteConnectionDiagnostics());
					} catch (diagnosticError) {
						logger.log(`Agents Window (WSL Kerberos proxy) connection diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
					}
				}
				await dumpFailureDiagnostics(app, logger, 'Agents Window (WSL Kerberos proxy)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});

		// Sharing itself needs a GitHub account; this verifies that a WSL AgentHost of the client's build reports a
		// GitHub Environment status, which offers the Share action.
		it('Offers to share a WSL AgentHost as a GitHub Environment', async function () {
			this.timeout(5 * 60 * 1000);
			const app = this.app as Application;
			const fixture = context.remoteFixture;
			assert.ok(fixture, 'Expected the WSL connection fixture');
			if (!fixture.hostMatchesClientCommit) {
				logger.log('Skipping the GitHub Environment share action: the WSL AgentHost is of another commit than the client');
				this.skip();
			}
			try {
				await app.workbench.agentsWindow.waitForRemoteAction(fixture.name, `Share ${fixture.name} as GitHub Environment`, 2 * 60 * 1000);
			} catch (error) {
				logger.log(`Agents Window (WSL GitHub Environment) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (WSL GitHub Environment)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});

	// The same environment, with an editor window connected to a VS Code server in WSL, which spawns the Agent Host.
	(wslKerberosProxyScheme ? describe : describe.skip)('Editor Window (WSL remote AgentHost, Kerberos proxy)', () => {
		setupWslRemoteEditorProxySuite(logger, 'Kerberos', 'Uses the Windows proxy, Kerberos ticket and certificates from the AgentHost of a WSL remote');
	});

	// Run by test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1 -ProxyAuth Basic, which provisions a WSL proxy
	// with Basic authentication and the Windows CA, and passes the proxy URL, credentials included, for the http.proxy
	// setting.
	const wslBasicProxy = process.platform === 'win32' && process.env.VSCODE_SMOKE_TEST_WSL_BASIC_PROXY === '1' && !!process.env.VSCODE_SMOKE_TEST_HTTP_PROXY;
	if (!wslBasicProxy) {
		logger.log('Skipping the WSL remote AgentHost Basic proxy suite: run test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1 -ProxyAuth Basic on Windows');
	}
	(wslBasicProxy ? describe : describe.skip)('Editor Window (WSL remote AgentHost, Basic proxy)', () => {
		setupWslRemoteEditorProxySuite(logger, 'Basic', 'Uses the http.proxy setting with its credentials, and the Windows certificates, from the AgentHost of a WSL remote');
	});

	// Run by test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1 -ProxyAuth BasicPac, which provisions a WSL
	// proxy with Basic authentication and a Windows PAC script that selects it, and passes the credentials to type into
	// the proxy login dialog. No setting or environment variable carries them, except for the stale password of the
	// http.proxy setting of one suite. Each other test then changes the proxy password and logs in again with the new
	// one, after the proxy rejected the old one the Copilot runtime still had.
	const basicPacProxyScheme = process.platform === 'win32' ? process.env.VSCODE_SMOKE_TEST_BASIC_PAC_PROXY : undefined;
	if (!basicPacProxyScheme) {
		logger.log('Skipping the AgentHost Basic PAC proxy suites: run test/smoke/scripts/run-agents-window-wsl-kerberos-proxy.ps1 -ProxyAuth BasicPac on Windows');
	}
	const basicPacProxyCredentials = { username: process.env.VSCODE_SMOKE_TEST_PROXY_USER ?? '', password: process.env.VSCODE_SMOKE_TEST_PROXY_PASSWORD ?? '' };
	(basicPacProxyScheme ? describe : describe.skip)('Agents Window (local AgentHost, Basic PAC proxy)', () => {
		const scenario = 'smoke-local-basic-pac-proxy-agent-host';
		const reply = 'LOCAL_BASIC_PAC_PROXY_RESPONSE';
		const newPasswordReply = 'LOCAL_BASIC_PAC_PROXY_NEW_PASSWORD_RESPONSE';
		const context = setupAgentHostSuite(logger, {
			serverLabel: 'Local Basic PAC proxy AgentHost',
			mockServerHost: '0.0.0.0',
			proxyLoginCredentials: basicPacProxyCredentials,
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(scenario, new ScenarioBuilder().emit(reply).build());
				registerScenario(`${scenario}-new-password`, new ScenarioBuilder().emit(newPasswordReply).build());
			},
			settings: {},
		});

		it('Asks for the credentials of the PAC proxy of a local AgentHost', async function () {
			this.timeout(10 * 60 * 1000);
			const app = this.app as Application;
			const requestTag = `[proxy-request:${randomUUID()}]`;
			const logins = context.proxyLogins;
			assert.ok(logins, 'Expected the suite to fill the proxy login dialogs');
			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				const requestsBefore = context.mockServer.getRequests().length;
				const prompt = `hello through the PAC proxy [scenario:${scenario}] ${requestTag}`;
				await app.workbench.agentsWindow.submitNewSessionPrompt(prompt);
				await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
				await app.workbench.agentsWindow.waitForAssistantText(reply, 2 * 60 * 1000);
				await waitForPromptRequest(context.mockServer, requestsBefore, requestTag);
				assertProxyLoginDialogs(await logins.stop(), 1);
				await assertProxyPasswordChangeAsksAgain(app, context.mockServer, {
					scenario: `${scenario}-new-password`,
					firstPrompt: prompt,
					firstReply: reply,
					reply: newPasswordReply,
					readAgentHostLog: () => readFileIfExists(path.join(context.logsPath, 'agenthost.log')),
				});
			} catch (error) {
				logger.log(`Agents Window (local Basic PAC proxy) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (local Basic PAC proxy)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			} finally {
				await logins.stop();
			}
		});
	});

	// The http.proxy setting names the proxy with a stale password: after the proxy rejects it, the login dialog asks
	// for the current one. Requests of the app itself use the setting too, so in a product build the dialog may open
	// for one of those first; the Agent Host then gets the credentials typed into it without another dialog.
	const basicPacProxyUrl = basicPacProxyScheme && process.env.VSCODE_SMOKE_TEST_PROXY_URL ? new URL(process.env.VSCODE_SMOKE_TEST_PROXY_URL) : undefined;
	const staleHttpProxy = basicPacProxyUrl && `${basicPacProxyUrl.protocol}//${encodeURIComponent(basicPacProxyCredentials.username)}:stale-${randomUUID()}@${basicPacProxyUrl.host}`;
	(staleHttpProxy ? describe : describe.skip)('Agents Window (local AgentHost, Basic PAC proxy, stale http.proxy credentials)', () => {
		const scenario = 'smoke-local-basic-pac-proxy-stale-credentials-agent-host';
		const reply = 'LOCAL_BASIC_PAC_PROXY_STALE_CREDENTIALS_RESPONSE';
		const context = setupAgentHostSuite(logger, {
			serverLabel: 'Local Basic PAC proxy AgentHost with stale http.proxy credentials',
			mockServerHost: '0.0.0.0',
			proxyLoginCredentials: basicPacProxyCredentials,
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(scenario, new ScenarioBuilder().emit(reply).build());
			},
			settings: {
				'http.proxy': staleHttpProxy,
			},
		});

		it('Asks for the credentials of the proxy of a local AgentHost after it rejects those of the http.proxy setting', async function () {
			this.timeout(10 * 60 * 1000);
			const app = this.app as Application;
			const agentHostLogPath = path.join(context.logsPath, 'agenthost.log');
			const logins = context.proxyLogins;
			assert.ok(logins, 'Expected the suite to fill the proxy login dialogs');
			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.selectSessionType('Copilot');
				const requestTag = `[proxy-request:${randomUUID()}]`;
				const requestsBefore = context.mockServer.getRequests().length;
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello with stale http.proxy credentials [scenario:${scenario}] ${requestTag}`);
				await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
				await app.workbench.agentsWindow.waitForAssistantText(reply, 2 * 60 * 1000);
				await waitForPromptRequest(context.mockServer, requestsBefore, requestTag);
				const rejectedLogLine = /\[Copilot\] The proxy \S+ rejected the credentials of the http\.proxy setting, asking a client for credentials/;
				const log = await waitForLogContent(() => readFileIfExists(agentHostLogPath), log => CONFIGURED_PROXY_CREDENTIALS_ANSWERED_LOG.test(log) && rejectedLogLine.test(log), 30_000);
				assert.ok(CONFIGURED_PROXY_CREDENTIALS_ANSWERED_LOG.test(log), `Expected the Agent Host to answer the Copilot runtime's Basic proxy challenge with the credentials of the http.proxy setting in ${agentHostLogPath}`);
				assert.ok(rejectedLogLine.test(log), `Expected the Agent Host to ask a client for credentials after the proxy rejected those of the http.proxy setting in ${agentHostLogPath}`);
				const details = await logins.stop();
				assertProxyLoginDialogs(details, 1);
			} catch (error) {
				logger.log(`Agents Window (local Basic PAC proxy, stale http.proxy credentials) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (local Basic PAC proxy, stale http.proxy credentials)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			} finally {
				await logins.stop();
			}
		});
	});

	(basicPacProxyScheme ? describe : describe.skip)('Agents Window (WSL AgentHost, Basic PAC proxy)', () => {
		const scenario = 'smoke-wsl-basic-pac-proxy-agent-host';
		const reply = 'WSL_BASIC_PAC_PROXY_RESPONSE';
		const newPasswordReply = 'WSL_BASIC_PAC_PROXY_NEW_PASSWORD_RESPONSE';
		const context = setupAgentHostSuite(logger, {
			serverLabel: 'WSL Basic PAC proxy AgentHost',
			mockServerHost: '0.0.0.0',
			remoteTransport: 'wsl',
			wslClientProxy: 'agentHost',
			proxyLoginCredentials: basicPacProxyCredentials,
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(scenario, new ScenarioBuilder().emit(reply).build());
				registerScenario(`${scenario}-new-password`, new ScenarioBuilder().emit(newPasswordReply).build());
			},
			settings: {
				'chat.remoteAgentHostsEnabled': true,
			},
		});

		it('Asks for the credentials of the Windows PAC proxy of a WSL AgentHost', async function () {
			this.timeout(10 * 60 * 1000);
			const app = this.app as Application;
			const fixture = context.remoteFixture;
			assert.ok(fixture, 'Expected the WSL connection fixture');
			const requestTag = `[proxy-request:${randomUUID()}]`;
			const logins = context.proxyLogins;
			assert.ok(logins, 'Expected the suite to fill the proxy login dialogs');
			try {
				await app.workbench.agentsWindow.waitForNewSessionView();
				await app.workbench.agentsWindow.connectWSLHost(fixture.name, fixture.workspacePath ?? app.workspacePathOrFolder, '.git');
				await app.workbench.agentsWindow.selectSessionType('Copilot', { providerLabel: fixture.name });
				const requestsBefore = context.mockServer.getRequests().length;
				const prompt = `hello through the Windows PAC proxy [scenario:${scenario}] ${requestTag}`;
				await app.workbench.agentsWindow.submitNewSessionPrompt(prompt);
				await app.workbench.agentsWindow.waitForActiveSessionView(5 * 60 * 1000);
				await app.workbench.agentsWindow.waitForAssistantText(reply, 2 * 60 * 1000);
				await waitForPromptRequest(context.mockServer, requestsBefore, requestTag);
				assertProxyLoginDialogs(await logins.stop(), 1);
				await fixture.verifyMockServerRouting?.();
				await assertClientNetworkServed(context.logsPath, 'wsl', basicPacProxyScheme === 'https' ? 'HTTPS' : 'PROXY', { basicUsername: basicPacProxyCredentials.username });
				const readAgentHostLog = fixture.readAgentHostLog;
				assert.ok(readAgentHostLog, 'Expected the WSL fixture to read the AgentHost log');
				await assertProxyPasswordChangeAsksAgain(app, context.mockServer, {
					scenario: `${scenario}-new-password`,
					firstPrompt: prompt,
					firstReply: reply,
					reply: newPasswordReply,
					readAgentHostLog,
				});
			} catch (error) {
				logger.log(`Agents Window (WSL Basic PAC proxy) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				if (fixture.dumpConnectionDiagnostics) {
					try {
						await fixture.dumpConnectionDiagnostics(await app.workbench.agentsWindow.getRemoteConnectionDiagnostics());
					} catch (diagnosticError) {
						logger.log(`Agents Window (WSL Basic PAC proxy) connection diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
					}
				}
				await dumpFailureDiagnostics(app, logger, 'Agents Window (WSL Basic PAC proxy)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			} finally {
				await logins.stop();
			}
		});
	});

	describe('Agents Window (local AgentHost, SDK sandbox)', () => {

		// Variant of the AgentHost suite that leaves
		// `chat.agentHost.customTerminalTool.enabled` at its default (false), so
		// the SDK’s built-in shell tool runs commands. The AgentHost forwards
		// `chat.agent.sandbox.*` into the SDK via `session.options.update`
		// (mirroring how the Copilot extension configures the CLI sandbox), so
		// shell commands still run mxc-wrapped.

		const agentHost = setupAgentHostSuite(logger, {
			serverLabel: 'AgentHost SDK sandbox',
			registerScenarios: ({ registerScenario }) => {
				registerScenario(AGENT_HOST_SDK_SANDBOX_SCENARIO_ID, shellEchoScenario(AGENT_HOST_SDK_SANDBOX_REPLY));
			},
			settings: {
				// customTerminalTool intentionally OFF (default) — the SDK runs
				// the shell tool, and the AgentHost is expected to forward
				// `chat.agent.sandbox.*` into the SDK so commands still run
				// sandboxed.
				'chat.agent.sandbox.enabled': 'on',
			},
		});

		it('Test Copilot CLI session via AgentHost (SDK sandbox)', async function () {
			// See the Copilot CLI sandbox test above for the rationale on
			// platform gating and where to find logs when debugging CI runs.
			// The AgentHost-side log we assert on is `<logsPath>/agenthost.log`
			// (the utility-process log), produced by CopilotAgentSession.
			if (process.platform === 'win32') {
				this.skip();
			}

			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			try {
				await warmUpAgentHostModel(app, logger, 'Agents Window (AgentHost SDK sandbox)');

				const requestsBefore = agentHost.mockServer.requestCount();
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_SDK_SANDBOX_SCENARIO_ID}]`);

				// Match the JSON `output` field of the tool result in the final
				// response, not the `echo <reply>` command preview — see
				// shellEchoScenario / shellEchoResponseMatcher.
				const text = await app.workbench.agentsWindow.waitForAssistantText(shellEchoResponseMatcher(AGENT_HOST_SDK_SANDBOX_REPLY), 120_000);
				logger.log(`Agents Window (AgentHost SDK sandbox) response: ${text}`);

				assert.ok(
					agentHost.mockServer.requestCount() > requestsBefore,
					'expected the mock LLM server to have received a new request from the AgentHost SDK sandbox session'
				);

				// Confirm the command ran through the SDK's built-in shell under the
				// sandbox policy we pushed — NOT the AgentHost's own engine. Evidence
				// in `agenthost.log`:
				//   1. `Applied SDK sandboxConfig via session.options.update` — the
				//      AgentHost pushed the mxc policy to the SDK.
				//   2. `Tool started: bash` — the SDK's own shell tool ran the command.
				//   3. NO `[ShellManager]` line — the AgentHost provided no shell tool
				//      (customTerminalTool is off), so the SDK, not our engine, ran it.
				// There is deliberately no `Auto-approving sandboxed shell command`
				// entry on this path. The session enables the runtime's script-safety
				// classifier, which reports this `echo` as read-only, and the runtime
				// resolves a read-only command without ever raising a permission
				// request. The host's auto-approve branch still governs non-read-only
				// sandboxed commands and is asserted by the custom-terminal-tool test
				// above. Poll for the tool run: it lands after 1, and by that point a
				// competing `[ShellManager]` run would have been logged too.
				const agentHostLogPath = path.join(agentHost.logsPath, 'agenthost.log');
				const sdkShellRun = /\[Copilot:[^\]]+\] Tool started: bash/;
				const agentHostLog = await waitForLogContent(() => readFileIfExists(agentHostLogPath), sdkShellRun);
				assert.match(
					agentHostLog,
					/\[Copilot:[^\]]+\] Applied SDK sandboxConfig via session\.options\.update/,
					`expected an "Applied SDK sandboxConfig" entry in ${agentHostLogPath}`
				);
				assert.match(
					agentHostLog,
					sdkShellRun,
					`expected the SDK's own shell tool ("Tool started: bash") to have run the command in ${agentHostLogPath}`
				);
				assert.doesNotMatch(
					agentHostLog,
					/\[ShellManager\] Created \w+ shell /,
					`did not expect the AgentHost's own shell engine ([ShellManager]) to run the command on the SDK sandbox path, in ${agentHostLogPath}`
				);
			} catch (error) {
				logger.log(`Agents Window (AgentHost SDK sandbox) FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window (AgentHost SDK sandbox)', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});

	describe('Agents Window (Codex)', () => {

		const codex = setupAgentHostSuite(logger, {
			serverLabel: 'Codex',
			registerScenarios: ({ ScenarioBuilder, registerScenario }) => {
				registerScenario(CODEX_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_REPLY).build());
				registerScenario(CODEX_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(CODEX_WARMUP_REPLY).build());
			},
			settings: {
				// Register the Codex provider in the agent host process (it is
				// off by default). The provider resolves the codex SDK from the
				// repo's `node_modules` in dev, or `product.agentSdks.codex` in
				// packaged builds (or the VSCODE_AGENT_HOST_CODEX_SDK_ROOT
				// override) — so the test below is a hard requirement in dev and
				// skips only in built products where the SDK is genuinely absent.
				'chat.agentHost.codexAgent.enabled': true,
			},
		});

		it('recovers when the command palette loses focus before finding New Session', async function () {
			const app = this.app as Application;
			await app.workbench.agentsWindow.waitForNewSessionView();
			const inputSelector = `.sessions-shared-chat-input .interactive-input-part .monaco-editor[role="code"] ${app.code.editContextEnabled ? '.native-edit-context' : 'textarea'}`;
			const interruption = await app.code.driver.currentPage.evaluateHandle(selector => {
				const chatInput = document.querySelector<HTMLElement>(selector);
				if (!chatInput) {
					throw new Error('New-session chat input not found');
				}
				let interrupted = false;
				const interruptFocus = (event: Event) => {
					if (event.target instanceof HTMLInputElement && event.target.matches('.quick-input-box input') && event.target.value === '>workbench.action.sessions.newChat') {
						document.removeEventListener('input', interruptFocus);
						chatInput.focus();
						interrupted = true;
					}
				};
				document.addEventListener('input', interruptFocus);
				return {
					get interrupted() { return interrupted; },
					dispose: () => document.removeEventListener('input', interruptFocus),
				};
			}, inputSelector);
			try {
				await app.workbench.agentsWindow.startNewSession();
				assert.strictEqual(await interruption.evaluate(state => state.interrupted), true);
			} finally {
				await interruption.evaluate(state => state.dispose());
				await interruption.dispose();
			}
		});

		it('Test Codex session', async function () {
			this.timeout(5 * 60 * 1000);

			const app = this.app as Application;

			// Resolve Codex availability OUTSIDE the try/catch below so that the
			// Pending thrown by `this.skip()` is not swallowed (and re-thrown as a
			// failure) by the failure-diagnostics handler.
			await app.workbench.agentsWindow.startNewSession();
			const codexAvailable = await app.workbench.agentsWindow.isSessionTypeAvailable('Codex');
			if (!codexAvailable) {
				// Codex must be available — and so this test must run rather than
				// skip — whenever the build under test is supposed to be able to
				// resolve the SDK:
				//   - Running from source (VSCODE_DEV=1, set by the smoke runner
				//     when no `--build` is passed): the agent host is not built, so
				//     it resolves the SDK from the repo's `node_modules`
				//     (`@openai/codex` is a devDependency).
				//   - Publish builds: `product.agentSdks.codex` is stamped (only
				//     when VSCODE_PUBLISH=true, see build/azure-pipelines/common/
				//     agent-sdk-produce.yml) so the SDK is fetched from the CDN.
				// In both cases an unavailable Codex is a regression — fail loudly.
				// Otherwise (built non-publish CI, where the SDK is neither shipped
				// nor stamped) Codex is legitimately absent, so skip gracefully.
				//
				// VSCODE_DEV (not app.quality === Quality.Dev) is the precise
				// "from source" signal: parseQuality() also returns Quality.Dev for
				// a `--build` product when VSCODE_QUALITY is unset, which would
				// wrongly hard-fail a packaged build that legitimately lacks Codex.
				const isFromSource = process.env.VSCODE_DEV === '1';
				const isPublishBuild = (process.env.VSCODE_PUBLISH ?? '').toLowerCase() === 'true';
				if (isFromSource || isPublishBuild) {
					throw new Error(`[Agents Window/Codex] Codex session type unexpectedly unavailable (VSCODE_DEV=${process.env.VSCODE_DEV ?? '<unset>'}, VSCODE_PUBLISH=${process.env.VSCODE_PUBLISH ?? '<unset>'}) — the SDK should be resolvable from node_modules (from source) or product.agentSdks.codex (publish build)`);
				}
				logger.log('[Agents Window/Codex] Codex session type not available in this built product (no product.agentSdks.codex); skipping');
				this.skip();
			}

			// Codex reports as "available" once the `@openai/codex` launcher shim
			// resolves, but the native binary ships as a separate per-platform
			// optional dependency that npm silently skips when its install fails.
			// A stale `node_modules` cache can thus have the shim but no binary, so
			// fail fast here (from source) instead of timing out at spawn time.
			if (process.env.VSCODE_DEV === '1') {
				const repoRoot = path.resolve(process.cwd(), '..', '..');
				// A flat node_modules has the platform package next to `@openai/codex`. pnpm's
				// isolated layout only has it next to the real folder of `@openai/codex`, where
				// the agent host also looks (see resolveCodexBinaryPath).
				const scopeDir = path.join(repoRoot, 'node_modules', '@openai');
				const scopeDirs = [scopeDir];
				try {
					scopeDirs.push(path.dirname(fs.realpathSync(path.join(scopeDir, 'codex'))));
				} catch {
					// `@openai/codex` is missing → only the flat location is checked
				}
				const platformPkgDirs = [...new Set(scopeDirs)].map(dir => path.join(dir, `codex-${process.platform}-${process.arch}`));
				const binaryName = process.platform === 'win32' ? 'codex.exe' : 'codex';
				const codexBinaryFound = platformPkgDirs.some(platformPkgDir => {
					try {
						const vendorDir = path.join(platformPkgDir, 'vendor');
						return fs.readdirSync(vendorDir).some(triple => fs.existsSync(path.join(vendorDir, triple, 'bin', binaryName)));
					} catch {
						// vendor dir (or the whole platform package) is missing → treated as not found
						return false;
					}
				});
				if (!codexBinaryFound) {
					throw new Error(`[Agents Window/Codex] Codex native binary missing at ${platformPkgDirs.join(' and ')}. We depend on \`@openai/codex\`, which is only a thin launcher shim; the actual native binaries ship as its per-platform optional dependencies (\`@openai/codex-<platform>-<arch>\`). \`npm install\` does not fail when an optional dependency can't be installed, so node_modules can end up with the shim but no binary — Codex then reports as "available" but has nothing to spawn. Try bumping build/.cachesalt to force a fresh \`npm ci\` that reinstalls the binary.`);
				}
			}

			try {
				// Pre-pay the Codex session cold-start cost: the first Codex session
				// in a fresh agent host has to spawn the native codex app-server and
				// resolve its model list before the first /responses request can
				// complete. A throwaway prompt absorbs that so the real assertion
				// runs against a warm pipeline.
				await warmUpCodexModel(app, logger, 'Agents Window/Codex');

				const requestsBefore = codex.mockServer.requestCount();
				logger.log(`[Agents Window/Codex] submitting prompt; requestCount=${requestsBefore}`);
				await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_SCENARIO_ID}]`);

				const text = await app.workbench.agentsWindow.waitForAssistantText(CODEX_REPLY);
				logger.log(`[Agents Window/Codex] response (length=${text.length}): ${text}`);

				assert.ok(
					codex.mockServer.requestCount() > requestsBefore,
					`expected the mock LLM server to have received a new request from the Codex session (before=${requestsBefore}, after=${codex.mockServer.requestCount()})`
				);

				// Confirm the request flowed through the AgentHost process (the codex
				// harness) and not a renderer-side fallback by checking for a
				// `chat/turnStarted` frame in the AHP JSONL transcript. The transcript
				// is written through an async queue, so poll briefly.
				const ahpLogDir = path.join(codex.logsPath, 'ahp');
				const ahpFrames = await waitForLogContent(() => readAhpFrames(ahpLogDir), '"type":"chat/turnStarted"');
				assert.ok(
					ahpFrames.includes('"type":"chat/turnStarted"'),
					`expected the AgentHost process to have received a chat/turnStarted dispatchAction (checked ${ahpJsonlFiles(ahpLogDir).length} jsonl files under ${ahpLogDir}); if missing, the renderer-side extension likely served the reply instead`
				);
			} catch (error) {
				logger.log(`[Agents Window/Codex] FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
				await dumpFailureDiagnostics(app, logger, 'Agents Window/Codex', { sendButtonSelector: AGENTS_SEND_BUTTON_SELECTOR });
				throw error;
			}
		});
	});
}

/**
 * Primes a freshly-spawned AgentHost process's CLI model list to avoid the
 * cold-start "No model available" race (github/copilot-agent-runtime#9876):
 * the very first query in the process lifetime can reach the CLI before its
 * model list has resolved, surfacing as a `session/error`. A throwaway
 * session resolves it because the model list is cached by then.
 *
 * Assumes the Agents Window is showing a new-session view. Sends a throwaway
 * prompt, ignores its outcome, then leaves a fresh new-session view with
 * Agent Host Copilot selected so the caller can submit the real prompt
 * against an already-warmed model list.
 */
async function warmUpAgentHostModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Copilot');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${AGENT_HOST_WARMUP_SCENARIO_ID}]`);
	try {
		await app.workbench.agentsWindow.waitForAssistantText(AGENT_HOST_WARMUP_REPLY, 30_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the caller's
		// real attempt runs against an already-warmed model list.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Copilot');
}


/**
 * Pre-pays the Codex session cold-start cost: the first Codex session in a
 * fresh agent host has to spawn the native `codex app-server` binary and
 * resolve its model list before the first `/responses` request can complete.
 *
 * Assumes the Agents Window is showing a new-session view AND that the 'Codex'
 * session type is available (callers gate on
 * {@link AgentsWindow.isSessionTypeAvailable} first). Sends a throwaway prompt
 * to a 'Codex' session, ignores its outcome (the warm-up itself may hit the
 * cold start), then leaves a fresh new-session view with 'Codex' selected so
 * the caller can submit the real prompt against a warm pipeline.
 */
async function warmUpCodexModel(app: Application, logger: Logger, label: string): Promise<void> {
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
	await app.workbench.agentsWindow.submitNewSessionPrompt(`hello world [scenario:${CODEX_WARMUP_SCENARIO_ID}]`);
	try {
		await app.workbench.agentsWindow.waitForAssistantText(CODEX_WARMUP_REPLY, 60_000);
	} catch (error) {
		// Ignore — the warm-up itself may hit the cold-start race; the caller's
		// real attempt runs against an already-warmed pipeline.
		logger.log(`${label} warm-up attempt did not produce the expected reply (likely the cold-start race); proceeding with the real attempt. Reason: ${error instanceof Error ? error.message : String(error)}`);
	}
	await app.workbench.agentsWindow.startNewSession();
	await app.workbench.agentsWindow.waitForNewSessionView();
	await app.workbench.agentsWindow.selectSessionType('Codex');
}

/**
 * Accessors for the per-suite state owned by {@link setupAgentHostSuite}.
 * Implemented with getters so tests read the values populated by the
 * `before` hooks (which run after the suite body registers the tests).
 */
interface IAgentHostSuiteContext {
	readonly mockServer: MockLlmServer;
	readonly logsPath: string;
	readonly remoteFixture?: IRemoteDevContainerFixture;
	/** Fills the proxy login dialogs from the start of the app, when the suite passes `proxyLoginCredentials`. */
	readonly proxyLogins?: { stop(): Promise<string[]> };
}

/**
 * Installs the shared `before`/`after` hooks for a "local AgentHost" smoke
 * suite: starts the mock LLM server, creates the app with the AgentHost env
 * vars, pre-seeds `settings.json` into both the default and Agents profiles,
 * and opens the workspace folder in the Agents Window. A remote fixture with a
 * `remoteAuthority` opens its workspace in a remote editor window instead.
 *
 * The only per-suite differences are the registered scenarios and the
 * sandbox-related settings overlay, so those are passed in.
 */
function setupAgentHostSuite(logger: Logger, config: {
	readonly serverLabel: string;
	readonly mockServerHost?: string;
	readonly registerScenarios: (api: { ScenarioBuilder: any; registerScenario: (id: string, scenario: unknown) => void }) => void;
	readonly settings: Record<string, unknown>;
	readonly remoteTransport?: RemoteDevContainerTransport;
	readonly wslClientProxy?: 'agentHost' | 'server';
	readonly prepareWorkspace?: (workspacePath: string, options: ApplicationOptions) => Promise<void> | void;
	readonly cleanupWorkspace?: (workspacePath: string) => Promise<void> | void;
	/**
	 * Credentials to fill the proxy login dialogs with from the start of the app: requests of the app itself can open
	 * one before the first window is ready, which keyboard input to it would otherwise cancel.
	 */
	readonly proxyLoginCredentials?: { readonly username: string; readonly password: string };
}): IAgentHostSuiteContext {
	let mockServer: MockLlmServer;
	let logsPath: string;
	let proxyLogins: ReturnType<Application['workbench']['agentsWindow']['fillProxyAuthenticationDialogs']> | undefined;
	let workspacePath: string | undefined;
	let remoteFixture: IRemoteDevContainerFixture | undefined;
	let remoteFixtureSetup: Promise<IRemoteDevContainerFixture> | undefined;
	let fixtureDataPath: string | undefined;
	let tearingDown = false;

	before(async function () {
		const { startServer, ScenarioBuilder, registerScenario } = require(getMockLlmServerPath());

		registerScenario('text-only', new ScenarioBuilder().emit('OK').build());
		registerScenario(AGENT_HOST_WARMUP_SCENARIO_ID, new ScenarioBuilder().emit(AGENT_HOST_WARMUP_REPLY).build());
		config.registerScenarios({ ScenarioBuilder, registerScenario });

		mockServer = await startServer(0, {
			...mockServerStartOptions((msg: string) => logger.log(msg), !!process.env.VSCODE_SMOKE_TEST_PROXY_HEADER),
			host: config.mockServerHost,
		});
		logger.log(`Mock LLM server (${config.serverLabel}) started at ${getMockLlmServerUrl(mockServer)}`);
	});

	installDiagnosticsHandler(logger);

	before(async function () {
		if (config.remoteTransport) {
			this.timeout(5 * 60 * 1000);
		}
		const suiteName = this.test?.parent?.title ?? 'unknown';
		const defaultOptions: ApplicationOptions = {
			...this.defaultOptions,
			logsPath: suiteLogsPath(this.defaultOptions, suiteName),
			crashesPath: suiteCrashPath(this.defaultOptions, suiteName),
		};
		logsPath = defaultOptions.logsPath;
		workspacePath = defaultOptions.workspacePath;
		assert.ok(workspacePath, 'Expected an Agents Window smoke workspace');
		await config.prepareWorkspace?.(workspacePath, defaultOptions);
		if (config.remoteTransport) {
			assert.ok(defaultOptions.userDataDir, 'Expected an isolated smoke user-data directory');
			fixtureDataPath = fs.mkdtempSync(path.join(path.dirname(defaultOptions.userDataDir), 'remote-devcontainer-'));
			remoteFixtureSetup = createRemoteDevContainerFixture({
				transport: config.remoteTransport,
				workspacePath,
				testDataPath: fixtureDataPath,
				logsPath,
				mockServerUrl: getMockLlmServerUrl(mockServer),
				appOptions: defaultOptions,
				wslClientProxy: config.wslClientProxy,
			}, logger);
			remoteFixture = await remoteFixtureSetup;
			if (tearingDown) {
				return;
			}
		}
		let remoteWindowOptions: Partial<ApplicationOptions> = {};
		if (remoteFixture?.remoteAuthority && fixtureDataPath) {
			// A remote editor window opens the fixture's workspace instead of the Agents Window. Earlier windows registered
			// the shared extensions directory's contents, so the test resolver a packaged build copies into it at launch
			// would be dropped; a fresh directory with the smoke test extension registers it.
			const extensionsPath = path.join(fixtureDataPath, 'extensions');
			fs.cpSync(path.join(__dirname, '..', '..', '..', 'extensions', 'vscode-smoketest-ext-host'), path.join(extensionsPath, 'vscode-smoketest-ext-host'), { recursive: true });
			remoteWindowOptions = { remote: true, remoteAuthority: remoteFixture.remoteAuthority, workspacePath: remoteFixture.workspacePath, extensionsPath };
		}
		this.app = createApp(defaultOptions, opts => ({
			...opts,
			...remoteWindowOptions,
			sourceAppRoot: remoteFixture?.sourceAppRoot ?? opts.sourceAppRoot,
			extraArgs: [...(opts.extraArgs ?? []), ...(remoteFixture?.extraArgs ?? [])],
			extraEnv: {
				...(opts.extraEnv ?? {}),
				...getCopilotSmokeTestEnv(mockServer, { userDataDir: opts.userDataDir }),
				COPILOT_API_URL: getMockLlmServerUrl(mockServer),
				COPILOT_DEBUG_GITHUB_API_URL: getMockLlmServerUrl(mockServer),
				GITHUB_COPILOT_API_TOKEN: 'smoketest-fake-agent-host-token',
				// Route the agent host's shared CAPI client (used by the Codex /
				// agent-host harnesses for model discovery + requests) at the mock
				// instead of api.github.com, which would 401 with the fake token.
				VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE: getMockLlmServerUrl(mockServer),
				VSCODE_SMOKE_TEST_TUNNEL_TOKEN: undefined,
				...remoteFixture?.extraEnv,
			},
		}));

		// Pre-seed settings.json on disk into BOTH the default profile and the
		// Agents profile so Agent Host startup observes the test configuration.
		const userDataDir = (this.app as Application).userDataPath;
		if (userDataDir) {
			const settings = JSON.stringify({
				'github.copilot.advanced.debug.overrideProxyUrl': getMockLlmServerUrl(mockServer),
				// AgentHost's fetch patch honors PAC/system proxy resolution only
				// when proxy support is enabled. The smoke profile is pre-seeded from
				// scratch, so set the production default explicitly rather than
				// relying on configuration registration timing.
				'http.proxySupport': 'override',
				// A proxy with credentials, which the Agent Host answers the Copilot runtime's Basic challenges with.
				...(process.env.VSCODE_SMOKE_TEST_HTTP_PROXY ? {
					'http.proxy': process.env.VSCODE_SMOKE_TEST_HTTP_PROXY,
				} : {}),
				...(process.env.VSCODE_SMOKE_TEST_PROXY_HEADER ? {
					'sessions.useWorktree': false,
				} : {}),
				'chat.allowAnonymousAccess': true,
				'github.copilot.chat.githubMcpServer.enabled': false,
				// The extension-host Copilot CLI provider is being retired; run as after its removal.
				'github.copilot.chat.cli.legacyProvider.enabled': false,
				'chat.agentHost.ahpJsonlLoggingEnabled': true,
				'chat.agentHost.unsafeTestToken': 'smoketest-fake-agent-host-token',
				// Verbose Copilot runtime logging for capturable failure diagnostics.
				'chat.agentHost.copilotSdk.logLevel': 'trace',
				// These suites exercise Agent Host and sandbox behavior, not Auto routing.
				'chat.defaultModel': AGENT_HOST_MODEL,
				...config.settings,
				...remoteFixture?.settings,
			}, null, 2);
			for (const settingsPath of [
				path.join(userDataDir, 'User', 'settings.json'),
				path.join(userDataDir, 'User', 'profiles', 'builtin', 'agents', 'settings.json'),
			]) {
				fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
				fs.writeFileSync(settingsPath, settings);
			}
			if (remoteFixture?.remoteAuthority) {
				await preseedChatExtensionEnablement(userDataDir);
			}
		}

		await (this.app as Application).start();
		if (config.proxyLoginCredentials) {
			proxyLogins = (this.app as Application).workbench.agentsWindow.fillProxyAuthenticationDialogs(config.proxyLoginCredentials.username, config.proxyLoginCredentials.password);
		}
	});

	after(async function () {
		await proxyLogins?.stop();
	});

	installAppAfterHandler(undefined, async () => {
		tearingDown = true;
		try {
			if (remoteFixtureSetup && !remoteFixture) {
				await remoteFixtureSetup.then(
					fixture => { remoteFixture = fixture; },
					error => logger.log(`Remote fixture setup failed during teardown: ${error instanceof Error ? error.message : String(error)}`),
				);
			}
			await remoteFixture?.dispose();
		} finally {
			try {
				if (workspacePath) {
					await config.cleanupWorkspace?.(workspacePath);
				}
			} finally {
				if (fixtureDataPath) {
					fs.rmSync(fixtureDataPath, { recursive: true, force: true });
				}
			}
		}
	});

	before(async function () {
		if (remoteFixture?.remoteAuthority) {
			return;
		}
		const app = this.app as Application;
		cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });
		await proxyLogins?.whenIdle();
		const windowsBefore = app.code.driver.getAllWindows().length;
		await app.workbench.agentsWindow.openCurrentFolderInAgentsWindow();
		await app.workbench.agentsWindow.switchToAgentsWindow(windowsBefore);
	});

	after(async function () {
		if (mockServer) {
			await mockServer.close();
		}
	});

	return {
		get mockServer() { return mockServer; },
		get logsPath() { return logsPath; },
		get remoteFixture() { return remoteFixture; },
		get proxyLogins() { return proxyLogins; },
	};
}

/**
 * Registers the test of an editor window connected to a VS Code server in WSL, whose Agent Host reaches the mock server
 * only through the Windows client's proxy, authenticated with `auth`. With `Basic`, the credentials come from the
 * http.proxy setting, which the Agent Host answers the Copilot runtime's Basic challenges with.
 */
function setupWslRemoteEditorProxySuite(logger: Logger, auth: 'Kerberos' | 'Basic', title: string): void {
	const scenario = `smoke-wsl-remote-${auth.toLowerCase()}-proxy-agent-host`;
	const reply = `WSL_REMOTE_${auth.toUpperCase()}_PROXY_RESPONSE`;
	const label = `Editor Window (WSL remote ${auth} proxy)`;
	const context = setupAgentHostSuite(logger, {
		serverLabel: `WSL remote ${auth} proxy AgentHost`,
		mockServerHost: '0.0.0.0',
		remoteTransport: 'wsl',
		wslClientProxy: 'server',
		registerScenarios: ({ ScenarioBuilder, registerScenario }) => registerScenario(scenario, new ScenarioBuilder().emit(reply).build()),
		settings: {},
	});

	it(title, async function () {
		this.timeout(10 * 60 * 1000);
		const app = this.app as Application;
		const fixture = context.remoteFixture;
		assert.ok(fixture, 'Expected the WSL server fixture');
		const requestTag = `[proxy-request:${randomUUID()}]`;
		try {
			await openAgentHostChatEditor(app, 3 * 60 * 1000);
			const requestsBefore = context.mockServer.getRequests().length;
			await app.workbench.chat.sendEditorMessage(`hello through the ${auth} proxy [scenario:${scenario}] ${requestTag}`);
			await app.workbench.chat.waitForEditorResponseText(reply, 2 * 60 * 1000);
			await waitForPromptRequest(context.mockServer, requestsBefore, requestTag);
			await fixture.verifyMockServerRouting?.({ credentialedProxy: auth === 'Basic' });
		} catch (error) {
			logger.log(`${label} FAILURE: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
			try {
				await fixture.dumpConnectionDiagnostics?.('remote editor window');
			} catch (diagnosticError) {
				logger.log(`${label} connection diagnostics failed: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`);
			}
			await dumpFailureDiagnostics(app, logger, label);
			throw error;
		}
	});
}

/**
 * Opens an Agent Host Copilot session in a chat editor. The open command gives up when the agent host, which a remote
 * window starts on first connection, does not register its Copilot agent within 30 seconds, so retry until `timeoutMs`.
 */
async function openAgentHostChatEditor(app: Application, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (; ;) {
		await app.workbench.quickaccess.runCommand('smoketest.openAgentHostChat');
		try {
			await app.workbench.chat.waitForChatEditor(450);
			return;
		} catch (error) {
			if (Date.now() >= deadline) {
				throw error;
			}
		}
	}
}

async function waitForPromptRequest(mockServer: MockLlmServer, requestsBefore: number, requestTag: string): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (mockServer.getRequests().slice(requestsBefore).some(request =>
			request.path === '/responses' &&
			request.method === 'POST' &&
			latestUserInputCarriesTag(request.body, requestTag))) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for the Copilot model request with ${requestTag}`);
}

/**
 * Changes the password of the Basic PAC proxy, then sends a follow-up prompt to the session of `firstPrompt`, logging in
 * to the proxy login dialogs with the new password. The Copilot runtime still has the old password, so the proxy rejects
 * it and the runtime asks the Agent Host for credentials again with `previousRejected`, for which the client asks for
 * new credentials instead of returning the ones it remembers. Restores the password afterwards.
 */
async function assertProxyPasswordChangeAsksAgain(app: Application, mockServer: MockLlmServer, options: {
	readonly scenario: string;
	readonly firstPrompt: string;
	readonly firstReply: string;
	readonly reply: string;
	readonly readAgentHostLog: () => string | Promise<string>;
}): Promise<void> {
	const { VSCODE_SMOKE_TEST_WSL_DISTRO: distro, VSCODE_SMOKE_TEST_PROXY_USER: username, VSCODE_SMOKE_TEST_PROXY_PASSWORD: password, VSCODE_SMOKE_TEST_PROXY_NEW_PASSWORD: newPassword, VSCODE_SMOKE_TEST_PROXY_HTPASSWD: passwordFile } = process.env;
	assert.ok(distro && username && password && newPassword && passwordFile, 'Expected the proxy credentials and password file from run-agents-window-wsl-kerberos-proxy.ps1');
	const setProxyPassword = async (value: string) => {
		cp.execFileSync(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wsl.exe'), ['--distribution', distro, '--exec', 'bash', '-c', 'echo "$1:$(openssl passwd -1 "$2")" > "$3"', 'bash', username, value, passwordFile], { stdio: 'pipe', windowsHide: true, timeout: 60_000 });
		// Squid's password helper reloads the file when its modification time in seconds changes, and Squid checks the
		// credentials it cached again after a second.
		await new Promise(resolve => setTimeout(resolve, 1_500));
	};
	const rejectedLogLine = /\[Copilot\] The Copilot runtime asks for Basic credentials for the proxy \S+, after the proxy rejected earlier ones/g;
	const rejectedCount = (log: string) => log.match(rejectedLogLine)?.length ?? 0;
	const rejectedBefore = rejectedCount(await options.readAgentHostLog());

	await setProxyPassword(newPassword);
	const logins = app.workbench.agentsWindow.fillProxyAuthenticationDialogs(username, newPassword);
	try {
		// The session title falls back to the first prompt shortened to about 40 characters, so match its text before the tags.
		const rowMatch = [options.firstPrompt.split(' [')[0], options.firstReply];
		await app.workbench.agentsWindow.activateSessionByLabel(rowMatch, options.firstReply, 60_000);
		const requestTag = `[proxy-request:${randomUUID()}]`;
		const requestsBefore = mockServer.getRequests().length;
		// The Copilot runtime keeps its connection through the proxy open, so close it to make the runtime connect again.
		mockServer.closeConnections();
		await app.workbench.agentsWindow.sendFollowUpMessage(`hello again through the PAC proxy [scenario:${options.scenario}] ${requestTag}`, 600, options.firstReply, rowMatch);
		await app.workbench.agentsWindow.waitForAssistantText(options.reply, 2 * 60 * 1000);
		await waitForPromptRequest(mockServer, requestsBefore, requestTag);
		const log = await waitForLogContent(options.readAgentHostLog, log => rejectedCount(log) > rejectedBefore, 30_000);
		assert.ok(rejectedCount(log) > rejectedBefore, 'Expected the Copilot runtime to ask the Agent Host for credentials again after the proxy rejected the old password');
		const details = await logins.stop();
		assertProxyLoginDialogs(details, 1);
	} finally {
		await logins.stop();
		await setProxyPassword(password);
	}
}

/**
 * Asserts that `details`, those of the proxy login dialogs filled, are of exactly `count` login dialogs for the proxy:
 * clients share the credentials entered in one, and the main process shows one at a time.
 */
function assertProxyLoginDialogs(details: readonly string[], count: number): void {
	assert.deepStrictEqual(details.map(detail => detail.replace(/^The proxy localhost:\d+ /, 'The proxy localhost:<port> ')), Array.from({ length: count }, () => 'The proxy localhost:<port> requires a username and password.'));
}

async function assertRemoteDevContainerRouting(logsPath: string, transport: RemoteDevContainerTransport, workspacePath: string, reply: string): Promise<void> {
	interface IFrame {
		readonly _ahpLog?: { readonly transport?: string };
		readonly method?: string;
		readonly params?: { readonly workspaceFolder?: string; readonly action?: { readonly type?: string } };
	}
	const parseFrames = (content: string): IFrame[] => content.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
	const content = await waitForLogContent(
		() => readAhpFrames(path.join(logsPath, 'ahp')),
		content => parseFrames(content).some(frame => frame._ahpLog?.transport === 'devcontainer' && JSON.stringify(frame).includes(reply)),
		30_000,
	);
	const frames = parseFrames(content);
	assert.ok(frames.some(frame =>
		frame._ahpLog?.transport === transport
		&& frame.method === 'vscode/devContainers/connect'
		&& frame.params?.workspaceFolder === workspacePath
	), `Expected container startup for the selected workspace on the ${transport} connection`);
	const containerFrames = frames.filter(frame => frame._ahpLog?.transport === 'devcontainer');
	assert.ok(containerFrames.some(frame => frame.method === 'dispatchAction' && frame.params?.action?.type === 'chat/turnStarted'), 'Expected a turn sent through the nested Dev Container transport');
	assert.ok(containerFrames.some(frame => JSON.stringify(frame).includes(reply)), 'Expected the mock response on the nested Dev Container transport');
}

/**
 * Asserts that the client answered the Agent Host's proxy, authentication and certificate requests on `transport`,
 * resolving the proxy to a PAC entry of `proxyType`, and returning a Kerberos token or the Basic credentials of
 * `basicUsername`. The AHP transcript redacts Kerberos tokens, passwords and certificates, so a redacted value shows
 * that the client returned one.
 */
async function assertClientNetworkServed(logsPath: string, transport: RemoteDevContainerTransport, proxyType: 'PROXY' | 'HTTPS', auth: 'Kerberos' | { readonly basicUsername: string }): Promise<void> {
	interface IFrame {
		readonly _ahpLog?: { readonly transport?: string; readonly dir?: string };
		readonly id?: number | string;
		readonly method?: string;
		readonly result?: { readonly proxy?: string; readonly authorization?: string; readonly username?: string; readonly password?: string; readonly certificates?: unknown };
	}
	const parseFrames = (content: string): IFrame[] => content.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
	const results = (frames: IFrame[], method: string) => {
		const requestIds = new Set(frames.filter(frame => frame._ahpLog?.transport === transport && frame._ahpLog.dir === 's2c' && frame.method === method).map(frame => frame.id));
		return frames.filter(frame => frame._ahpLog?.transport === transport && frame._ahpLog.dir === 'c2s' && requestIds.has(frame.id) && frame.result).map(frame => frame.result!);
	};
	const checks = {
		proxy: (frames: IFrame[]) => results(frames, 'vscode/resolveProxy').some(result => result.proxy?.startsWith(`${proxyType} localhost:`)),
		auth: auth === 'Kerberos'
			? (frames: IFrame[]) => results(frames, 'vscode/lookupProxyKerberosAuthorization').some(result => result.authorization === '<redacted>')
			: (frames: IFrame[]) => results(frames, 'vscode/lookupProxyBasicAuthorization').some(result => result.username === auth.basicUsername && result.password === '<redacted>'),
		certificates: (frames: IFrame[]) => results(frames, 'vscode/loadCertificates').some(result => result.certificates === '<redacted>'),
	};
	const frames = parseFrames(await waitForLogContent(
		() => readAhpFrames(path.join(logsPath, 'ahp')),
		content => Object.values(checks).every(check => check(parseFrames(content))),
		30_000,
	));
	assert.deepStrictEqual(
		Object.fromEntries(Object.entries(checks).map(([name, check]) => [name, check(frames)])),
		{ proxy: true, auth: true, certificates: true },
		`Expected the client to resolve the ${proxyType} proxy, return ${auth === 'Kerberos' ? 'a Kerberos token' : 'Basic credentials'} and return certificates for the ${transport} Agent Host`,
	);
}

/**
 * Polls `readContent` until it returns a string matching `matcher` or the
 * timeout elapses, then returns the last content read. Log files in these
 * suites are written through async queues (e.g. AhpJsonlLogger), so an entry
 * may not be on disk yet even after the assistant reply has rendered.
 */
async function waitForLogContent(readContent: () => string | Promise<string>, matcher: RegExp | string | ((content: string) => boolean), timeoutMs = 5_000): Promise<string> {
	const matches = (content: string) => typeof matcher === 'function' ? matcher(content) : typeof matcher === 'string' ? content.includes(matcher) : matcher.test(content);
	const deadline = Date.now() + timeoutMs;
	let content = await readContent();
	while (!matches(content) && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 100));
		content = await readContent();
	}
	return content;
}

/** Reads a file, returning '' if it does not exist yet. */
function readFileIfExists(filePath: string): string {
	return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

/** Lists the `.jsonl` transcript files in an AHP log directory. */
function ahpJsonlFiles(ahpLogDir: string): string[] {
	return fs.existsSync(ahpLogDir) ? fs.readdirSync(ahpLogDir).filter(f => f.endsWith('.jsonl')) : [];
}

/** Concatenates every AHP JSONL transcript in `ahpLogDir` into one string. */
function readAhpFrames(ahpLogDir: string): string {
	return ahpJsonlFiles(ahpLogDir).map(f => fs.readFileSync(path.join(ahpLogDir, f), 'utf8')).join('\n');
}

function readRendererLogs(logsPath: string): string {
	return fs.existsSync(logsPath)
		? fs.readdirSync(logsPath, { withFileTypes: true })
			.filter(entry => entry.isDirectory() && /^window\d+$/.test(entry.name))
			.map(entry => readFileIfExists(path.join(logsPath, entry.name, 'renderer.log')))
			.join('\n')
		: '';
}
