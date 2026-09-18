/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChannelClient, ChannelServer, IMessagePassingProtocol, ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { nextMacrotask, realTimeApi } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { browserZoomDefaultIndex, BrowserViewStorageScope, IBrowserViewCreatedEvent, IBrowserViewInfo, IBrowserViewLoadingEvent, IBrowserViewNavigationEvent, IBrowserViewService, IBrowserViewState, IBrowserViewTitleChangeEvent, ipcBrowserViewChannelName } from '../../../../../platform/browserView/common/browserView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { BrowserEditorInput } from '../../common/browserEditorInput.js';
import { BrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IBrowserZoomService } from '../../common/browserZoomService.js';
import { BrowserViewWorkbenchService } from '../../electron-browser/browserViewWorkbenchService.js';

class ControlledProtocol extends Disposable implements IMessagePassingProtocol {
	private readonly _onMessage = this._register(new Emitter<VSBuffer>());
	readonly onMessage = this._onMessage.event;
	private readonly pending: VSBuffer[] = [];
	paused = true;
	other!: ControlledProtocol;

	send(message: VSBuffer): void {
		if (this.other.paused) {
			this.other.pending.push(message);
		} else {
			this.other._onMessage.fire(message);
		}
	}

	resume(): void {
		this.paused = false;
		for (const message of this.pending.splice(0)) {
			this._onMessage.fire(message);
		}
	}
}

