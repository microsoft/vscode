/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { $, addDisposableListener, Dimension, EventHelper, registerWindow } from '../../../../../base/browser/dom.js';
import { getZoomLevel } from '../../../../../base/browser/browser.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { CodeWindow, ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IME } from '../../../../../base/common/ime.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { decodeKeybinding, Keybinding } from '../../../../../base/common/keybindings.js';
import { isMacintosh, OS } from '../../../../../base/common/platform.js';
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
import { IKeyboardEvent, IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AbstractKeybindingService } from '../../../../../platform/keybinding/common/abstractKeybindingService.js';
import { KeybindingResolver, NoMatchingKb } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { AuxiliaryWindowMode, BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow, IAuxiliaryWindowOpenOptions, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { IRecordingService } from '../../browser/recordingService.js';
import { IScreenshotService } from '../../browser/screenshotService.js';
import { IIssueFormService, IssueReporterData, IssueSource } from '../../common/issue.js';
import { IssueReporterController } from '../../electron-browser/issueReporterController.js';
import { IssueReporterEditorPane } from '../../electron-browser/issueReporterEditorPane.js';
import { ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID, IssueReporterOpenStateContribution } from '../../electron-browser/issueReporterKeybindings.js';
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
	private readonly didLayout = this._register(new Emitter<Dimension>());
	readonly onDidLayout = this.didLayout.event;
	private readonly unloaded = this._register(new Emitter<void>());
	readonly onUnload = this.unloaded.event;
	readonly onWillLayout = Event.None;
	private readonly beforeUnload = this._register(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
	readonly onBeforeUnload: Event<BeforeAuxiliaryWindowUnloadEvent>;
	readonly stylesReady = new DeferredPromise<void>();
	readonly whenStylesHaveLoaded = this.stylesReady.p;
	readonly container = $('div.monaco-workbench');
	readonly frame = $<HTMLIFrameElement>('iframe');
	readonly window: CodeWindow;
	readonly document: Document;
	lastClose: Promise<boolean> | undefined;
	closeCalls = 0;
	disposeCalls = 0;
	blockNativeClose = false;
	readonly vetoReasons: string[] = [];
	private disposing = false;

	constructor(id: number, closeOnRegister: boolean) {
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
			override readonly addEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
				targetWindow.addEventListener(type, listener, options);
			};
			override readonly removeEventListener = (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void => {
				targetWindow.removeEventListener(type, listener, options);
			};
			override readonly dispatchEvent = (event: globalThis.Event): boolean => targetWindow.dispatchEvent(event);
		}();
		this.onBeforeUnload = (listener, thisArgs, disposables) => {
			const registration = this.beforeUnload.event(listener, thisArgs, disposables);
			if (closeOnRegister) {
				closeOnRegister = false;
				close();
			}
			return registration;
		};
	}

	get hasVetoListener(): boolean { return this.beforeUnload.hasListeners(); }

	private async requestClose(): Promise<boolean> {
		if (this.blockNativeClose) {
			return false;
		}
		let vetoed = false;
		this.beforeUnload.fire({
			veto: reason => {
				if (reason) {
					vetoed = true;
					this.vetoReasons.push(reason);
				}
			}
		});
		if (vetoed) {
			return false;
		}
		this.fireUnload();
		return true;
	}

	fireUnload(): void {
		this.unloaded.fire();
		this.window.dispatchEvent(new mainWindow.Event('unload'));
	}

	updateOptions(): void { }
	async setBounds(): Promise<void> { }
	layout(): void { this.didLayout.fire(new Dimension(800, 900)); }
	createState(): IAuxiliaryWindowOpenOptions { return {}; }

	override dispose(): void {
		if (this._store.isDisposed || this.disposing) {
			return;
		}
		this.disposing = true;
		this.disposeCalls++;
		this.fireUnload();
		super.dispose();
	}
}

