/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { IChannel } from '../../../../../../base/parts/ipc/common/ipc.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDevContainerAgentHostMainService } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IOutputChannel, IOutputService } from '../../../../../../workbench/services/output/common/output.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { WorkspaceHistoryLoadState } from '../../../../../common/workspaceSelection.js';
import { ISessionFolder, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { DevContainerAgentHostConnector, ensureDevContainerAgentHostsEnabled, getDevContainerEnvironment, isDevContainerWorkspaceAvailable, reportDevContainerEnvironment } from '../../electron-browser/devContainerAgentHostConnector.contribution.js';

suite('Dev Container Agent Host Connector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	// Capture these before configuration registry tests clear global registrations.
	const devContainerAgentHostEnabledProperty = configurationRegistry.getConfigurationProperties()[DevContainerAgentHostEnabledSettingId];
	const devContainerWorktreeEnabledProperty = configurationRegistry.getExcludedConfigurationProperties()[DevContainerWorktreeEnabledSettingId];

	test('requires Docker and a default Dev Container configuration', async () => {
		const workspaceUri = URI.file('/workspace');
		const check = (existingPaths: readonly string[], dockerAvailable: boolean, devContainerAgentHostsEnabled = true, remoteAgentHostsEnabled = true, uri = workspaceUri) => {
			const fileService = new class extends mock<IFileService>() {
				override async exists(resource: URI): Promise<boolean> {
					return existingPaths.includes(resource.path);
				}
			}();
			const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
				override async isDockerAvailable(): Promise<boolean> {
					return dockerAvailable;
				}
			}();
			const configurationService = new TestConfigurationService({
				[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
				[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
			});
			return isDevContainerWorkspaceAvailable(uri, fileService, mainService, configurationService);
		};

		assert.deepStrictEqual({
			nestedConfig: await check(['/workspace/.devcontainer/devcontainer.json'], true),
			rootConfig: await check(['/workspace/.devcontainer.json'], true),
			noDocker: await check(['/workspace/.devcontainer/devcontainer.json'], false),
			noConfig: await check([], true),
			devContainerAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, false),
			remoteAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, false),
			nonFileWorkspace: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, true, URI.parse('vscode-remote://host/workspace')),
		}, {
			nestedConfig: true,
			rootConfig: true,
			noDocker: false,
			noConfig: false,
			devContainerAgentHostsDisabled: false,
			remoteAgentHostsDisabled: false,
			nonFileWorkspace: false,
		});
	});

	test('reports Docker independently from the Dev Container folder count', async () => {
		const existingPaths = new Set([
			'/first/.devcontainer/devcontainer.json',
			'/third/.devcontainer.json',
		]);
		const fileService = new class extends mock<IFileService>() {
			override async exists(resource: URI): Promise<boolean> {
				return existingPaths.has(resource.path);
			}
		}();
		const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
			override async isDockerAvailable(): Promise<boolean> {
				return false;
			}
		}();

		assert.deepStrictEqual(
			await getDevContainerEnvironment(
				[URI.file('/first'), URI.file('/second'), URI.file('/third')],
				fileService,
				mainService,
			),
			{
				dockerAvailable: false,
				devContainerFolderCount: 2,
			},
		);
	});

	test('reports the disabled setting after resolving unique recent local folders', async () => {
		const historyLoadState = observableValue<WorkspaceHistoryLoadState>({}, 'loading');
		const folder = (root: URI) => new class extends mock<ISessionFolder>() {
			override readonly root = root;
		}();
		const workspace = (root: URI) => new class extends mock<ISessionWorkspace>() {
			override readonly folders = [folder(root)];
		}();
		const recentWorkspace = (workspace: ISessionWorkspace): IRecentWorkspace => ({
			workspace,
			providerId: 'local-agent-host',
			checked: false,
			source: 'vscode',
		});
		const recentWorkspacesService = new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly historyLoadState = historyLoadState;
			override getRecentWorkspaces(): IRecentWorkspace[] {
				return [
					recentWorkspace(workspace(URI.file('/first'))),
					recentWorkspace(workspace(URI.file('/second'))),
					recentWorkspace(workspace(URI.file('/first'))),
					recentWorkspace(workspace(URI.parse('vscode-remote://host/remote'))),
				];
			}
		}();
		const environmentInputs: string[][] = [];
		const events: Array<{ eventName: string; data: ITelemetryData | undefined }> = [];
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				events.push({ eventName, data });
			}
		}();
		const report = reportDevContainerEnvironment(
			recentWorkspacesService,
			async workspaceUris => {
				environmentInputs.push(workspaceUris.map(uri => uri.path));
				return { dockerAvailable: true, devContainerFolderCount: 1 };
			},
			new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: false }),
			telemetryService,
		);
		await Promise.resolve();
		const beforeHistoryLoaded = { environmentInputs: [...environmentInputs], events: [...events] };

		historyLoadState.set('loaded', undefined);
		await report;

		assert.deepStrictEqual({
			beforeHistoryLoaded,
			environmentInputs,
			events,
		}, {
			beforeHistoryLoaded: { environmentInputs: [], events: [] },
			environmentInputs: [['/first', '/second']],
			events: [{
				eventName: 'vscodeAgents.devContainer/environment',
				data: { dockerAvailable: true, devContainerFolderCount: 1, devContainerEnabled: false },
			}],
		});
	});

	test('does not inspect recent workspaces when usage telemetry is disabled', async () => {
		const calls: string[] = [];
		const recentWorkspacesService = new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly historyLoadState = observableValue<WorkspaceHistoryLoadState>({}, 'loading');
			override getRecentWorkspaces(): IRecentWorkspace[] {
				calls.push('getRecentWorkspaces');
				return [];
			}
		}();
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.ERROR;
			override publicLog2(): void {
				calls.push('publicLog2');
			}
		}();

		await reportDevContainerEnvironment(
			recentWorkspacesService,
			async () => {
				calls.push('getEnvironment');
				return { dockerAvailable: true, devContainerFolderCount: 0 };
			},
			new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: false }),
			telemetryService,
		);

		assert.deepStrictEqual(calls, []);
	});

	test('registers a disabled-by-default user setting', () => {
		assert.deepStrictEqual({
			default: devContainerAgentHostEnabledProperty.default,
			scope: devContainerAgentHostEnabledProperty.scope,
			tags: devContainerAgentHostEnabledProperty.tags,
			experiment: devContainerAgentHostEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('registers a hidden experimental setting for combining Dev Containers and worktrees', () => {
		assert.deepStrictEqual({
			default: devContainerWorktreeEnabledProperty.default,
			scope: devContainerWorktreeEnabledProperty.scope,
			tags: devContainerWorktreeEnabledProperty.tags,
			experiment: devContainerWorktreeEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('rejects connections when Dev Container or remote Agent Hosts are disabled', () => {
		const configurationService = (devContainerAgentHostsEnabled: boolean, remoteAgentHostsEnabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
			[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
		});

		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(false, true)), /Dev Container Agent Host connections are not enabled/);
		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(true, false)), /Remote Agent Host connections are not enabled/);
	});

	async function connectWithFailure(error: Error, token: CancellationToken, onConnect?: () => void): Promise<string[]> {
		const calls: string[] = [];
		const channel = new class extends mock<IChannel>() {
			override call<T>(command: string): Promise<T> {
				calls.push(command);
				if (command === 'connect') {
					onConnect?.();
					return Promise.reject(error);
				}
				return Promise.resolve(undefined as T);
			}

			override listen<T>(): Event<T> {
				return Event.None;
			}
		}();
		const sharedProcessService = new class extends mock<ISharedProcessService>() {
			override getChannel(): IChannel {
				return channel;
			}
		}();
		const outputService = new class extends mock<IOutputService>() {
			override getChannel(id: string): IOutputChannel {
				calls.push(`get:${id}`);
				return new class extends mock<IOutputChannel>() {
					override append(): void { }
				}();
			}

			override async showChannel(id: string, preserveFocus?: boolean): Promise<void> {
				calls.push(`show:${id}:${preserveFocus}`);
			}
		}();
		const connector = new DevContainerAgentHostConnector(
			sharedProcessService,
			new TestInstantiationService(),
			new class extends mock<ILogService>() { }(),
			new TestConfigurationService({
				[DevContainerAgentHostEnabledSettingId]: true,
				[RemoteAgentHostsEnabledSettingId]: true,
			}),
			new class extends mock<IEnvironmentService>() { }(),
			outputService,
			new class extends mock<IFileService>() { }(),
		);

		await assert.rejects(
			connector.createConnection(URI.file('/workspace'), 'devcontainer:test', token),
			error,
		);
		return calls.map(call => call.replace(/devContainer\.[^:]+/, 'devContainer.<workspace>'));
	}

	test('reveals the Dev Container output channel when setup fails', async () => {
		const setupError = new Error('Dev Container setup failed');

		assert.deepStrictEqual(await connectWithFailure(setupError, CancellationToken.None), [
			'get:devContainer.<workspace>',
			'connect',
			'show:devContainer.<workspace>:true',
			'disconnect',
		]);
	});

	test('does not reveal the Dev Container output channel when setup is canceled', async () => {
		const canceledError = new Error('Canceled');
		canceledError.name = 'Canceled';
		const tokenSource = new CancellationTokenSource();
		try {
			assert.deepStrictEqual({
				serializedCancellation: await connectWithFailure(canceledError, CancellationToken.None),
				canceledToken: await connectWithFailure(new Error('Setup stopped'), tokenSource.token, () => tokenSource.cancel()),
			}, {
				serializedCancellation: ['get:devContainer.<workspace>', 'connect', 'disconnect'],
				canceledToken: ['get:devContainer.<workspace>', 'connect', 'disconnect', 'disconnect'],
			});
		} finally {
			tokenSource.dispose();
		}
	});
});