suite('BrowserViewWorkbenchService popup handoff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	const childId = 'popup-child';
	const childUrl = 'http://localhost/popup-child';
	const childTitle = 'Browser Smoke Popup Child';

	async function createWorkbench() {
		const inputs = store.add(new DisposableStore());
		const services = store.add(new DisposableStore());
		const ipc = store.add(new DisposableStore());
		const events = store.add(new DisposableStore());
		const created = events.add(new Emitter<IBrowserViewCreatedEvent>());
		const navigation = events.add(new Emitter<IBrowserViewNavigationEvent>());
		const title = events.add(new Emitter<IBrowserViewTitleChangeEvent>());
		const loading = events.add(new Emitter<IBrowserViewLoadingEvent>());
		const closed = events.add(new Emitter<void>());
		const listedViews = new DeferredPromise<IBrowserViewInfo[]>();
		const snapshot = new DeferredPromise<IBrowserViewState>();
		const trace: string[] = [];
		const errors: (string | Error)[] = [];
		const openCalls: BrowserEditorInput[] = [];
		const groupEditors: BrowserEditorInput[] = [];
		const destroyed: string[] = [];
		const initialState = createInitialState();
		let state = initialState;
		let nativeCreateCalls = 0;
		let navigationCalls = 0;
		const info = (): IBrowserViewInfo => ({
			id: childId, host: { windowId: mainWindow.vscodeWindowId }, owner: { type: 'user' }, state,
		});
		const browserService = new class extends mock<IBrowserViewService>() {
			override readonly onDidCreateBrowserView = created.event;
			override getBrowserViews() { return listedViews.p; }
			override async getState(): Promise<IBrowserViewState> {
				assert.fail('Reconciliation must not request the full browser snapshot');
			}
			override getNavigationState(id: string) {
				trace.push(`snapshot ${id}`);
				return snapshot.p;
			}
			override async getOrCreateBrowserView() {
				nativeCreateCalls++;
				return info();
			}
			override async loadURL() { navigationCalls++; }
			override async updateWindowConfiguration() { }
			override async setBrowserZoomIndex() { }
			override async destroyBrowserView(id: string) { destroyed.push(id); }
			override onDynamicDidNavigate(id: string) {
				trace.push(`subscribe navigation ${id}`);
				return navigation.event;
			}
			override onDynamicDidChangeTitle(id: string) {
				trace.push(`subscribe title ${id}`);
				return title.event;
			}
			override onDynamicDidChangeLoadingState() { return loading.event; }
			override onDynamicDidClose() { return closed.event; }
			override onDynamicDidChangePermissions() { return Event.None; }
			override onDynamicDidChangeDevToolsState() { return Event.None; }
			override onDynamicDidChangeFavicon() { return Event.None; }
			override onDynamicDidChangeOwner() { return Event.None; }
			override onDynamicDidChangeFocus() { return Event.None; }
			override onDynamicDidChangeVisibility() { return Event.None; }
			override onDynamicDidChangeDeviceEmulation() { return Event.None; }
			override onDynamicDidChangeElementSelectionState() { return Event.None; }
			override onDynamicDidChangeAreaSelectionActive() { return Event.None; }
			override onDynamicDidChangeAudiences() { return Event.None; }
			override onDynamicDidChangeRemoteStatus() { return Event.None; }
		}();
		const mainProtocol = ipc.add(new ControlledProtocol());
		const rendererProtocol = ipc.add(new ControlledProtocol());
		mainProtocol.other = rendererProtocol;
		rendererProtocol.other = mainProtocol;
		const client = ipc.add(new ChannelClient(rendererProtocol));
		const server = ipc.add(new ChannelServer(mainProtocol, 'popup-test'));
		server.registerChannel(ipcBrowserViewChannelName, ProxyChannel.fromService(browserService, events));
		rendererProtocol.resume();
		mainProtocol.resume();

		const group = upcastPartial<IEditorGroup>({ id: 1, editors: groupEditors, isLocked: false });
		const configuration = new TestConfigurationService();
		const collection = new ServiceCollection(
			[IMainProcessService, upcastPartial<IMainProcessService>({ getChannel: name => client.getChannel(name) })],
			[IConfigurationService, configuration],
			[IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
				getWorkspace: () => TestWorkspace, getWorkbenchState: () => WorkbenchState.EMPTY, onDidChangeWorkspaceFolders: Event.None,
			})],
			[IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({
				workspaceTrustInitialized: Promise.resolve(), isWorkspaceTrusted: () => true, getTrustedUris: () => [],
				onDidChangeTrustedFolders: Event.None, onDidChangeTrust: Event.None,
			})],
			[IWorkspaceTrustEnablementService, upcastPartial<IWorkspaceTrustEnablementService>({ isWorkspaceTrustEnabled: () => true })],
			[IKeybindingService, new MockKeybindingService()],
			[IContextKeyService, new MockContextKeyService()],
			[IThemeService, upcastPartial<IThemeService>({ getColorTheme: () => new TestColorTheme(), onDidColorThemeChange: Event.None })],
			[IAccessibilityService, upcastPartial<IAccessibilityService>({ isMotionReduced: () => false, onDidChangeReducedMotion: Event.None })],
			[INativeWorkbenchEnvironmentService, upcastPartial<INativeWorkbenchEnvironmentService>({ userHome: URI.file('/popup-test') })],
			[ILogService, new class extends NullLogService {
				override error(message: string | Error): void { errors.push(message); }
			}()],
			[INotificationService, upcastPartial<INotificationService>({})],
			[IChatWidgetService, upcastPartial<IChatWidgetService>({})],
			[IDialogService, upcastPartial<IDialogService>({})],
			[IStorageService, upcastPartial<IStorageService>({})],
			[ITelemetryService, NullTelemetryService],
			[IBrowserZoomService, upcastPartial<IBrowserZoomService>({ getEffectiveZoomIndex: () => browserZoomDefaultIndex, onDidChangeZoom: Event.None })],
			[IAgentNetworkFilterService, upcastPartial<IAgentNetworkFilterService>({ onDidChange: Event.None })],
			[IEditorGroupsService, upcastPartial<IEditorGroupsService>({
				groups: [group], activeGroup: group, getGroup: id => id === group.id ? group : undefined,
			})],
			[IEditorService, upcastPartial<IEditorService>({
				openEditor: async (editor: EditorInput | IUntypedEditorInput, _options?: IEditorOptions | PreferredGroup, targetGroup?: PreferredGroup) => {
					assert.ok(editor instanceof BrowserEditorInput);
					assert.strictEqual(targetGroup, group);
					inputs.add(editor);
					openCalls.push(editor);
					groupEditors.push(editor);
					trace.push(`open editor ${editor.id}`);
					inputs.add(editor.onWillDispose(() => groupEditors.splice(groupEditors.indexOf(editor), 1)));
					return undefined;
				},
			})],
		);
		const instantiationService = services.add(new InstantiationService(collection, true));
		const workbench = services.add(instantiationService.createInstance(BrowserViewWorkbenchService));
		collection.set(IBrowserViewWorkbenchService, workbench);
		const initialized = Event.toPromise(client.getChannel(ipcBrowserViewChannelName).listen<IBrowserViewCreatedEvent>('onDidCreateBrowserView'));
		created.fire({ info: { ...info(), id: 'other-window', host: { windowId: mainWindow.vscodeWindowId + 1 } } });
		await initialized;
		const parent = inputs.add(workbench.getOrCreateLazy({ id: 'parent', url: 'http://localhost/lifecycle' }));
		groupEditors.push(parent);
		const instances = sinon.spy(instantiationService, 'createInstance');

		const commit = (url = childUrl, pageTitle = childTitle) => {
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, url, title: '', canGoBack: !!state.url };
			trace.push(`navigate ${url}`);
			navigation.fire(state);
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, title: pageTitle };
			trace.push(`title ${pageTitle}`);
			title.fire(state);
			state = { ...state, navigationStateVersion: state.navigationStateVersion + 1, loading: false };
			loading.fire(state);
		};
		const publish = () => {
			trace.push(`creation ${childId}`);
			created.fire({ info: info(), initialUrl: childUrl, editorOpenRequest: { parentViewId: parent.id, pinned: true } });
		};
		const settle = () => new Promise<void>(resolve => nextMacrotask(realTimeApi, resolve));
		const child = () => {
			const input = workbench.getKnownBrowserViews().get(childId);
			assert.ok(input);
			return input;
		};
		return {
			workbench, initialState, info, publish, commit, settle, child, trace, openCalls, groupEditors, destroyed, closed,
			mainProtocol, rendererProtocol, listedViews, snapshot, instances, errors,
			get state() { return state; }, get nativeCreateCalls() { return nativeCreateCalls; }, get navigationCalls() { return navigationCalls; },
		};
	}

	for (const delay of ['creation', 'subscriptions'] as const) {
		test(`recovers a loaded child with delayed ${delay} through the production workbench and IPC channel`, async () => {
			const testCase = await createWorkbench();
			const delayedProtocol = delay === 'creation' ? testCase.rendererProtocol : testCase.mainProtocol;
			delayedProtocol.paused = true;
			testCase.publish();
			testCase.commit();
			delayedProtocol.resume();
			await testCase.snapshot.complete(testCase.state);
			await testCase.listedViews.complete([testCase.info()]);
			await testCase.settle();
			const input = testCase.child();
			const model = await input.resolve();

			assert.deepStrictEqual({
				url: model.url, title: model.title, label: input.getName(), loading: model.loading,
				openCalls: testCase.openCalls.map(editor => editor.id),
				groupEditors: testCase.groupEditors.map(editor => editor.id),
				known: [...testCase.workbench.getKnownBrowserViews().keys()],
				inputCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserEditorInput).length,
				modelCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserViewModel).length,
				nativeCreateCalls: testCase.nativeCreateCalls, navigationCalls: testCase.navigationCalls, errors: testCase.errors,
				trace: testCase.trace,
			}, {
				url: childUrl, title: childTitle, label: childTitle, loading: false,
				openCalls: [childId], groupEditors: ['parent', childId], known: ['parent', childId],
				inputCreations: 1, modelCreations: 1, nativeCreateCalls: 0, navigationCalls: 0, errors: [],
				trace: [
					`creation ${childId}`, `navigate ${childUrl}`, `title ${childTitle}`,
					`subscribe navigation ${childId}`, `subscribe title ${childId}`, `snapshot ${childId}`, `open editor ${childId}`,
				],
			}, JSON.stringify(testCase.trace));
		});
	}

	for (const snapshotFirst of [true, false]) {
		test(`does not roll back or recreate the editor when the snapshot is delivered ${snapshotFirst ? 'before' : 'after'} later events`, async () => {
			const testCase = await createWorkbench();
			testCase.rendererProtocol.paused = true;
			testCase.publish();
			const staleInfo = testCase.info();
			testCase.commit();
			const snapshot = testCase.state;
			testCase.rendererProtocol.resume();
			const input = testCase.child();
			const model = await input.resolve();
			const labels: string[] = [];
			store.add(input.onDidChangeLabel(() => labels.push(input.getName())));
			if (snapshotFirst) {
				await testCase.snapshot.complete(snapshot);
				await testCase.settle();
			}
			testCase.commit('http://later.example/child', 'Later child');
			labels.length = 0;
			if (!snapshotFirst) {
				await testCase.snapshot.complete(snapshot);
			}
			await testCase.listedViews.complete([staleInfo]);
			await testCase.settle();
			const sameInput = testCase.workbench.getOrCreateLazy({ id: childId, url: childUrl });

			assert.deepStrictEqual({
				url: model.url, title: model.title, label: input.getName(), canGoBack: model.canGoBack,
				sameInput: sameInput === input, sameModel: await sameInput.resolve() === model,
				openCalls: testCase.openCalls.length, childEditors: testCase.groupEditors.filter(editor => editor.id === childId).length,
				inputCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserEditorInput).length,
				modelCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserViewModel).length,
				staleLabels: labels.filter(label => label !== 'Later child'),
				nativeCreateCalls: testCase.nativeCreateCalls, navigationCalls: testCase.navigationCalls, errors: testCase.errors,
			}, {
				url: 'http://later.example/child', title: 'Later child', label: 'Later child', canGoBack: true,
				sameInput: true, sameModel: true, openCalls: 1, childEditors: 1, inputCreations: 1, modelCreations: 1,
				staleLabels: [], nativeCreateCalls: 0, navigationCalls: 0, errors: [],
			}, JSON.stringify(testCase.trace));
		});
	}

	for (const nativeClose of [true, false]) {
		test(`keeps the child closed when ${nativeClose ? 'the native close event' : 'editor disposal'} precedes a delayed snapshot`, async () => {
			const testCase = await createWorkbench();
			await testCase.listedViews.complete([]);
			testCase.publish();
			testCase.commit();
			await testCase.settle();
			const input = testCase.child();
			if (nativeClose) {
				testCase.closed.fire();
			} else {
				input.dispose();
			}
			await testCase.snapshot.complete(testCase.state);
			await testCase.settle();

			assert.deepStrictEqual({
				editorDisposed: input.isDisposed(),
				groupEditors: testCase.groupEditors.map(editor => editor.id),
				known: [...testCase.workbench.getKnownBrowserViews().keys()],
				destroyed: testCase.destroyed,
				inputCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserEditorInput).length,
				modelCreations: testCase.instances.getCalls().filter(call => call.args[0] === BrowserViewModel).length,
				openCalls: testCase.openCalls.length,
				errors: testCase.errors,
			}, {
				editorDisposed: true, groupEditors: ['parent'], known: ['parent'], destroyed: [childId],
				inputCreations: 1, modelCreations: 1, openCalls: 1, errors: [],
			});
		});
	}
});

function createInitialState(): IBrowserViewState {
	return {
		navigationStateVersion: 0,
		url: '', title: '', canGoBack: false, canGoForward: false, loading: true,
		focused: false, visible: false, isDevToolsOpen: false,
		lastScreenshot: undefined, lastFavicon: undefined, lastError: undefined, certificateError: undefined,
		storageScope: BrowserViewStorageScope.Ephemeral, storageKeys: {}, permissions: { origins: {} },
		browserZoomIndex: browserZoomDefaultIndex, elementSelectionState: { active: false, options: {} },
		isRemoteSession: false, isAreaSelectionActive: false, device: undefined, audiences: [],
	};
}