function editDraft(input: IssueReporterEditorInput): void {
	input.descriptionInput.value += '\nUser edit';
	input.descriptionInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
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
		const lifecycle = store.add(new class extends TestLifecycleService {
			private readonly vetoed = this._register(new Emitter<void>());
			override get onShutdownVeto(): Event<void> { return this.vetoed.event; }
			fireVeto(): void { this.vetoed.fire(); }
		}());
		instantiation.stub(ILifecycleService, lifecycle);
		const keybindings = new class extends MockKeybindingService {
			bindings: { command: string; key: number }[] = [
				{ command: ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, key: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS },
				{ command: ISSUE_REPORTER_TOGGLE_RECORDING_COMMAND_ID, key: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR },
			];

			override softDispatch(event: IKeyboardEvent) {
				const items = this.bindings.map(binding => new ResolvedKeybindingItem(this.resolveKeybinding(decodeKeybinding(binding.key, OS)!)[0], binding.command, undefined, undefined, false, null, false));
				const resolver = new KeybindingResolver([], items, () => { });
				const chord = this.resolveKeyboardEvent(event).getDispatchChords()[0];
				return chord ? resolver.resolve({ getValue: () => undefined }, [], chord) : NoMatchingKb;
			}
		}();
		instantiation.stub(IKeybindingService, keybindings);
		const previews: string[] = [];
		instantiation.stub(IOpenerService, { open: async resource => { previews.push(resource.toString()); return true; } });
		const confirmations: string[] = [];
		const confirmStarted = new DeferredPromise<void>();
		const screenshotStarted = new DeferredPromise<void>();
		const controls: {
			confirm: boolean;
			confirmGate?: DeferredPromise<void>;
			createGate?: DeferredPromise<void>;
			screenshotGate?: DeferredPromise<string | undefined>;
			openError?: Error;
			createError?: Error;
			closeOnRegister: boolean;
			onOpening?: (input: IssueReporterEditorInput, group: IEditorGroup) => void;
		} = { confirm: true, closeOnRegister: false };
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
			closeWindow: async options => {
				const window = windows.find(window => window.window.vscodeWindowId === options?.targetWindowId);
				assert.ok(window);
				window.window.close();
				await window.lastClose;
			},
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
				if (controls.createError) {
					throw controls.createError;
				}
				const window = store.add(new TestAuxiliaryWindow(100 + windows.length, controls.closeOnRegister));
				windows.push(window);
				return window;
			}
		});
		const instances = spy(instantiation, 'createInstance');
		const service = store.add(instantiation.createInstance(TestNativeIssueFormService));
		instantiation.stub(IIssueFormService, service);
		return {
			service, controls, configuration, confirmations, confirmStarted, screenshotStarted, opens, main, windows, windowOptions, focused, source, instantiation, readonlyUpdates, writes, lifecycle, keybindings, previews,
			shutdown: async (reason: ShutdownReason) => {
				if (reason === ShutdownReason.QUIT) {
					windows.forEach(window => window.blockNativeClose = true);
				}
				const vetos: (boolean | Promise<boolean>)[] = [];
				lifecycle.fireBeforeShutdown({ reason, veto: value => { vetos.push(value); }, finalVeto: () => { throw new Error('Unexpected final veto'); } });
				const vetoed = (await Promise.all(vetos)).some(Boolean);
				if (!vetoed) {
					lifecycle.fireShutdown(reason);
				} else {
					windows.forEach(window => window.blockNativeClose = false);
					lifecycle.fireVeto();
				}
				return { vetoed, participants: vetos.length };
			},
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
				mode: windowOptions[0]?.mode, nativeTitlebar: windowOptions[0]?.nativeTitlebar,
				form: windows[0].container.querySelectorAll('.issue-reporter-wizard').length,
				textarea: windows[0].container.querySelectorAll('textarea.wizard-description-input').length,
				chrome: windows[0].container.querySelectorAll('.editor-group-container, .tabs-container, .command-center, .statusbar, .monaco-editor').length,
				sourceCaptureBar: source.querySelectorAll('.issue-reporter-floating-bar').length,
				reporterCaptureBar: windows[0].container.querySelectorAll('.issue-reporter-floating-bar').length,
			}, { editorParts: 0, opens: 0, editors: 0, osReads: 0, mode: AuxiliaryWindowMode.Normal, nativeTitlebar: true, form: 1, textarea: 1, chrome: 0, sourceCaptureBar: 1, reporterCaptureBar: 0 });
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
		const { service, controls, inputs, windows, confirmations, confirmStarted, opens, main } = createService();
		await service.openReporter(data());
		editDraft(inputs()[0]);
		controls.confirm = false;
		controls.confirmGate = new DeferredPromise<void>();
		windows[0].window.close();
		windows[0].window.close();
		await confirmStarted.p;
		const pendingDecisions = confirmations.length;
		await controls.confirmGate.complete();
		await timeout(0);
		const cancelled = await windows[0].lastClose;
		const retained = !inputs()[0].isDisposed();
		controls.confirm = true;
		controls.confirmGate = undefined;
		windows[0].window.close();
		await timeout(0);
		const closed = await windows[0].lastClose;
		assert.deepStrictEqual({ pendingDecisions, cancelled, retained, closed, disposed: inputs()[0].isDisposed(), confirmations, registered: windows[0].hasVetoListener, opens: opens.length, editors: main.editors.length }, {
			pendingDecisions: 1, cancelled: false, retained: true, closed: true, disposed: true, confirmations: ['Discard issue report?', 'Discard issue report?'], registered: false, opens: 0, editors: 0,
		});
	});

	for (const prefilled of [false, true]) {
		test(`closes an untouched ${prefilled ? 'prefilled' : 'blank'} report without a reporter veto or question`, async () => {
			const { service, windows, inputs, confirmations } = createService();
			await service.openReporter(data(prefilled ? {} : { issueTitle: '', issueBody: '' }));
			windows[0].window.close();
			assert.deepStrictEqual({ closed: await windows[0].lastClose, vetoes: windows[0].vetoReasons, confirmations, disposed: inputs()[0].isDisposed() }, {
				closed: true, vetoes: [], confirmations: [], disposed: true,
			});
		});
	}

	for (const reason of [ShutdownReason.CLOSE, ShutdownReason.QUIT, ShutdownReason.RELOAD, ShutdownReason.LOAD]) {
		for (const discard of [false, true]) {
			test(`${discard ? 'discards' : 'retains'} the standalone draft for source shutdown reason ${reason}`, async () => {
				const { service, controls, inputs, windows, confirmations, source, shutdown } = createService();
				await service.openReporter(data());
				editDraft(inputs()[0]);
				controls.confirm = discard;
				const result = await shutdown(reason);
				assert.deepStrictEqual({
					result, disposed: inputs()[0].isDisposed(), connected: windows[0].frame.isConnected,
					registered: windows[0].hasVetoListener, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length, confirmations,
				}, {
					result: { vetoed: !discard, participants: 1 }, disposed: discard, connected: !discard,
					registered: !discard, captureBars: discard ? 0 : 1, confirmations: ['Discard issue report?'],
				});
			});
		}

		test(`leaves editor-mode shutdown confirmation to the editor lifecycle for reason ${reason}`, async () => {
			const { service, inputs, confirmations, shutdown } = createService('editor');
			await service.openReporter(data());
			const result = await shutdown(reason);
			assert.deepStrictEqual({ result, confirmations, disposed: inputs()[0].isDisposed() }, {
				result: { vetoed: false, participants: 0 }, confirmations: [], disposed: false,
			});
		});
	}

	test('keeps an approved draft and its owned files when another shutdown participant vetoes', async () => {
		const { service, lifecycle, shutdown, inputs, windows, source, confirmations, confirmStarted } = createService();
		await service.openReporter(data());
		const input = inputs()[0];
		editDraft(input);
		const cleanup = spy();
		input.savedAttachments = [{ id: 'owned', kind: 'file', file: { filePath: '/owned/report.json', name: 'report.json', mimeType: 'application/json' } }];
		input.registerImportedFile('/owned/report.json', toDisposable(cleanup));
		const otherVeto = new DeferredPromise<boolean>();
		const participant = store.add(lifecycle.onBeforeShutdown(event => event.veto(otherVeto.p, 'otherParticipant')));
		const pending = shutdown(ShutdownReason.QUIT);
		await confirmStarted.p;
		await timeout(0);
		const beforeVeto = { disposed: input.isDisposed(), connected: windows[0].frame.isConnected, cleanup: cleanup.callCount };
		await otherVeto.complete(true);
		const vetoed = await pending;
		const afterVeto = { disposed: input.isDisposed(), registered: windows[0].hasVetoListener, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length, cleanup: cleanup.callCount };
		participant.dispose();
		const committed = await shutdown(ShutdownReason.QUIT);
		assert.deepStrictEqual({ beforeVeto, vetoed, afterVeto, committed, disposed: input.isDisposed(), cleanup: cleanup.callCount, confirmations }, {
			beforeVeto: { disposed: false, connected: true, cleanup: 0 },
			vetoed: { vetoed: true, participants: 2 },
			afterVeto: { disposed: false, registered: true, captureBars: 1, cleanup: 0 },
			committed: { vetoed: false, participants: 1 }, disposed: true, cleanup: 1,
			confirmations: ['Discard issue report?', 'Discard issue report?'],
		});
	});

	test('retains an edited draft when Close overlaps a Quit veto, while cancelling its old submission', async () => {
		const { service, lifecycle, controls, windows, inputs, confirmStarted, confirmations, shutdown } = createService();
		await service.openReporter(data());
		const input = inputs()[0];
		editDraft(input);
		const signal = input.submissionSignal;
		const description = input.descriptionInput.value;
		const otherVeto = new DeferredPromise<boolean>();
		store.add(lifecycle.onBeforeShutdown(event => event.veto(otherVeto.p, 'otherParticipant')));
		controls.confirmGate = new DeferredPromise<void>();
		windows[0].window.close();
		await confirmStarted.p;
		const quitting = shutdown(ShutdownReason.QUIT);
		await controls.confirmGate.complete();
		await timeout(0);
		const afterDiscard = { disposed: input.isDisposed(), description: input.descriptionInput.value, oldSubmissionAborted: signal.aborted, nextSubmissionAborted: input.submissionSignal.aborted };
		await otherVeto.complete(true);
		const quitResult = await quitting;
		controls.confirmGate = undefined;
		controls.confirm = false;
		windows[0].window.close();
		await timeout(0);
		assert.deepStrictEqual({ afterDiscard, quitResult, stillOpen: windows[0].frame.isConnected, disposed: input.isDisposed(), confirmations, closeVetoes: windows[0].vetoReasons.length }, {
			afterDiscard: { disposed: false, description, oldSubmissionAborted: true, nextSubmissionAborted: false },
			quitResult: { vetoed: true, participants: 2 }, stillOpen: true, disposed: false,
			confirmations: ['Discard issue report?', 'Discard issue report?'], closeVetoes: 2,
		});
	});

	for (const failure of ['creation', 'mount'] as const) {
		test(`does not veto shutdown because reporter ${failure} failed while it was opening`, async () => {
			const { service, instantiation, controls, windows, inputs, confirmations, shutdown } = createService();
			controls.createGate = new DeferredPromise<void>();
			const error = new Error(`${failure} failed`);
			if (failure === 'creation') {
				controls.createError = error;
			} else {
				instantiation.stubInstance(IssueReporterController, { setInput: () => { throw error; }, dispose: () => { } });
			}
			const opening = service.openReporter(data());
			const rejected = assert.rejects(opening, error);
			await timeout(0);
			const quitting = shutdown(ShutdownReason.QUIT);
			await controls.createGate.complete();
			await rejected;
			assert.deepStrictEqual({ quitting: await quitting, confirmations, disposed: inputs()[0].isDisposed(), openWindows: windows.filter(window => window.frame.isConnected).length }, {
				quitting: { vetoed: false, participants: 1 }, confirmations: [], disposed: true, openWindows: 0,
			});
		});
	}

	test('waits for a reporter being created without vetoing an untouched draft', async () => {
		const { service, controls, inputs, windows, shutdown } = createService();
		controls.createGate = new DeferredPromise<void>();
		controls.confirm = false;
		const opening = service.openReporter(data());
		await timeout(0);
		const closing = shutdown(ShutdownReason.QUIT);
		await controls.createGate.complete();
		await opening;
		assert.deepStrictEqual({ result: await closing, disposed: inputs()[0].isDisposed(), registered: windows[0].hasVetoListener }, {
			result: { vetoed: false, participants: 1 }, disposed: true, registered: false,
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
		const { service, windows, main, addGroup, confirmations, inputs } = createService();
		const other = store.add(new class extends EditorInput { override readonly typeId = 'unrelated'; override readonly resource = undefined; }());
		main.editors.push(other);
		const group = addGroup(20);
		group.editors.push(other);
		await service.openReporter(data());
		editDraft(inputs()[0]);
		windows[0].window.close();
		await timeout(0);
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: other.isDisposed(), main: main.editors[0] === other, auxiliary: group.editors[0] === other, confirmations }, {
			disposed: false, main: true, auxiliary: true, confirmations: ['Discard issue report?'],
		});
	});

	test('reveals only the reporter after styles settle without blocking native input focus', async () => {
		const { service, windows, inputs } = createService();
		await service.openReporter(data());
		const window = windows[0];
		const editor = inputs()[0].descriptionInput;
		editor.focus();
		const pending = { opacity: window.container.style.opacity, focused: window.document.activeElement === editor, mounted: window.container.contains(editor) };
		await window.stylesReady.complete();
		assert.deepStrictEqual({ pending, ready: { opacity: window.container.style.opacity, focused: window.document.activeElement === editor } }, {
			pending: { opacity: '0', focused: true, mounted: true }, ready: { opacity: '', focused: true },
		});
	});

	test('does not reveal a disposed reporter when styles settle', async () => {
		const { service, windows, inputs } = createService();
		await service.openReporter(data());
		const window = windows[0];
		service.dispose();
		await window.stylesReady.complete();
		assert.deepStrictEqual({ opacity: window.container.style.opacity, disposed: inputs()[0].isDisposed(), hostDisposals: window.disposeCalls }, {
			opacity: '0', disposed: true, hostDisposals: 1,
		});
	});

	test('handles close during initialization before styles settle', async () => {
		const { service, controls, windows, confirmations, inputs } = createService();
		controls.closeOnRegister = true;
		await service.openReporter(data());
		assert.deepStrictEqual({ closed: await windows[0].lastClose, styled: windows[0].stylesReady.isSettled, confirmations, disposed: inputs()[0].isDisposed() }, {
			closed: true, styled: false, confirmations: [], disposed: true,
		});
	});

	for (const discard of [false, true]) {
		test(`coordinates another request with ${discard ? 'discard' : 'cancellation'}`, async () => {
			const { service, controls, windows, inputs, confirmStarted } = createService();
			await service.openReporter(data());
			editDraft(inputs()[0]);
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

	test('cleans failed form initialization and allows a fresh report', async () => {
		const { service, instantiation, windows, inputs } = createService();
		instantiation.stubInstance(IssueReporterController, { setInput: () => { throw new Error('Mount failed'); }, dispose: () => { } });
		await assert.rejects(service.openReporter(data()), /Mount failed/);
		await windows[0].lastClose;
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), closeRegistered: windows[0].hasVetoListener }, { disposed: true, closeRegistered: false });
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
		await timeout(0);
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
		await timeout(0);
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
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), mounted: windows[0].container.children.length, live: !!IssueReporterController.getAnyLiveInstance(), connected: windows[0].frame.isConnected, disposals: windows[0].disposeCalls }, {
			disposed: true, mounted: 0, live: false, connected: false, disposals: 1,
		});
	});

	test('service disposal closes a mounted auxiliary and ignores late capture work', async () => {
		const { service, windows, inputs, source, controls, screenshotStarted, writes } = createService();
		controls.screenshotGate = new DeferredPromise<string | undefined>();
		await service.openReporter(data());
		const wizard = IssueReporterController.getAnyLiveInstance()!.getWizard()!;
		wizard.triggerCaptureScreenshot();
		await screenshotStarted.p;
		service.dispose();
		await controls.screenshotGate.complete(issueReporterImageFixture);
		await timeout(0);
		await service.openReporter(data());
		assert.deepStrictEqual({
			disposed: inputs()[0].isDisposed(), connected: windows[0].frame.isConnected, disposals: windows[0].disposeCalls,
			registered: windows[0].hasVetoListener, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length,
			live: !!IssueReporterController.getAnyLiveInstance(), windows: windows.length, writes,
		}, { disposed: true, connected: false, disposals: 1, registered: false, captureBars: 0, live: false, windows: 1, writes: [] });
	});

	test('host-originated auxiliary disposal does not recursively dispose it or complete a pending close', async () => {
		const { service, windows, inputs, source, controls, confirmStarted } = createService();
		await service.openReporter(data());
		editDraft(inputs()[0]);
		controls.confirmGate = new DeferredPromise<void>();
		windows[0].window.close();
		await confirmStarted.p;
		windows[0].dispose();
		await controls.confirmGate.complete();
		assert.deepStrictEqual({
			closed: await windows[0].lastClose, disposed: inputs()[0].isDisposed(), disposals: windows[0].disposeCalls,
			connected: windows[0].frame.isConnected, registered: windows[0].hasVetoListener, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length,
		}, { closed: false, disposed: true, disposals: 1, connected: false, registered: false, captureBars: 0 });
	});

	test('discard cancels an attachment-free submission waiting for its GitHub session', async () => {
		const { service, windows, inputs, previews } = createService();
		const token = new DeferredPromise<string>();
		const submission = spy(service, 'submitIssue');
		await service.openReporter(data({ getGitHubAccessToken: () => token.p }));
		windows[0].container.querySelector<HTMLElement>('.wizard-preview')!.click();
		assert.strictEqual(submission.callCount, 1);
		windows[0].window.close();
		await windows[0].lastClose;
		const cancelled = assert.rejects(submission.firstCall.returnValue, isCancellationError);
		await token.complete('late-token');
		await cancelled;
		assert.deepStrictEqual({ disposed: inputs()[0].isDisposed(), cancelled: inputs()[0].submissionSignal.aborted, previews }, {
			disposed: true, cancelled: true, previews: [],
		});
	});

	test('native unload releases the auxiliary host, source capture bar and draft before reopening', async () => {
		const { service, windows, inputs, source } = createService();
		await service.openReporter(data());
		windows[0].fireUnload();
		const closed = { disposed: inputs()[0].isDisposed(), registered: windows[0].hasVetoListener, connected: windows[0].frame.isConnected, captureBars: source.querySelectorAll('.issue-reporter-floating-bar').length };
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
		editDraft(inputs()[0]);
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
		const ordinary = store.add(new TestAuxiliaryWindow(200, false));
		const dispatched: string[] = [];
		store.add(addDisposableListener(mainWindow, 'keydown', () => dispatched.push('source')));
		store.add(addDisposableListener(ordinary.document.defaultView!, 'keydown', () => dispatched.push('ordinary auxiliary')));
		for (const target of [source, ordinary.container]) {
			target.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: !isMacintosh, metaKey: isMacintosh, bubbles: true }));
		}
		assert.deepStrictEqual(dispatched, ['source', 'ordinary auxiliary']);
	});

	for (const field of ['description', 'title'] as const) {
		test(`runs resolved editing shortcuts in the reporter ${field} without editing the source window`, async () => {
			const { service, windows, inputs, source, keybindings, opens } = createService();
			keybindings.bindings = [
				{ command: 'undo', key: KeyMod.CtrlCmd | KeyCode.KeyZ },
				{ command: 'redo', key: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ },
				{ command: 'editor.action.selectAll', key: KeyMod.CtrlCmd | KeyCode.KeyA },
			];
			await service.openReporter(data({ issueTitle: '', issueBody: '' }));
			const sourceInput = source.appendChild($<HTMLTextAreaElement>('textarea'));
			sourceInput.focus();
			sourceInput.ownerDocument.execCommand('insertText', false, 'source edit');
			const input = field === 'description' ? inputs()[0].descriptionInput : windows[0].container.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
			const text = 'report edit';
			input.focus();
			input.ownerDocument.execCommand('insertText', false, text);
			const commands = spy(windows[0].document, 'execCommand');
			store.add(toDisposable(() => commands.restore()));
			const send = (keyCode: number, key: string, modifiers: KeyboardEventInit = { metaKey: isMacintosh, ctrlKey: !isMacintosh }, target: HTMLElement = input) => {
				const event = new KeyboardEvent('keydown', { ...modifiers, keyCode, key, bubbles: true, cancelable: true });
				target.dispatchEvent(event);
				return { prevented: event.defaultPrevented, value: input.value, selection: [input.selectionStart, input.selectionEnd] };
			};
			const selected = send(65, 'a');
			const undone = send(90, 'z');
			const exhausted = send(90, 'z');
			const redone = send(90, 'z', { metaKey: isMacintosh, ctrlKey: !isMacintosh, shiftKey: true });
			keybindings.bindings = [
				{ command: 'editor.action.selectAll', key: KeyMod.Alt | KeyCode.F8 },
				{ command: 'undo', key: KeyMod.Alt | KeyCode.F9 },
				{ command: 'redo', key: KeyMod.Alt | KeyCode.F10 },
				{ command: 'workbench.action.quickOpen', key: KeyMod.CtrlCmd | KeyCode.KeyA },
			];
			input.setSelectionRange(3, 3);
			const remapped = send(65, 'a');
			const customized = [send(119, 'F8', { altKey: true }), send(120, 'F9', { altKey: true }), send(121, 'F10', { altKey: true })];
			const preview = windows[0].container.querySelector<HTMLElement>('.wizard-preview')!;
			preview.focus();
			const outsideTextInput = send(120, 'F9', { altKey: true }, preview);
			assert.deepStrictEqual({
				selected, undone, exhausted, redone, remapped, customized,
				outsideTextInput: { prevented: outsideTextInput.prevented, value: outsideTextInput.value },
				commands: commands.args.map(([command]) => command), source: sourceInput.value, opens,
			}, {
				selected: { prevented: true, value: text, selection: [0, text.length] },
				undone: { prevented: true, value: '', selection: [0, 0] },
				exhausted: { prevented: true, value: '', selection: [0, 0] },
				redone: { prevented: true, value: text, selection: [text.length, text.length] },
				remapped: { prevented: false, value: text, selection: [3, 3] },
				customized: [
					{ prevented: true, value: text, selection: [0, text.length] },
					{ prevented: true, value: '', selection: [0, 0] },
					{ prevented: true, value: text, selection: [text.length, text.length] },
				],
				outsideTextInput: { prevented: false, value: text },
				commands: ['selectAll', 'undo', 'undo', 'redo', 'selectAll', 'undo', 'redo'], source: 'source edit', opens: [],
			});
		});
	}

	test('routes configured zoom commands only to the reporter and blocks other resolved commands', async () => {
		const { service, windows, inputs, configuration, keybindings, opens } = createService();
		await configuration.setUserConfiguration('window.zoomPerWindow', false);
		await configuration.setUserConfiguration('window.zoomLevel', 2);
		keybindings.bindings = [
			{ command: 'workbench.action.zoomIn', key: KeyMod.CtrlCmd | KeyCode.Equal },
			{ command: 'workbench.action.zoomOut', key: KeyMod.CtrlCmd | KeyCode.Minus },
			{ command: 'workbench.action.zoomReset', key: KeyMod.CtrlCmd | KeyCode.Numpad0 },
			{ command: 'workbench.action.quickOpen', key: KeyMod.CtrlCmd | KeyCode.KeyP },
			{ command: 'workbench.action.splitEditorRight', key: KeyMod.CtrlCmd | KeyCode.Backslash },
		];
		await service.openReporter(data());
		const sourceLevel = getZoomLevel(mainWindow);
		const target = windows[0].window;
		const initialLevel = getZoomLevel(target);
		const send = (keyCode: number, key: string, modifiers: KeyboardEventInit = { ctrlKey: !isMacintosh, metaKey: isMacintosh }) => {
			const event = new KeyboardEvent('keydown', { ...modifiers, key, keyCode, bubbles: true, cancelable: true });
			inputs()[0].descriptionInput.dispatchEvent(event);
			return { prevented: event.defaultPrevented, level: getZoomLevel(target) };
		};
		const ordinary = [send(187, '='), send(189, '-'), send(96, '0'), send(80, 'p'), send(220, '\\')];
		keybindings.bindings = [
			{ command: 'workbench.action.zoomIn', key: KeyMod.Alt | KeyCode.F8 },
			{ command: 'workbench.action.zoomOut', key: KeyMod.Alt | KeyCode.F9 },
			{ command: 'workbench.action.zoomReset', key: KeyMod.Alt | KeyCode.F10 },
			{ command: 'workbench.action.quickOpen', key: KeyMod.CtrlCmd | KeyCode.Equal },
		];
		const customized = [send(119, 'F8', { altKey: true }), send(120, 'F9', { altKey: true }), send(121, 'F10', { altKey: true }), send(187, '=')];
		assert.deepStrictEqual({ ordinary, customized, sourceUnchanged: getZoomLevel(mainWindow) === sourceLevel, opens }, {
			ordinary: [{ prevented: true, level: initialLevel + 1 }, { prevented: true, level: initialLevel }, { prevented: true, level: 2 }, { prevented: false, level: 2 }, { prevented: false, level: 2 }],
			customized: [{ prevented: true, level: 3 }, { prevented: true, level: 2 }, { prevented: true, level: 2 }, { prevented: false, level: 2 }],
			sourceUnchanged: true, opens: [],
		});
	});

	test('a customized zoom shortcut is not stolen by the capture-phase screenshot handler', async () => {
		const { service, instantiation, windows, inputs, keybindings } = createService();
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async id => { commands.push(id); } });
		store.add(instantiation.createInstance(IssueReporterOpenStateContribution));
		keybindings.bindings = [
			{ command: 'workbench.action.zoomIn', key: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS },
			{ command: ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, key: KeyMod.Alt | KeyCode.F8 },
		];
		await service.openReporter(data());
		const editor = inputs()[0].descriptionInput;
		const initialLevel = getZoomLevel(windows[0].window);
		const zoom = new KeyboardEvent('keydown', { key: 's', keyCode: 83, ctrlKey: !isMacintosh, metaKey: isMacintosh, shiftKey: true, bubbles: true, cancelable: true });
		editor.dispatchEvent(zoom);
		const capture = new KeyboardEvent('keydown', { key: 'F8', keyCode: 119, altKey: true, bubbles: true, cancelable: true });
		editor.dispatchEvent(capture);
		assert.deepStrictEqual({ zoom: getZoomLevel(windows[0].window), zoomPrevented: zoom.defaultPrevented, capturePrevented: capture.defaultPrevented, commands }, {
			zoom: initialLevel + 1, zoomPrevented: true, capturePrevented: true, commands: [ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID],
		});
	});

	test('completes capture chords through the dispatcher before ordinary typing', async () => {
		const { service, instantiation, source } = createService();
		const commands: string[] = [];
		instantiation.stub(ICommandService, { executeCommand: async id => { commands.push(id); } });
		const mapper = new MockKeybindingService();
		const binding = decodeKeybinding(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyS), OS)!;
		const resolver = new KeybindingResolver([], [new ResolvedKeybindingItem(mapper.resolveKeybinding(binding)[0], ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID, undefined, undefined, false, null, false)], () => { });
		const keybindings = store.add(new class extends AbstractKeybindingService {
			protected override _getResolver() { return resolver; }
			protected override _documentHasFocus() { return true; }
			override resolveKeybinding(keybinding: Keybinding) { return mapper.resolveKeybinding(keybinding); }
			override resolveKeyboardEvent(event: IKeyboardEvent) { return mapper.resolveKeyboardEvent(event); }
			override resolveUserBinding() { return []; }
			override registerSchemaContribution() { return Disposable.None; }
			override enableKeybindingHoldMode() { return undefined; }
			override _dumpDebugInfo() { return ''; }
			override _dumpDebugInfoJSON() { return ''; }
		}(instantiation.get(IContextKeyService), instantiation.get(ICommandService), NullTelemetryService, new class extends mock<INotificationService>() {
			override status() { return { close: () => { } }; }
		}(), store.add(new NullLogService())));
		instantiation.stub(IKeybindingService, keybindings);
		store.add(instantiation.createInstance(IssueReporterOpenStateContribution));
		store.add(addDisposableListener(mainWindow, 'keydown', event => {
			const key = new StandardKeyboardEvent(event);
			if (keybindings.dispatchEvent(key, key.target ?? source)) {
				event.preventDefault();
			}
		}));
		await service.openReporter(data());
		const editor = source.appendChild($<HTMLTextAreaElement>('textarea'));
		editor.focus();
		const press = (key: string, keyCode: number, primary = false) => {
			const event = new KeyboardEvent('keydown', { key, keyCode, ctrlKey: primary && !isMacintosh, metaKey: primary && isMacintosh, bubbles: true, cancelable: true });
			editor.dispatchEvent(event);
			return event.defaultPrevented;
		};
		const prefixPrevented = press('k', 75, true);
		const chordStarted = keybindings.inChordMode;
		const capturePrevented = press('s', 83, true);
		const afterCapture = { chord: keybindings.inChordMode, imeEnabled: IME.enabled };
		const typingPrevented = press('x', 88);
		if (!typingPrevented) {
			editor.ownerDocument.execCommand('insertText', false, 'x');
		}
		assert.deepStrictEqual({ prefixPrevented, chordStarted, capturePrevented, afterCapture, typingPrevented, text: editor.value, commands }, {
			prefixPrevented: true, chordStarted: true, capturePrevented: true, afterCapture: { chord: false, imeEnabled: true }, typingPrevented: false, text: 'x', commands: [ISSUE_REPORTER_CAPTURE_SCREENSHOT_COMMAND_ID],
		});
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

	test('keeps native text, selection and attachments when an editor tab is detached, without retaining undo', async () => {
		const { instantiation, createInput, source, main } = createService('editor');
		class TestPane extends IssueReporterEditorPane {
			mount(container: HTMLElement): void { this.createEditor(container); }
		}
		const pane = store.add(instantiation.createInstance(TestPane, main));
		pane.mount(source);
		const input = createInput();
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		const controller = IssueReporterController.getAnyLiveInstance();
		input.savedAttachments = [{ id: 'kept-file', kind: 'file', file: { filePath: '/test/notes.txt', name: 'notes.txt', mimeType: 'text/plain' } }];
		input.descriptionInput.focus();
		input.descriptionInput.select();
		document.execCommand('insertText', false, 'Edited description');
		input.descriptionInput.setSelectionRange(2, 6);
		pane.clearInput();
		const page = source.querySelector<HTMLElement>('.issue-reporter-editor-tab')!;
		page.remove();
		source.appendChild(page);
		await pane.setInput(input, undefined, {}, CancellationToken.None);
		const restored = { same: controller === IssueReporterController.getAnyLiveInstance(), text: input.descriptionInput.value, selection: [input.descriptionInput.selectionStart, input.descriptionInput.selectionEnd], attachments: controller?.getWizard()?.getAttachments().map(attachment => attachment.id) };
		input.descriptionInput.focus();
		document.execCommand('undo');
		assert.deepStrictEqual({ restored, undone: input.descriptionInput.value }, {
			restored: { same: true, text: 'Edited description', selection: [2, 6], attachments: ['kept-file'] }, undone: 'Edited description',
		});
	});

	test('leaves classic reporter opening on the original path', async () => {
		const { service, opens, windowOptions, osReads } = createService('window', false);
		const initial = data();
		await service.openReporter(initial);
		assert.deepStrictEqual({ legacy: service.legacy, editorOpens: opens.length, windows: windowOptions.length, osReads: osReads() }, { legacy: [initial], editorOpens: 0, windows: 0, osReads: 1 });
	});
});
