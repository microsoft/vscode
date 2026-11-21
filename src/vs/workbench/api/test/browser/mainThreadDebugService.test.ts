/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../platform/opener/test/common/nullOpenerService.js';
import { ICustomEndpointTelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { AdapterManager } from '../../../contrib/debug/browser/debugAdapterManager.js';
import { ConfigurationManager } from '../../../contrib/debug/browser/debugConfigurationManager.js';
import { DebugService } from '../../../contrib/debug/browser/debugService.js';
import { DebugTaskRunner, TaskRunResult } from '../../../contrib/debug/browser/debugTaskRunner.js';
import { DebugConfigurationProviderTriggerKind, IAdapterManager, IConfigurationManager, IDebugAdapter, IDebugAdapterDescriptorFactory, IDebugConfigurationProvider, IDebugModel, IDebugService, IDebugSession, IViewModel, State } from '../../../contrib/debug/common/debug.js';
import { DebugModel } from '../../../contrib/debug/common/debugModel.js';
import { DebugStorage } from '../../../contrib/debug/common/debugStorage.js';
import { DebugTelemetry } from '../../../contrib/debug/common/debugTelemetry.js';
import { IDebugVisualizerService } from '../../../contrib/debug/common/debugVisualizers.js';
import { Debugger } from '../../../contrib/debug/common/debugger.js';
import { MockDebugAdapter } from '../../../contrib/debug/test/common/mockDebug.js';
import { ITestResultService } from '../../../contrib/testing/common/testResultService.js';
import { ITestService } from '../../../contrib/testing/common/testService.js';
import { IActivityService } from '../../../services/activity/common/activity.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { TestActivityService, TestWorkspaceTrustRequestService, mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadDebugService } from '../../browser/mainThreadDebugService.js';
import { ExtHostDebugServiceShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadDebugService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes debug configuration provider registrations when they are unregistered', async () => {
		let registrationDisposed = false;
		const configurationManager = new class extends mock<IConfigurationManager>() {
			override registerDebugConfigurationProvider(_provider: IDebugConfigurationProvider) {
				return toDisposable(() => registrationDisposed = true);
			}
			override unregisterDebugConfigurationProvider(_provider: IDebugConfigurationProvider): void { }
		};
		const model = new class extends mock<IDebugModel>() {
			override readonly onDidChangeBreakpoints = Event.None;
			override getBreakpoints() { return []; }
			override getFunctionBreakpoints() { return []; }
			override getDataBreakpoints() { return []; }
		};
		const viewModel = new class extends mock<IViewModel>() {
			override readonly onDidFocusSession = Event.None;
			override readonly onDidFocusThread = Event.None;
			override readonly onDidFocusStackFrame = Event.None;
		};
		const debugService = new class extends mock<IDebugService>() {
			override readonly onDidNewSession = Event.None;
			override readonly onWillNewSession = Event.None;
			override readonly onDidEndSession = Event.None;
			override getConfigurationManager() { return configurationManager; }
			override getModel() { return model; }
			override getViewModel() { return viewModel; }
		};
		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly remoteAuthority = '';
			override readonly extensionHostKind = ExtensionHostKind.LocalProcess;
			override getProxy(): any { return {}; }
		};
		const service = store.add(new MainThreadDebugService(
			extHostContext,
			debugService,
			new class extends mock<IDebugVisualizerService>() { }
		));

		await service.$registerDebugConfigurationProvider('test', DebugConfigurationProviderTriggerKind.Initial, true, false, false, 1);
		service.$unregisterDebugConfigurationProvider(1);

		assert.strictEqual(registrationDisposed, true);
	});

	test('disposes debug adapter descriptor factory registrations when they are unregistered', async () => {
		let registrationDisposed = false;
		const adapterManager = new class extends mock<IAdapterManager>() {
			override registerDebugAdapterDescriptorFactory(_factory: IDebugAdapterDescriptorFactory) {
				return toDisposable(() => registrationDisposed = true);
			}
			override unregisterDebugAdapterDescriptorFactory(_factory: IDebugAdapterDescriptorFactory): void { }
		};
		const model = new class extends mock<IDebugModel>() {
			override readonly onDidChangeBreakpoints = Event.None;
			override getBreakpoints() { return []; }
			override getFunctionBreakpoints() { return []; }
			override getDataBreakpoints() { return []; }
		};
		const viewModel = new class extends mock<IViewModel>() {
			override readonly onDidFocusSession = Event.None;
			override readonly onDidFocusThread = Event.None;
			override readonly onDidFocusStackFrame = Event.None;
		};
		const debugService = new class extends mock<IDebugService>() {
			override readonly onDidNewSession = Event.None;
			override readonly onWillNewSession = Event.None;
			override readonly onDidEndSession = Event.None;
			override getAdapterManager() { return adapterManager; }
			override getModel() { return model; }
			override getViewModel() { return viewModel; }
		};
		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly remoteAuthority = '';
			override readonly extensionHostKind = ExtensionHostKind.LocalProcess;
			override getProxy(): any { return {}; }
		};
		const service = store.add(new MainThreadDebugService(
			extHostContext,
			debugService,
			new class extends mock<IDebugVisualizerService>() { }
		));

		await service.$registerDebugAdapterDescriptorFactory('test', 1);
		service.$unregisterDebugAdapterDescriptorFactory(1);

		assert.strictEqual(registrationDisposed, true);
	});

	suite('restart', () => {
		let service: DebugService;
		let taskResult: TaskRunResult;
		let createDebugAdapter: (session: IDebugSession) => IDebugAdapter;

		class RestartDebugAdapter extends MockDebugAdapter {
			rejectRestart = true;
			supportsRestartRequest = true;

			override sendMessage(message: DebugProtocol.ProtocolMessage): void {
				if (message.type === 'request') {
					const request = message as DebugProtocol.Request;
					if (request.command === 'initialize') {
						this.sendResponseBody(request, { supportsRestartRequest: this.supportsRestartRequest });
						return;
					}
					if (request.command === 'restart' && this.rejectRestart) {
						const response: DebugProtocol.Response = {
							type: 'response',
							seq: 0,
							request_seq: request.seq,
							command: request.command,
							success: false,
							message: 'Restart rejected'
						};
						this.acceptMessage(response);
						return;
					}
				}
				super.sendMessage(message);
			}
		}

		let adapter: RestartDebugAdapter;

		setup(() => {
			taskResult = TaskRunResult.Success;
			adapter = store.add(new RestartDebugAdapter());
			createDebugAdapter = () => adapter;
			const instantiationService = workbenchInstantiationService({
				configurationService: () => new TestConfigurationService({ debug: { console: { collapseIdenticalLines: true } } })
			}, store);
			instantiationService.stub(IExtensionHostDebugService, { onAttachSession: Event.None, onTerminateSession: Event.None });
			instantiationService.set(IOpenerService, NullOpenerService);
			instantiationService.stub(IViewsService, {});
			instantiationService.stub(IViewDescriptorService, { getViewContainerByViewId: () => null });
			instantiationService.stub(IActivityService, new TestActivityService());
			instantiationService.stub(ICommandService, {});
			instantiationService.stub(ITestService, {});
			instantiationService.stub(ITestResultService, {});
			instantiationService.stub(ICustomEndpointTelemetryService, {});
			instantiationService.stub(IWorkspaceTrustRequestService, store.add(new TestWorkspaceTrustRequestService(true)));
			instantiationService.stubInstance(AdapterManager, {
				dispose: () => { },
				onDidRegisterDebugger: Event.None,
				hasEnabledDebuggers: () => true,
				getDebugger: () => upcastPartial<Debugger>({
					type: 'mock',
					enabled: true,
					createDebugAdapter: async session => createDebugAdapter(session),
					substituteVariables: async (_folder, config) => config
				})
			});
			instantiationService.stubInstance(ConfigurationManager, {
				dispose: () => { },
				onDidSelectConfiguration: Event.None,
				selectedConfiguration: { launch: undefined, name: undefined, type: undefined, getConfig: async () => undefined },
				resolveConfigurationByProviders: async (_folder, _type, config) => config,
				resolveDebugConfigurationWithSubstitutedVariables: async (_folder, _type, config) => config
			});
			instantiationService.stubInstance(DebugTaskRunner, {
				runTask: async () => null,
				runTaskAndCheckErrors: async () => taskResult
			});
			instantiationService.stubInstance(DebugTelemetry, {
				logDebugSessionStart: () => { },
				logDebugSessionStop: () => { }
			});
			const storage = store.add(instantiationService.createInstance(DebugStorage));
			instantiationService.stubInstance(DebugStorage, storage);
			instantiationService.stubInstance(DebugModel, store.add(instantiationService.createInstance(DebugModel, storage)));
			service = store.add(instantiationService.createInstance(DebugService));
			instantiationService.stub(IDebugService, service);
			store.add(service.onWillNewSession(session => store.add(session)));
		});

		teardown(async () => {
			for (const session of service.getModel().getSessions()) {
				await session.disconnect();
			}
		});

		async function startSession(): Promise<IDebugSession> {
			assert.strictEqual(await service.startDebugging(undefined, { name: 'mock', type: 'mock', request: 'launch' }, { saveBeforeRestart: false }, false), true);
			return service.getModel().getSessions()[0];
		}

		test('does not end a live session when the adapter rejects restart', async () => {
			const session = await startSession();
			const ended: boolean[] = [];
			store.add(service.onDidEndSession(e => ended.push(e.restart)));

			await assert.rejects(service.restartSession(session), /Restart rejected/);

			assert.deepStrictEqual({
				state: session.state,
				ended,
				result: (await session.evaluate('answer', undefined, 'repl'))?.body.result
			}, { state: State.Running, ended: [], result: '=answer' });
		});

		test('keeps extension host adapter responses connected after a rejected restart', async () => {
			const proxy = new class extends mock<ExtHostDebugServiceShape>() {
				override $startDASession(handle: number): Promise<void> {
					adapter.onMessage(message => mainThread.$acceptDAMessage(handle, message));
					return adapter.startSession();
				}
				override $sendDAMessage(_handle: number, message: DebugProtocol.ProtocolMessage): void {
					adapter.sendMessage(message);
				}
				override $stopDASession(): Promise<void> {
					return adapter.stopSession();
				}
				override $acceptDebugSessionStarted(): void { }
				override $acceptDebugSessionTerminated(): void { }
				override $acceptDebugSessionActiveChanged(): void { }
				override $acceptStackFrameFocus(): void { }
			};
			const mainThread = store.add(new MainThreadDebugService(SingleProxyRPCProtocol(proxy), service, new (mock<IDebugVisualizerService>())()));
			createDebugAdapter = session => store.add(mainThread.createDebugAdapter(session));
			const session = await startSession();

			await assert.rejects(service.restartSession(session), /Restart rejected/);

			const response = await raceTimeout(session.evaluate('answer', undefined, 'repl'), 1000);
			assert.strictEqual(response?.body.result, '=answer');
		});

		test('does not end a live session when the adapter restarts successfully', async () => {
			adapter.rejectRestart = false;
			const session = await startSession();
			const ended: boolean[] = [];
			store.add(service.onDidEndSession(e => ended.push(e.restart)));

			await service.restartSession(session);

			assert.deepStrictEqual({ state: session.state, ended }, { state: State.Running, ended: [] });
		});

		test('ends a terminated session when restart tasks fail', async () => {
			adapter.supportsRestartRequest = false;
			const session = await startSession();
			const ended: boolean[] = [];
			store.add(service.onDidEndSession(e => ended.push(e.restart)));
			taskResult = TaskRunResult.Failure;

			await service.restartSession(session);

			assert.deepStrictEqual({ state: session.state, ended }, { state: State.Inactive, ended: [true, false] });
		});
	});
});
