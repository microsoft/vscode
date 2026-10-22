/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { $, addDisposableListener, Dimension, EventHelper, registerWindow } from '../../../../../base/browser/dom.js';
import { CodeWindow, ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { AuxiliaryWindowMode, IAuxiliaryWindow, IAuxiliaryWindowCloseHandler, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { IRecordingService } from '../../browser/recordingService.js';
import { IScreenshotService } from '../../browser/screenshotService.js';
import { IssueReporterData, IssueSource } from '../../common/issue.js';
import { IssueReporterController } from '../../electron-browser/issueReporterController.js';
import { IssueReporterEditorPane } from '../../electron-browser/issueReporterEditorPane.js';
import { ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, IssueReporterOpenStateContribution } from '../../electron-browser/issueReporterKeybindings.js';
import { NativeIssueFormService } from '../../electron-browser/nativeIssueFormService.js';
import { issueReporterImageFixture } from '../common/issueReporterMediaFixtures.js';
import '../../electron-browser/issue.contribution.js';

class TestNativeIssueFormService extends NativeIssueFormService {
	readonly legacy: IssueReporterData[] = [];

	override async openAuxIssueReporterLegacy(data: IssueReporterData): Promise<void> {
		this.legacy.push(data);
	}
}

class TestAuxiliaryWindow extends Disposable implements IAuxiliaryWindow {
	private readonly willDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this.willDispose.event;
	private readonly didLayout = this._register(new Emitter<Dimension>());
	readonly onDidLayout = this.didLayout.event;
	private readonly unloaded = this._register(new Emitter<void>());
	readonly onUnload = this.unloaded.event;
	readonly onWillLayout = Event.None;
	readonly onBeforeUnload = Event.None;
	readonly stylesReady = new DeferredPromise<void>();
	readonly whenStylesHaveLoaded = this.stylesReady.p;
	readonly container = $('div.monaco-workbench');
	readonly frame = $<HTMLIFrameElement>('iframe');
	readonly window: CodeWindow;
	readonly document: Document;
	handler: IAuxiliaryWindowCloseHandler | undefined;
	lastClose: Promise<boolean> | undefined;
	closeCalls = 0;
	readonly registerCloseHandler;

	constructor(id: number, supported: boolean, closeOnRegister: boolean) {
		super();
		mainWindow.document.body.appendChild(this.frame);
		this._register(toDisposable(() => this.frame.remove()));
		const targetWindow = this.frame.contentWindow!;
		ensureCodeWindow(targetWindow, id);
		this._register(registerWindow(targetWindow));
		this.document = targetWindow.document;
		this.document.body.appendChild(this.container);
		const close = () => {
			this.closeCalls++;
			this.lastClose = this.requestClose();
		};
		this.window = new class extends mock<CodeWindow>() {
			override readonly document = targetWindow.document;
			override readonly vscodeWindowId = id;
			override close = close;
		}();
		this.registerCloseHandler = supported ? (handler: IAuxiliaryWindowCloseHandler) => {
			assert.strictEqual(this.handler, undefined);
			this.handler = handler;
			if (closeOnRegister) {
				close();
			}
			return toDisposable(() => { this.handler = undefined; });
		} : undefined;
	}

	private async requestClose(): Promise<boolean> {
		if (this.handler && (!await this.handler.close() || !this.handler.isReadyToClose())) {
			return false;
		}
		this.fireUnload();
		return true;
	}

	fireUnload(): void { this.unloaded.fire(); }

	updateOptions(): void { }
	async setBounds(): Promise<void> { }
	layout(): void { this.didLayout.fire(new Dimension(800, 900)); }
	createState(): IAuxiliaryWindowOpenOptions { return {}; }

	override dispose(): void {
		if (!this._store.isDisposed) {
			this.willDispose.fire();
			super.dispose();
		}
	}
}

suite('NativeIssueFormService reporter windows', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function data(overrides: Partial<IssueReporterData> = {}): IssueReporterData {
		return {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
			issueSource: IssueSource.VSCode, issueTitle: 'Original report', issueBody: 'Original description',
			...overrides,
		};
	}

	function createService(location?: 'editor' | 'window', wizard = true) {
		const instantiation = workbenchInstantiationService(undefined, store);
		for (const ctor of [NativeIssueFormService, IssueReporterController]) {
			for (const dependency of _util.getServiceDependencies(ctor as typeof ctor & _util.DI_TARGET_OBJ)) {
				if (dependency.id !== IInstantiationService && dependency.id !== IKeybindingService && dependency.id !== IContextKeyService) {
					instantiation.stub(dependency.id, {});
				}
			}
		}
		const configuration = new TestConfigurationService({
			'issueReporter.wizard.enabled': wizard,
			'issueReporter.wizard.openLocation': location,
		});
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ILogService, new NullLogService());
		const confirmations: string[] = [];
		const confirmStarted = new DeferredPromise<void>();
		const screenshotStarted = new DeferredPromise<void>();
		const controls: {
			confirm: boolean;
			confirmGate?: DeferredPromise<void>;
			createGate?: DeferredPromise<void>;
			screenshotGate?: DeferredPromise<string | undefined>;
			openError?: Error;
			supported: boolean;
			closeOnRegister: boolean;
			onOpening?: (input: IssueReporterEditorInput, group: IEditorGroup) => void;
		} = { confirm: true, supported: true, closeOnRegister: false };
		instantiation.stub(IDialogService, {
			confirm: async confirmation => {
				confirmations.push(confirmation.message);
				void confirmStarted.complete();
				await controls.confirmGate?.p;
				return { confirmed: controls.confirm };
			},
		});
		let osReads = 0;
		instantiation.stub(INativeHostService, {
			getOSProperties: async () => { osReads++; return { arch: 'test', release: 'test', type: 'test', platform: 'test', cpus: [] }; },
		});
		const focused: Window[] = [];
		instantiation.stub(IHostService, { focus: async window => { focused.push(window); } });
		instantiation.stub(IRecordingService, { isSupported: false, onDidChangeState: Event.None, onDidFailRecording: Event.None });
		instantiation.stub(IScreenshotService, {
			captureScreenshot: async () => {
				void screenshotStarted.complete();
				return controls.screenshotGate?.p;
			}
		});
		instantiation.stub(IUpdateService, { state: { type: StateType.Uninitialized }, onStateChange: Event.None });
		instantiation.stub(IContextViewService, { getContextViewElement: () => $('div') });
		instantiation.stub(IMarkdownRendererService, { render: () => ({ element: $('div'), dispose: () => { } }) });
		const source = $('div.monaco-workbench');
		document.body.appendChild(source);
		store.add(toDisposable(() => source.remove()));
		instantiation.stub(IWorkbenchLayoutService, new class extends TestLayoutService {
			override getContainer(): HTMLElement { return source; }
		}());
		const readonlyUpdates: string[] = [];
		instantiation.stub(IFilesConfigurationService, { updateReadonly: async resource => { readonlyUpdates.push(...(Array.isArray(resource) ? resource : [resource]).map(resource => resource.path)); } });
		const writes: string[] = [];
		instantiation.stub(IFileService, { writeFile: async resource => { writes.push(resource.path); throw new Error('Unexpected write'); } });
		class TestGroup extends mock<IEditorGroup>() {
			override readonly editors: EditorInput[] = [];
			constructor(override readonly id: number, override readonly windowId: number) { super(); }
		}
		const main = new TestGroup(1, 1);
		const groups = [main];
		let activeGroup = main;
		let editorParts = 0;
		instantiation.stub(IEditorGroupsService, {
			groups, mainPart: new class extends mock<IEditorPart>() { override readonly activeGroup = main; }(),
			createAuxiliaryEditorPart: async () => { editorParts++; throw new Error('A reporter must not create an editor part'); },
			activateGroup: group => group as IEditorGroup,
		});
		const opens: { input: EditorInput | IUntypedEditorInput; group: PreferredGroup; explicit: boolean }[] = [];
		instantiation.stub(IEditorService, {
			editors: [], onDidEditorsChange: Event.None,
			openEditor: async (input: EditorInput | IUntypedEditorInput, options?: IEditorOptions | PreferredGroup, preferredGroup?: PreferredGroup) => {
				const group = (input instanceof EditorInput ? preferredGroup : options as PreferredGroup) ?? activeGroup;
				opens.push({ input, group, explicit: (input instanceof EditorInput ? preferredGroup : options) !== undefined });
				if (input instanceof IssueReporterEditorInput) {
					assert.ok(group instanceof TestGroup);
					controls.onOpening?.(input, group);
					if (controls.openError) {
						throw controls.openError;
					}
					if (!group.editors.includes(input)) {
						group.editors.push(store.add(input));
					}
				}
				return undefined;
			},
		});
		const windows: TestAuxiliaryWindow[] = [];
		const windowOptions: (IAuxiliaryWindowOpenOptions | undefined)[] = [];
		instantiation.stub(IAuxiliaryWindowService, {
			open: async options => {
				windowOptions.push(options);
				await controls.createGate?.p;
				const window = store.add(new TestAuxiliaryWindow(100 + windows.length, controls.supported, controls.closeOnRegister));
				windows.push(window);
				return window;
			}
		});
		const instances = spy(instantiation, 'createInstance');
		const service = store.add(instantiation.createInstance(TestNativeIssueFormService));
		return {
			service, controls, configuration, confirmations, confirmStarted, screenshotStarted, opens, main, windows, windowOptions, focused, source, instantiation, readonlyUpdates, writes,
			inputs: () => instances.returnValues.filter((value): value is IssueReporterEditorInput => value instanceof IssueReporterEditorInput),
			createInput: (initial = data()) => store.add(instantiation.createInstance(IssueReporterEditorInput, initial)),
			addGroup: (windowId: number) => {
				const group = new TestGroup(10 + groups.length, windowId);
				groups.push(group);
				activeGroup = group;
				return group;
			},
			editorParts: () => editorParts, osReads: () => osReads,
		};
	}

	test('registers an application-scoped window default without a policy or experiment', () => {
		const setting = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()['issueReporter.wizard.openLocation'];
		assert.deepStrictEqual({ type: setting.type, values: setting.enum, default: setting.default, scope: setting.scope, policy: setting.policy, experiment: setting.experiment }, {
			type: 'string', values: ['editor', 'window'], default: 'window', scope: ConfigurationScope.APPLICATION, policy: undefined, experiment: undefined,
		});
	});

	for (const isSessionsWindow of [false, true]) {
		test(`hosts ${isSessionsWindow ? 'Agents' : 'Editor'} reports without any editor part or editor`, async () => {
			const { service, opens, windows, windowOptions, source, editorParts, osReads, main } = createService();
			await service.openReporter(data({ isSessionsWindow }));
			assert.deepStrictEqual({
				editorParts: editorParts(), opens: opens.length, editors: main.editors.length, osReads: osReads(),
				mode: windowOptions[0]?.mode, nativeTitlebar: windowOptions[0]?.nativeTitlebar, disableWorkbenchMenu: windowOptions[0]?.disableWorkbenchMenu,
				form: windows[0].container.querySelectorAll('.issue-reporter-wizard').length,
				textarea: windows[0].container.querySelectorAll('textarea.wizard-description-input').length,
				chrome: windows[0].container.querySelectorAll('.editor-group-container, .tabs-container, .command-center, .statusbar, .monaco-editor').length,
				sourceCaptureBar: source.querySelectorAll('.issue-reporter-floating-bar').length,
				reporterCaptureBar: windows[0].container.querySelectorAll('.issue-reporter-floating-bar').length,
			}, { editorParts: 0, opens: 0, editors: 0, osReads: 0, mode: AuxiliaryWindowMode.Normal, nativeTitlebar: true, disableWorkbenchMenu: true, form: 1, textarea: 1, chrome: 0, sourceCaptureBar: 1, reporterCaptureBar: 0 });
		});

		test(`preserves editor routing for ${isSessionsWindow ? 'Agents' : 'Editor'} with the editor preference`, async () => {
			const { service, opens, addGroup, main, windowOptions } = createService('editor');
			const auxiliary = addGroup(20);
			await service.openReporter(data({ isSessionsWindow }));
			assert.deepStrictEqual({ windows: windowOptions.length, main: opens[0].group === main, auxiliary: opens[0].group === auxiliary, explicit: opens[0].explicit }, {
				windows: 0, main: isSessionsWindow, auxiliary: !isSessionsWindow, explicit: isSessionsWindow,
			});
		});
	}

	for (const location of ['main', 'modal', 'auxiliary'] as const) {
		test(`reveals an existing ${location} editor draft without moving or replacing it`, async () => {
			const { service, main, addGroup, createInput, opens, windowOptions } = createService();
			const group = location === 'main' ? main : addGroup(location === 'modal' ? 1 : 20);
			const input = createInput();
			group.editors.push(input);
			await service.openReporter(data({ issueTitle: 'Replacement' }));
			assert.deepStrictEqual({ windows: windowOptions.length, sameInput: opens[0].input === input, sameGroup: opens[0].group === group, title: input.data?.issueTitle }, {
				windows: 0, sameInput: true, sameGroup: true, title: 'Original report',
			});
		});
	}

	test('reveals the dedicated draft even after the preference changes to editor', async () => {
		const { service, inputs, configuration, windowOptions, opens, focused, windows } = createService();
		await service.openReporter(data());
		inputs()[0].descriptionInput.setSelectionRange(2, 7);
		await configuration.setUserConfiguration('issueReporter.wizard.openLocation', 'editor');
		await service.openReporter(data({ issueTitle: 'Replacement' }));
		assert.deepStrictEqual({ windows: windowOptions.length, opens: opens.length, focus: focused[0] === windows[0].window, selection: inputs()[0].descriptionInput.selectionEnd, title: inputs()[0].data?.issueTitle }, {
			windows: 1, opens: 0, focus: true, selection: 7, title: 'Original report',
		});
	});

	test('coalesces concurrent opens before a native window exists', async () => {
		const { service, controls, inputs, windowOptions } = createService();
		controls.createGate = new DeferredPromise<void>();
		const first = service.openReporter(data());
		const second = service.openReporter(data({ issueTitle: 'Second' }));
		await timeout(0);
		const pendingCreates = windowOptions.length;
		await controls.createGate.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ pendingCreates, windows: windowOptions.length, inputs: inputs().length, title: inputs()[0].data?.issueTitle }, { pendingCreates: 1, windows: 1, inputs: 1, title: 'Original report' });
	});

	test('installs the singleton guard before synchronous editor callbacks', async () => {
		const { service, controls, opens } = createService('editor');
		let reentrant: Promise<void> | undefined;
		controls.onOpening = () => {
			controls.onOpening = undefined;
			reentrant = service.openReporter(data({ issueTitle: 'Reentrant' }));
		};
		await service.openReporter(data());
		await reentrant;
		assert.strictEqual(opens.length, 1);
	});

	test('cancellation keeps the native draft and repeated discard requests share one decision', async () => {
		const { service, controls, inputs, windows, confirmations, opens, main } = createService();
		await service.openReporter(data());
		const handler = windows[0].handler!;
		controls.confirm = false;
		const first = handler.close();
		const repeated = handler.close();
		const cancelled = await first;
		const retained = !inputs()[0].isDisposed();
		controls.confirm = true;
		windows[0].window.close();
		const closed = await windows[0].lastClose;
		assert.deepStrictEqual({ shared: first === repeated, cancelled, retained, closed, disposed: inputs()[0].isDisposed(), confirmations, registered: !!windows[0].handler, opens: opens.length, editors: main.editors.length }, {
			shared: true, cancelled: false, retained: true, closed: true, disposed: true, confirmations: ['Discard issue report?', 'Discard issue report?'], registered: false, opens: 0, editors: 0,
		});
	});

	test('closes an accepted draft without another discard prompt', async () => {
		const { service, windows, confirmations, inputs } = createService();
		await service.openReporter(data({ issueBody: '', issueTitle: '' }));
		IssueReporterController.getAnyLiveInstance()!.getWizard()!.markPreviewOpened();
		windows[0].window.close();
		assert.deepStrictEqual({ closed: await windows[0].lastClose, confirmations, disposed: inputs()[0].isDisposed() }, { closed: true, confirmations: [], disposed: true });
	});

	test('never touches unrelated main or auxiliary editors during close', async () => {
		const { service, windows, main, addGroup, confirmations } = createService();
		const other = store.add(new class extends EditorInput { override readonly typeId = 'unrelated'; override readonly resource = undefined; }());
		main.editors.push(other);
		const group = addGroup(20);
		group.editors.push(other);
		await service.openReporter(data());
		windows[0].window.close();
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: other.isDisposed(), main: main.editors[0] === other, auxiliary: group.editors[0] === other, confirmations }, {
			disposed: false, main: true, auxiliary: true, confirmations: ['Discard issue report?'],
		});
	});

	test('handles close during initialization before styles settle', async () => {
		const { service, controls, windows, confirmations, inputs } = createService();
		controls.closeOnRegister = true;
		await service.openReporter(data());
		assert.deepStrictEqual({ closed: await windows[0].lastClose, styled: windows[0].stylesReady.isSettled, confirmations, disposed: inputs()[0].isDisposed() }, {
			closed: true, styled: false, confirmations: ['Discard issue report?'], disposed: true,
		});
	});

	for (const discard of [false, true]) {
		test(`coordinates another request with ${discard ? 'discard' : 'cancellation'}`, async () => {
			const { service, controls, windows, inputs, confirmStarted } = createService();
			await service.openReporter(data());
			controls.confirmGate = new DeferredPromise<void>();
			controls.confirm = discard;
			windows[0].window.close();
			await confirmStarted.p;
			const reopening = service.openReporter(data({ issueTitle: 'New report' }));
			await controls.confirmGate.complete();
			await windows[0].lastClose;
			await reopening;
			assert.deepStrictEqual({ windows: windows.length, oldDisposed: inputs()[0].isDisposed(), title: inputs().at(-1)?.data?.issueTitle }, {
				windows: discard ? 2 : 1, oldDisposed: discard, title: discard ? 'New report' : 'Original report',
			});
		});
	}

	test('rejects unsupported close ownership without mounting an editor', async () => {
		const { service, controls, windows, inputs, opens } = createService();
		controls.supported = false;
		await assert.rejects(service.openReporter(data()), /safe close handling/);
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), opens: opens.length, mounted: windows[0].container.children.length }, { disposed: true, opens: 0, mounted: 0 });
	});

	test('cleans failed form initialization and allows a fresh report', async () => {
		const { service, instantiation, windows, inputs } = createService();
		instantiation.stubInstance(IssueReporterController, { setInput: () => { throw new Error('Mount failed'); }, dispose: () => { } });
		await assert.rejects(service.openReporter(data()), /Mount failed/);
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), closeRegistered: !!windows[0].handler }, { disposed: true, closeRegistered: false });
	});

	test('does not dispose a report already adopted by an editor after opening fails', async () => {
		const { service, controls, main, inputs } = createService('editor');
		controls.onOpening = input => main.editors.push(input);
		controls.openError = new Error('Editor failed after adoption');
		await assert.rejects(service.openReporter(data()));
		store.add(inputs()[0]);
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), adopted: main.editors[0] === inputs()[0] }, { disposed: false, adopted: true });
	});

	test('opens reporter-owned file previews read-only in the source group', async () => {
		const { service, opens, main, windows, readonlyUpdates } = createService();
		await service.openReporter(data());
		const wizard = IssueReporterController.getAnyLiveInstance()!.getWizard()!;
		wizard.restoreAttachments([{ id: 'file', kind: 'file', file: { filePath: '/owned/report.txt', name: 'report.txt', mimeType: 'text/plain' } }]);
		windows[0].container.querySelector<HTMLElement>('.wizard-file-card')!.click();
		await timeout(0);
		assert.deepStrictEqual({ group: opens[0].group === main, readonlyUpdates, nativeEditors: windows[0].container.querySelectorAll('.editor-group-container').length }, {
			group: true, readonlyUpdates: ['/owned/report.txt'], nativeEditors: 0,
		});
	});

	test('discard cancels a pending screenshot without attaching its late result', async () => {
		const { service, controls, screenshotStarted, windows, inputs, writes } = createService();
		controls.screenshotGate = new DeferredPromise<string | undefined>();
		await service.openReporter(data());
		IssueReporterController.getAnyLiveInstance()!.getWizard()!.triggerCaptureScreenshot();
		await screenshotStarted.p;
		windows[0].window.close();
		await windows[0].lastClose;
		await controls.screenshotGate.complete(issueReporterImageFixture);
		await timeout(0);
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), attachments: inputs()[0].savedAttachments, writes, live: !!IssueReporterController.getAnyLiveInstance() }, {
			disposed: true, attachments: undefined, writes: [], live: false,
		});
	});

	test('discard cancels a pending file read without writing a late owned copy', async () => {
		const { service, windows, inputs, writes } = createService();
		await service.openReporter(data());
		const reading = new DeferredPromise<void>();
		const bytes = new DeferredPromise<ArrayBuffer>();
		const file = new class extends File {
			override arrayBuffer(): Promise<ArrayBuffer> {
				void reading.complete();
				return bytes.p;
			}
		}(['report'], 'report.zip', { type: 'application/zip' });
		const transfer = new DataTransfer();
		transfer.items.add(file);
		inputs()[0].descriptionInput.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
		await reading.p;
		const pending = !!inputs()[0].hasPendingOperationsFn?.();
		windows[0].window.close();
		await windows[0].lastClose;
		await bytes.complete(new ArrayBuffer(6));
		await timeout(0);
		assert.deepStrictEqual({ pending, disposed: inputs()[0].isDisposed(), attachments: inputs()[0].savedAttachments, writes }, {
			pending: true, disposed: true, attachments: undefined, writes: [],
		});
	});

	test('service disposal during native window creation never mounts a late report', async () => {
		const { service, controls, windows, inputs } = createService();
		controls.createGate = new DeferredPromise<void>();
		const opening = service.openReporter(data());
		await timeout(0);
		service.dispose();
		await controls.createGate.complete();
		await opening;
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), mounted: windows[0].container.children.length, live: !!IssueReporterController.getAnyLiveInstance() }, {
			disposed: true, mounted: 0, live: false,
		});
	});

	test('native unload releases the auxiliary host, source capture bar and draft before reopening', async () => {
		const { service, windows, inputs, source } = createService();
		await service.openReporter(data());
		windows[0].fireUnload();
		const closed = { disposed: inputs()[0].isDisposed(), registered: !!windows[0].handler, connected: windows[0].frame.isConnected, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length };
		await service.openReporter(data());
		assert.deepStrictEqual({ closed, windows: windows.length, newDisposed: inputs()[1].isDisposed() }, {
			closed: { disposed: true, registered: false, connected: false, captureBars: 0 }, windows: 2, newDisposed: false,
		});
	});

	test('isolates workbench key dispatch without cancelling native editing or Tab', async () => {
		const { service, windows, inputs, controls, opens } = createService();
		await service.openReporter(data());
		const editor = inputs()[0].descriptionInput;
		const dispatched: string[] = [];
		const received: string[] = [];
		store.add(addDisposableListener(windows[0].document.defaultView!, 'keydown', (event: KeyboardEvent) => dispatched.push(event.key)));
		store.add(addDisposableListener(windows[0].document.defaultView!, 'keyup', (event: KeyboardEvent) => dispatched.push(event.key)));
		store.add(addDisposableListener(editor, 'keydown', (event: KeyboardEvent) => received.push(event.key)));
		const keys = ['p', 'P', '\\', 'o', 'n', 'F1', 'a', 'c', 'x', 'v', 'z', 'Z', 'y', 'Tab', 'ArrowLeft'];
		const prevented = keys.map(key => {
			const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ctrlKey: !isMacintosh, metaKey: isMacintosh, shiftKey: key === key.toUpperCase() && key.length === 1 });
			editor.dispatchEvent(event);
			editor.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
			return event.defaultPrevented;
		});
		controls.confirm = false;
		const close = new KeyboardEvent('keydown', { key: 'w', keyCode: 87, bubbles: true, cancelable: true, ctrlKey: !isMacintosh, metaKey: isMacintosh });
		editor.dispatchEvent(close);
		await windows[0].lastClose;
		assert.deepStrictEqual({ dispatched, received: received.slice(0, keys.length), prevented, closePrevented: close.defaultPrevented, retained: !inputs()[0].isDisposed(), opens: opens.length }, {
			dispatched: [], received: keys, prevented: keys.map(() => false), closePrevented: true, retained: true, opens: 0,
		});
	});

	test('does not isolate source-window or ordinary auxiliary-editor key events', async () => {
		const { service, source } = createService();
		await service.openReporter(data());
		const ordinary = store.add(new TestAuxiliaryWindow(200, true, false));
		const dispatched: string[] = [];
		store.add(addDisposableListener(mainWindow, 'keydown', () => dispatched.push('source')));
		store.add(addDisposableListener(ordinary.document.defaultView!, 'keydown', () => dispatched.push('ordinary auxiliary')));
		for (const target of [source, ordinary.container]) {
			target.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		}
		assert.deepStrictEqual(dispatched, ['source', 'ordinary auxiliary']);
	});

	for (const location of ['editor', 'window'] as const) {
		test(`preserves native text-only description drops before the ${location} body navigation veto`, async () => {
			const { service, instantiation, inputs, createInput, source, main } = createService(location);
			let input: IssueReporterEditorInput;
			if (location === 'window') {
				await service.openReporter(data({ issueBody: 'before selected after' }));
				input = inputs()[0];
			} else {
				class TestPane extends IssueReporterEditorPane {
					mount(container: HTMLElement): void { this.createEditor(container); }
				}
				const pane = store.add(instantiation.createInstance(TestPane, main));
				pane.mount(source);
				input = createInput(data({ issueBody: 'before selected after' }));
				await pane.setInput(input, undefined, {}, CancellationToken.None);
			}
			const editor = input.descriptionInput;
			const document = editor.ownerDocument;
			const bodyEvents: string[] = [];
			for (const type of ['dragover', 'drop']) {
				store.add(addDisposableListener(document.body, type, event => {
					bodyEvents.push(type);
					EventHelper.stop(event);
				}));
			}
			const transfer = new DataTransfer();
			transfer.setData('text/plain', 'replacement');
			const defaults = ['dragover', 'drop'].map(type => editor.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true })));
			const nativeBodyEvents = [...bodyEvents];
			const outsideDefault = editor.parentElement!.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
			editor.focus();
			editor.setSelectionRange(7, 15);
			document.execCommand('insertText', false, transfer.getData('text/plain'));
			const inserted = editor.value;
			document.execCommand('undo');
			assert.deepStrictEqual({ defaults, nativeBodyEvents, outsideDefault, bodyEvents, inserted, undone: editor.value, attachments: input.savedAttachments }, {
				defaults: [true, true], nativeBodyEvents: [], outsideDefault: false, bodyEvents: ['drop'], inserted: 'before replacement after', undone: 'before selected after', attachments: undefined,
			});
		});
	}

	for (const isSessionsWindow of [false, true]) {
		test(`routes capture commands from the ${isSessionsWindow ? 'Agents' : 'Editor'} source and standalone reporter`, async () => {
			const { service, instantiation, windows, source } = createService();
			const commands: string[] = [];
			instantiation.stub(ICommandService, { executeCommand: async id => { commands.push(id); } });
			store.add(instantiation.createInstance(IssueReporterOpenStateContribution));
			await service.openReporter(data({ isSessionsWindow }));
			for (const target of [source, windows[0].container]) {
				target.dispatchEvent(new KeyboardEvent('keydown', { key: 's', keyCode: 83, shiftKey: true, ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true, cancelable: true }));
			}
			assert.deepStrictEqual({ commands, context: instantiation.get(IContextKeyService).getContextKeyValue('issueReporterOpen') }, {
				commands: [ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID], context: true,
			});
		});
	}

	test('keeps native text, selection and undo when an editor tab is hidden and restored', async () => {
		const { instantiation, createInput, source, main } = createService('editor');
		class TestPane extends IssueReporterEditorPane {
			mount(container: HTMLElement): void { this.createEditor(container); }
		}
		const pane = store.add(instantiation.createInstance(TestPane, main));
		pane.mount(source);
		const input = createInput();
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		const controller = IssueReporterController.getAnyLiveInstance();
		input.descriptionInput.focus();
		input.descriptionInput.select();
		document.execCommand('insertText', false, 'Edited description');
		input.descriptionInput.setSelectionRange(2, 6);
		pane.clearInput();
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		const restored = { same: controller === IssueReporterController.getAnyLiveInstance(), text: input.descriptionInput.value, selection: [input.descriptionInput.selectionStart, input.descriptionInput.selectionEnd] };
		input.descriptionInput.focus();
		document.execCommand('undo');
		assert.deepStrictEqual({ restored, undone: input.descriptionInput.value }, {
			restored: { same: true, text: 'Edited description', selection: [2, 6] }, undone: 'Original description',
		});
	});

	test('leaves classic reporter opening on the original path', async () => {
		const { service, opens, windowOptions, osReads } = createService('window', false);
		const initial = data();
		await service.openReporter(initial);
		assert.deepStrictEqual({ legacy: service.legacy, editorOpens: opens.length, windows: windowOptions.length, osReads: osReads() }, { legacy: [initial], editorOpens: 0, windows: 0, osReads: 1 });
	});
});
