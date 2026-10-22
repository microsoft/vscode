/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfirmResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService, _util } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IAuxiliaryWindow, IAuxiliaryWindowCloseHandler, IAuxiliaryWindowService } from '../../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IAuxiliaryEditorPart, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IssueReporterEditorInput } from '../../browser/issueReporterEditorInput.js';
import { IssueReporterData, IssueSource } from '../../common/issue.js';
import { NativeIssueFormService } from '../../electron-browser/nativeIssueFormService.js';
import '../../electron-browser/issue.contribution.js';

class TestNativeIssueFormService extends NativeIssueFormService {
	readonly legacy: IssueReporterData[] = [];

	override async openAuxIssueReporterLegacy(data: IssueReporterData): Promise<void> {
		this.legacy.push(data);
	}
}

suite('NativeIssueFormService reporter windows', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers an application-scoped window default without a policy or experiment', () => {
		const setting = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()['issueReporter.wizard.openLocation'];
		assert.deepStrictEqual({ type: setting.type, values: setting.enum, default: setting.default, scope: setting.scope, policy: setting.policy, experiment: setting.experiment }, {
			type: 'string', values: ['editor', 'window'], default: 'window', scope: ConfigurationScope.APPLICATION, policy: undefined, experiment: undefined,
		});
	});

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
		for (const dependency of _util.getServiceDependencies(NativeIssueFormService as typeof NativeIssueFormService & _util.DI_TARGET_OBJ)) {
			if (dependency.id !== IInstantiationService) {
				instantiation.stub(dependency.id, {});
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
		const openStarted = new DeferredPromise<void>();
		const controls: {
			confirm: boolean;
			otherConfirm: boolean;
			confirmGate?: DeferredPromise<void>;
			createGate?: DeferredPromise<void>;
			openGate?: DeferredPromise<void>;
			openError?: Error;
			supported: boolean;
			onOpening?: () => void;
		} = { confirm: true, otherConfirm: true, supported: true };
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

		class TestGroup extends mock<IEditorGroup>() {
			override readonly editors: EditorInput[] = [];
			readonly closeRequests: EditorInput[][] = [];
			override get isEmpty() { return this.editors.length === 0; }
			override get count() { return this.editors.length; }

			constructor(override readonly id: number, override readonly windowId: number) { super(); }

			override async closeEditors(editors: EditorInput[]): Promise<boolean> {
				this.closeRequests.push([...editors]);
				const closable = editors.filter(editor => !editor.hasCapability(EditorInputCapabilities.CannotClose));
				for (const editor of closable) {
					if (editor.closeHandler?.showConfirm() && await editor.closeHandler.confirm([{ editor, groupId: this.id }]) === ConfirmResult.CANCEL) {
						return false;
					}
				}
				for (const editor of closable) {
					const index = this.editors.indexOf(editor);
					if (index !== -1) {
						this.editors.splice(index, 1);
						if (!parts.some(part => part.groups.some(group => group.editors.includes(editor)))) {
							editor.dispose();
						}
					}
				}
				return true;
			}
		}

		class TestPart extends mock<IAuxiliaryEditorPart>() {
			override readonly groups: TestGroup[];
			closeCalls = 0;
			override get activeGroup() { return this.groups[0]; }
			constructor(override readonly windowId: number, groupId = windowId) {
				super();
				this.groups = [new TestGroup(groupId, windowId)];
			}
			override close(): boolean {
				this.closeCalls++;
				if (this.groups.every(group => group.isEmpty)) {
					windows.get(this.windowId)?.unload.fire();
				}
				return true;
			}
		}

		class TestAuxiliaryWindow extends mock<IAuxiliaryWindow>() {
			readonly unload = store.add(new Emitter<void>());
			readonly stylesReady = new DeferredPromise<void>();
			private readonly willDispose = store.add(new Emitter<void>());
			override readonly onUnload = this.unload.event;
			override readonly onWillDispose = this.willDispose.event;
			override readonly whenStylesHaveLoaded = this.stylesReady.p;
			private disposed = false;
			handler: IAuxiliaryWindowCloseHandler | undefined;
			override readonly registerCloseHandler = controls.supported ? (handler: IAuxiliaryWindowCloseHandler) => {
				assert.strictEqual(this.handler, undefined);
				this.handler = handler;
				return toDisposable(() => { this.handler = undefined; });
			} : undefined;

			constructor() {
				super();
				store.add(Event.once(this.onUnload)(() => this.dispose()));
			}

			override dispose(): void {
				if (!this.disposed) {
					this.disposed = true;
					this.willDispose.fire();
					this.unload.dispose();
					this.willDispose.dispose();
				}
			}
		}

		const main = new TestPart(1);
		const parts = [main];
		const windows = new Map<number, TestAuxiliaryWindow>();
		let activeGroup = main.activeGroup;
		let createCalls = 0;
		const opens: { input: IssueReporterEditorInput; group: TestGroup; explicit: boolean; registered: boolean }[] = [];
		const addPart = (windowId: number, groupId?: number) => {
			const part = new TestPart(windowId, groupId);
			parts.push(part);
			activeGroup = part.activeGroup;
			return part;
		};
		instantiation.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override readonly mainPart = main;
			override readonly parts = parts;
			override get groups() { return parts.flatMap(part => part.groups); }
			override get activeGroup() { return activeGroup; }
			override async createAuxiliaryEditorPart() {
				createCalls++;
				await controls.createGate?.p;
				const part = addPart(parts.length + 1);
				windows.set(part.windowId, new TestAuxiliaryWindow());
				return part;
			}
		}());
		instantiation.stub(IAuxiliaryWindowService, { getWindow: id => windows.get(id) });
		instantiation.stub(IEditorService, {
			openEditor: async (input: EditorInput | IUntypedEditorInput, _options?: IEditorOptions | PreferredGroup, preferredGroup?: PreferredGroup) => {
				assert.ok(input instanceof IssueReporterEditorInput);
				const group = preferredGroup ?? activeGroup;
				assert.ok(group instanceof TestGroup);
				opens.push({ input, group, explicit: preferredGroup !== undefined, registered: !!windows.get(group.windowId)?.handler });
				void openStarted.complete();
				controls.onOpening?.();
				await controls.openGate?.p;
				if (controls.openError) {
					throw controls.openError;
				}
				if (!group.editors.includes(input)) {
					group.editors.push(store.add(input));
				}
				input.hasUserInputFn ??= () => !!input.data?.issueBody;
				return undefined;
			},
		});
		const service = store.add(instantiation.createInstance(TestNativeIssueFormService));
		const otherEditor = (name = 'Other draft', cannotClose = false) => store.add(new class extends EditorInput {
			override readonly typeId = name;
			override readonly resource = undefined;
			override get capabilities() { return cannotClose ? EditorInputCapabilities.CannotClose : EditorInputCapabilities.None; }
			override readonly closeHandler = {
				showConfirm: () => true,
				confirm: async () => {
					confirmations.push(name);
					return controls.otherConfirm ? ConfirmResult.DONT_SAVE : ConfirmResult.CANCEL;
				},
			};
		}());
		return {
			service, controls, configuration, confirmations, confirmStarted, openStarted, opens, parts, main, windows, addPart, otherEditor,
			createInput: (initial = data()) => store.add(instantiation.createInstance(IssueReporterEditorInput, initial)),
			addGroup: (part: TestPart) => {
				const group = new TestGroup(100 + part.groups.length, part.windowId);
				part.groups.push(group);
				return group;
			},
			createCalls: () => createCalls, osReads: () => osReads,
		};
	}

	for (const isSessionsWindow of [false, true]) {
		test(`defaults fresh ${isSessionsWindow ? 'Agents' : 'Editor'} reports to an owned auxiliary window`, async () => {
			const { service, opens, parts, createCalls, osReads } = createService();
			const initial = data({ isSessionsWindow });
			await service.openReporter(initial);
			assert.deepStrictEqual({
				created: createCalls(), target: opens[0].group.windowId, registeredBeforeMount: opens[0].registered,
				sameData: opens[0].input.data === initial, mainEditors: parts[0].activeGroup.editors.length, osReads: osReads(),
			}, { created: 1, target: 2, registeredBeforeMount: true, sameData: true, mainEditors: 0, osReads: 0 });
		});

		test(`preserves editor routing for ${isSessionsWindow ? 'Agents' : 'Editor'} with the editor preference`, async () => {
			const { service, opens, addPart, createCalls } = createService('editor');
			addPart(20);
			await service.openReporter(data({ isSessionsWindow }));
			assert.deepStrictEqual({ created: createCalls(), target: opens[0].group.windowId, explicit: opens[0].explicit }, {
				created: 0, target: isSessionsWindow ? 1 : 20, explicit: isSessionsWindow,
			});
		});
	}

	for (const location of ['main', 'modal', 'auxiliary'] as const) {
		test(`reuses the existing ${location} report without replacing its draft or moving it`, async () => {
			const { service, main, addPart, createInput, opens, createCalls, configuration } = createService('window');
			const group = location === 'main' ? main.activeGroup : addPart(location === 'modal' ? 1 : 20, 20).activeGroup;
			const input = createInput();
			group.editors.push(input);
			await service.openReporter(data({ issueTitle: 'Replacement title' }));
			await configuration.setUserConfiguration('issueReporter.wizard.openLocation', 'editor');
			await service.openReporter(data({ issueTitle: 'Another title' }));
			assert.deepStrictEqual({
				created: createCalls(), sameInput: opens.every(open => open.input === input), sameGroup: opens.every(open => open.group === group),
				title: input.data?.issueTitle, body: input.data?.issueBody,
			}, { created: 0, sameInput: true, sameGroup: true, title: 'Original report', body: 'Original description' });
		});
	}

	test('coalesces concurrent requests while an auxiliary window is being created', async () => {
		const { service, controls, opens, createCalls } = createService();
		controls.createGate = new DeferredPromise<void>();
		const first = service.openReporter(data());
		const second = service.openReporter(data({ issueTitle: 'Second report' }));
		await timeout(0);
		const pendingCreates = createCalls();
		await controls.createGate.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({ pendingCreates, created: createCalls(), inputs: opens.length, title: opens[0].input.data?.issueTitle }, { pendingCreates: 1, created: 1, inputs: 1, title: 'Original report' });
	});

	test('installs the singleton guard before synchronous editor-opening callbacks', async () => {
		const { service, controls, opens } = createService('editor');
		let reentrant: Promise<void> | undefined;
		controls.onOpening = () => {
			controls.onOpening = undefined;
			reentrant = service.openReporter(data({ issueTitle: 'Reentrant request' }));
		};
		await service.openReporter(data());
		await reentrant;
		assert.deepStrictEqual(opens.map(open => open.input.data?.issueTitle), ['Original report']);
	});

	test('window cancellation preserves the report and discard closes it without rehoming', async () => {
		const { service, controls, opens, windows, main, parts, confirmations } = createService();
		await service.openReporter(data());
		const window = windows.get(2)!;
		controls.confirm = false;
		const first = window.handler!.close();
		const repeated = window.handler!.close();
		const cancelled = await first;
		const retained = { sameDecision: first === repeated, result: cancelled, disposed: opens[0].input.isDisposed(), count: opens[0].group.count };
		controls.confirm = true;
		const discarded = await window.handler!.close();
		const registeredAfterInputDisposal = !!window.handler;
		const ready = window.handler!.isReadyToClose();
		window.unload.fire();
		assert.deepStrictEqual({
			retained, discarded, ready, confirmations, registeredAfterInputDisposal, registeredAfterUnload: !!window.handler,
			disposed: opens[0].input.isDisposed(), mainEditors: main.activeGroup.count, rehomeCalls: parts[1].closeCalls,
		}, {
			retained: { sameDecision: true, result: false, disposed: false, count: 1 }, discarded: true, ready: true,
			confirmations: ['Discard issue report?', 'Discard issue report?'], registeredAfterInputDisposal: true, registeredAfterUnload: false,
			disposed: true, mainEditors: 0, rehomeCalls: 0,
		});
	});

	test('does not force an extra reporter prompt for a report without unsaved input', async () => {
		const { service, opens, windows, confirmations } = createService();
		await service.openReporter(data({ issueBody: '', issueTitle: '' }));
		const closed = await windows.get(2)!.handler!.close();
		assert.deepStrictEqual({ closed, confirmations, disposed: opens[0].input.isDisposed() }, { closed: true, confirmations: [], disposed: true });
	});

	test('does not confirm the report again when closing an empty window after tab close', async () => {
		const { service, opens, windows, confirmations } = createService();
		await service.openReporter(data());
		await opens[0].group.closeEditors([opens[0].input]);
		const closed = await windows.get(2)!.handler!.close();
		assert.deepStrictEqual({ closed, confirmations }, { closed: true, confirmations: ['Discard issue report?'] });
	});

	test('uses normal confirmations for other editors and keeps the window on cancellation', async () => {
		const { service, controls, opens, windows, otherEditor, confirmations } = createService();
		await service.openReporter(data());
		const other = otherEditor();
		opens[0].group.editors.push(other);
		controls.otherConfirm = false;
		const closed = await windows.get(2)!.handler!.close();
		assert.deepStrictEqual({ closed, confirmations, editors: opens[0].group.count, disposed: [opens[0].input.isDisposed(), other.isDisposed()] }, {
			closed: false, confirmations: ['Discard issue report?', 'Other draft'], editors: 2, disposed: [false, false],
		});
	});

	for (const placement of ['same group', 'new group'] as const) {
		test(`never closes a new editor opened in a ${placement} while confirming`, async () => {
			const { service, controls, opens, windows, otherEditor, parts, addGroup, confirmStarted, confirmations } = createService();
			await service.openReporter(data());
			controls.confirmGate = new DeferredPromise<void>();
			const handler = windows.get(2)!.handler!;
			const closing = handler.close();
			await confirmStarted.p;
			const other = otherEditor('New draft');
			const group = placement === 'same group' ? opens[0].group : addGroup(parts[1]);
			group.editors.push(other);
			await controls.confirmGate.complete();
			const closed = await closing;
			assert.deepStrictEqual({ closed, ready: handler.isReadyToClose(), confirmations, newInputRetained: group.editors.includes(other), disposed: other.isDisposed() }, {
				closed: false, ready: false, confirmations: ['Discard issue report?'], newInputRetained: true, disposed: false,
			});
		});
	}

	test('does not close an input at its new location if it moves during confirmation', async () => {
		const { service, controls, opens, windows, main, confirmStarted } = createService();
		await service.openReporter(data());
		controls.confirmGate = new DeferredPromise<void>();
		const closing = windows.get(2)!.handler!.close();
		await confirmStarted.p;
		const input = opens[0].input;
		opens[0].group.editors.splice(0, 1);
		main.activeGroup.editors.push(input);
		await controls.confirmGate.complete();
		await closing;
		assert.deepStrictEqual({ mainInput: main.activeGroup.editors[0] === input, disposed: input.isDisposed(), oldGroup: opens[0].group.count }, { mainInput: true, disposed: false, oldGroup: 0 });
	});

	test('keeps CannotClose editors without bypassing their protection', async () => {
		const { service, opens, windows, otherEditor } = createService();
		await service.openReporter(data());
		const protectedEditor = otherEditor('Protected', true);
		opens[0].group.editors.push(protectedEditor);
		const closed = await windows.get(2)!.handler!.close();
		assert.deepStrictEqual({ closed, retained: opens[0].group.editors.includes(protectedEditor), disposed: protectedEditor.isDisposed() }, { closed: false, retained: true, disposed: false });
	});

	test('waits for initial input adoption before handling an early window close', async () => {
		const { service, controls, opens, windows, openStarted, confirmations } = createService();
		controls.openGate = new DeferredPromise<void>();
		const opening = service.openReporter(data());
		await openStarted.p;
		const handler = windows.get(2)!.handler!;
		const closing = handler.close();
		const before = { ready: handler.isReadyToClose(), prompts: confirmations.length };
		await controls.openGate.complete();
		await opening;
		const closed = await closing;
		assert.deepStrictEqual({ before, closed, confirmations, disposed: opens[0].input.isDisposed(), remaining: opens[0].group.count }, {
			before: { ready: false, prompts: 0 }, closed: true, confirmations: ['Discard issue report?'], disposed: true, remaining: 0,
		});
	});

	test('adopts and can discard the report while stylesheet readiness is pending', async () => {
		const { service, opens, windows, confirmations } = createService();
		await service.openReporter(data());
		const window = windows.get(2)!;
		const adopted = opens[0].group.editors.includes(opens[0].input);
		const closed = await window.handler!.close();
		assert.deepStrictEqual({ adopted, closed, stylesReady: window.stylesReady.isSettled, confirmations, disposed: opens[0].input.isDisposed() }, {
			adopted: true, closed: true, stylesReady: false, confirmations: ['Discard issue report?'], disposed: true,
		});
	});

	test('does not adopt unrelated editors into a close that is waiting for the initial report', async () => {
		const { service, controls, opens, windows, openStarted, otherEditor, confirmations } = createService();
		controls.openGate = new DeferredPromise<void>();
		const opening = service.openReporter(data());
		await openStarted.p;
		const handler = windows.get(2)!.handler!;
		const closing = handler.close();
		const other = otherEditor('New during initialization');
		opens[0].group.editors.push(other);
		await controls.openGate.complete();
		await opening;
		const closed = await closing;
		assert.deepStrictEqual({
			closed, ready: handler.isReadyToClose(), confirmations,
			reportDisposed: opens[0].input.isDisposed(), otherDisposed: other.isDisposed(), otherRetained: opens[0].group.editors.includes(other),
		}, { closed: false, ready: false, confirmations: ['Discard issue report?'], reportDisposed: true, otherDisposed: false, otherRetained: true });
	});

	for (const discard of [false, true]) {
		test(`coordinates another Report Issue request with ${discard ? 'discard' : 'cancellation'}`, async () => {
			const { service, controls, opens, windows, confirmStarted, createCalls } = createService();
			await service.openReporter(data());
			controls.confirmGate = new DeferredPromise<void>();
			controls.confirm = discard;
			const closing = windows.get(2)!.handler!.close();
			await confirmStarted.p;
			const reopening = service.openReporter(data({ issueTitle: 'New requested report' }));
			await controls.confirmGate.complete();
			await closing;
			await reopening;
			assert.deepStrictEqual({ created: createCalls(), oldDisposed: opens[0].input.isDisposed(), title: opens.at(-1)!.input.data?.issueTitle, newDisposed: opens.at(-1)!.input.isDisposed() }, {
				created: discard ? 2 : 1, oldDisposed: discard, title: discard ? 'New requested report' : 'Original report', newDisposed: false,
			});
		});
	}

	for (const failure of ['missing close handler', 'editor open'] as const) {
		test(`cleans only an unadopted input and empty window after ${failure} failure`, async () => {
			const { service, controls, opens, parts, main } = createService();
			controls.supported = failure !== 'missing close handler';
			controls.openError = failure === 'editor open' ? new Error('Opening failed') : undefined;
			await assert.rejects(service.openReporter(data()));
			assert.deepStrictEqual({ mainEditors: main.activeGroup.count, cleanupCloses: parts[1].closeCalls, adopted: parts[1].activeGroup.count, openedInputDisposed: opens[0]?.input.isDisposed() }, {
				mainEditors: 0, cleanupCloses: 1, adopted: 0, openedInputDisposed: failure === 'editor open' ? true : undefined,
			});
		});
	}

	test('does not dispose an already-adopted report when editor initialization fails', async () => {
		const { service, controls, opens, parts, windows } = createService();
		controls.onOpening = () => {
			const open = opens.at(-1)!;
			open.group.editors.push(store.add(open.input));
		};
		controls.openError = new Error('Failure after adoption');
		await assert.rejects(service.openReporter(data()));
		assert.deepStrictEqual({
			disposed: opens[0].input.isDisposed(), retained: opens[0].group.editors.includes(opens[0].input),
			cleanupCloses: parts[1].closeCalls, registered: !!windows.get(2)!.handler,
		}, { disposed: false, retained: true, cleanupCloses: 0, registered: true });
	});

	test('leaves classic reporter opening on the original OS-properties and auxiliary path', async () => {
		const { service, opens, createCalls, osReads } = createService('window', false);
		const initial = data();
		await service.openReporter(initial);
		assert.deepStrictEqual({ legacy: service.legacy, editorOpens: opens.length, newWindows: createCalls(), osReads: osReads() }, {
			legacy: [initial], editorOpens: 0, newWindows: 0, osReads: 1,
		});
	});
});
