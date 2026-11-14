/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, fail, strictEqual } from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TerminalLocation, TitleEventSource, type ITerminalBackend, type TerminalIcon } from '../../../../../platform/terminal/common/terminal.js';
import { TerminalCapabilityStore } from '../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { ITerminalEditingService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService, terminalEditorId } from '../../browser/terminal.js';
import { IDecorationsService, IResourceDecorationChangeEvent } from '../../../../services/decorations/common/decorations.js';
import { IResourceLabel } from '../../../../browser/labels.js';
import { TerminalService } from '../../browser/terminalService.js';
import { TerminalTabList } from '../../browser/terminalTabsList.js';
import { TerminalEditorInput } from '../../browser/terminalEditorInput.js';
import { TerminalEditorService } from '../../browser/terminalEditorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITerminalProfileService, TERMINAL_CONFIG_SECTION } from '../../common/terminal.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { createEditorPart, registerTestEditor, TestEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import type { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { DecorationsService } from '../../../../services/decorations/browser/decorationsService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { OpenEditorsView } from '../../../files/browser/views/openEditorsView.js';
import { CloseGroupAction, SaveAllInGroupAction } from '../../../files/browser/fileActions.js';
import { CloseEditorAction, UnpinEditorAction } from '../../../../browser/parts/editor/editorActions.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';

suite('Workbench - TerminalService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	let terminalService: TerminalService;
	let configurationService: TestConfigurationService;
	let dialogService: TestDialogService;
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let groupDisposed: Emitter<ITerminalInstance>;
	let editorDisposed: Emitter<ITerminalInstance>;
	let instanceCreated: Emitter<ITerminalInstance>;
	let clearedResources: URI[];

	function createInstance(instanceId: number) {
		const disposed = store.add(new Emitter<ITerminalInstance>());
		const exited = store.add(new Emitter<number | undefined>());
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly instanceId = instanceId;
			override readonly resource = URI.parse(`vscode-terminal:/test/${instanceId}`);
			override readonly store = store.add(new DisposableStore());
			override readonly capabilities = store.add(new TerminalCapabilityStore());
			override readonly statusList = new class extends mock<ITerminalInstance['statusList']>() {
				override readonly onDidChangePrimaryStatus = Event.None;
			};
			override readonly onDisposed = disposed.event;
			override readonly onDimensionsChanged = Event.None;
			override readonly onDidFocus = Event.None;
			override readonly onDidBlur = Event.None;
			override readonly onRequestAddInstanceToGroup = Event.None;
			override readonly onDidChangeShellType = Event.None;
			override readonly onExit = exited.event;
			override readonly shellLaunchConfig = {};
			override readonly waitOnExit = false;
			override readonly onTitleChanged = Event.None;
			override readonly onIconChanged = Event.None;
			override isDisposed = false;
			override async focusWhenReady(): Promise<void> { }
			override detachFromElement(): void { }
			override setParentContextKeyService(): void { }
			override dispose(): void {
				if (!this.isDisposed) {
					this.isDisposed = true;
					disposed.fire(this);
				}
			}
		};
		store.add(toDisposable(() => instance.dispose()));
		return { instance, disposed, exited };
	}

	setup(async () => {
		dialogService = new TestDialogService();
		configurationService = new TestConfigurationService({
			files: {},
			terminal: {
				integrated: {
					confirmOnKill: 'never',
					enablePersistentSessions: true
				}
			}
		});

		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService,
		}, store);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(ITerminalInstanceService, 'getBackend', undefined);
		instantiationService.stub(ITerminalInstanceService, 'getRegisteredBackends', []);
		instantiationService.stub(IRemoteAgentService, 'getConnection', null);
		groupDisposed = store.add(new Emitter<ITerminalInstance>());
		editorDisposed = store.add(new Emitter<ITerminalInstance>());
		instanceCreated = store.add(new Emitter<ITerminalInstance>());
		clearedResources = [];
		instantiationService.stub(ITerminalGroupService, 'onDidDisposeInstance', groupDisposed.event);
		instantiationService.stub(ITerminalEditorService, 'onDidDisposeInstance', editorDisposed.event);
		instantiationService.stub(ITerminalInstanceService, 'onDidCreateInstance', instanceCreated.event);
		instantiationService.stub(ITerminalProfileService, 'refreshAvailableProfiles', () => { });
		instantiationService.stub(IDecorationsService, 'clearCachedDecorations', (resource: URI) => clearedResources.push(resource));

		const clock = sinon.useFakeTimers();
		try {
			terminalService = store.add(instantiationService.createInstance(TerminalService));
			instantiationService.stub(ITerminalService, terminalService);
			// Finish the scheduled editor-style initialization before a test can dispose the service.
			await clock.runAllAsync();
		} finally {
			clock.restore();
		}
	});

	test('clears decoration caches when panel and editor terminals are disposed', () => {
		const panel = createInstance(1);
		const editor = createInstance(2);
		const forwarded: ITerminalInstance[] = [];
		store.add(terminalService.onDidDisposeInstance(instance => forwarded.push(instance)));
		instanceCreated.fire(panel.instance);
		instanceCreated.fire(editor.instance);
		panel.instance.dispose();
		groupDisposed.fire(panel.instance);
		editor.instance.dispose();
		editorDisposed.fire(editor.instance);
		deepStrictEqual({ clearedResources, forwarded, listeners: [panel.disposed.hasListeners(), editor.disposed.hasListeners()] }, {
			clearedResources: [panel.instance.resource, editor.instance.resource], forwarded: [panel.instance, editor.instance], listeners: [false, false]
		});
	});

	test('clears decorations for editor copies discovered without host disposal forwarding', () => {
		const visibleChanged = store.add(new Emitter<void>());
		instantiationService.stub(IEditorService, 'onDidVisibleEditorsChange', visibleChanged.event);
		const editorHost = store.add(instantiationService.createInstance(TerminalEditorService));
		const { instance, disposed } = createInstance(1);
		instantiationService.stub(ITerminalInstanceService, 'createInstance', () => {
			instanceCreated.fire(instance);
			return instance;
		});
		const original = store.add(instantiationService.createInstance(TerminalEditorInput, URI.parse('vscode-terminal:/test/original'), undefined));
		const copy = store.add(original.copy());
		sinon.stub(instantiationService.get(IEditorService), 'visibleEditors').value([copy]);
		visibleChanged.fire();
		strictEqual(editorHost.instances.includes(instance), true);
		let hostDisposals = 0;
		store.add(editorHost.onDidDisposeInstance(() => hostDisposals++));
		copy.dispose();
		deepStrictEqual({ clearedResources, hostDisposals, listeners: disposed.hasListeners() }, {
			clearedResources: [instance.resource], hostDisposals: 0, listeners: false
		});
	});

	test('clears decorations after an editor host detaches before instance disposal', () => {
		const editorHost = store.add(instantiationService.createInstance(TerminalEditorService));
		const { instance, disposed } = createInstance(1);
		instanceCreated.fire(instance);
		editorHost.resolveResource(instance);
		editorHost.detachInstance(instance);
		deepStrictEqual({ clearedResources, disposed: instance.isDisposed }, { clearedResources: [], disposed: false });
		instance.dispose();
		deepStrictEqual({ clearedResources, listeners: disposed.hasListeners() }, { clearedResources: [instance.resource], listeners: false });
	});

	test('pooled terminal tab labels ignore later decoration changes', () => {
		const changed = store.add(new Emitter<IResourceDecorationChangeEvent>());
		instantiationService.stub(IDecorationsService, 'onDidChangeDecorations', changed.event);
		const queries = instantiationService.stub(IDecorationsService, 'getDecoration', () => undefined);
		instantiationService.stub(ITerminalEditingService, { isEditable: () => false });
		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add(toDisposable(() => container.remove()));
		const list = store.add(instantiationService.createInstance(TerminalTabList, container));
		const renderers = Reflect.get(Reflect.get(list, 'view'), 'renderers') as Map<string, IListRenderer<ITerminalInstance, { label?: IResourceLabel }[]>>;
		const renderer = renderers.get('terminal.tabs')!;
		const template = renderer.renderTemplate(container);
		store.add(toDisposable(() => renderer.disposeTemplate(template)));
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly resource = URI.parse('vscode-terminal:/test/1');
		};
		const label = template.find(part => part.label)?.label!;
		label.setResource({ resource: instance.resource, name: 'terminal' }, {
			fileDecorations: { colors: true, badges: true }
		});
		const before = queries.callCount;
		strictEqual(before > 0, true);
		renderer.disposeElement!(instance, 0, template);
		changed.fire({ affectsResource: () => true });
		strictEqual(queries.callCount, before);
	});

	for (const cause of ['input disposal', 'instance disposal', 'process exit', 'panel transfer then disposal', 'panel transfer', 'panel transfer then disposal after close'] as const) {
		for (const queuedNotification of [true, false]) {
			test(`evicts decorations after queued editor closure (${cause}, notification ${queuedNotification ? 'already due' : 'not pending'})`, async () => {
				await configurationService.setUserConfiguration('explorer', { decorations: { colors: true, badges: true }, openEditors: { sortOrder: 'editorOrder' } });
				const decorations = store.add(instantiationService.createInstance(DecorationsService));
				// The already-created terminal service must also evict from the real cache.
				instantiationService.stub(IDecorationsService, 'clearCachedDecorations', (resource: URI) => decorations.clearCachedDecorations(resource));
				instantiationService.stub(IDecorationsService, decorations);
				store.add(registerTestEditor(terminalEditorId, [new SyncDescriptor(TerminalEditorInput), new SyncDescriptor(TestEditorInput)]));
				const clock = sinon.useFakeTimers();
				try {
					const part = await createEditorPart(instantiationService, store.add(new DisposableStore()));
					instantiationService.stub(IEditorGroupsService, part);
					store.add(part.enforcePartOptions({ decorations: { colors: true, badges: true } }));
					instantiationService.stub(IEditorService, 'onDidCloseEditor', part.activeGroup.onDidCloseEditor);
					const editorHost = store.add(instantiationService.createInstance(TerminalEditorService));

					instantiationService.stubInstance(CloseEditorAction, store.add(instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL)));
					instantiationService.stubInstance(UnpinEditorAction, store.add(instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL)));
					instantiationService.stubInstance(SaveAllInGroupAction, store.add(instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL)));
					instantiationService.stubInstance(CloseGroupAction, store.add(instantiationService.createInstance(CloseGroupAction, CloseGroupAction.ID, CloseGroupAction.LABEL)));
					const viewContainer = new class extends mock<ViewContainer>() {
						override readonly id = 'workbench.view.explorer';
					};
					instantiationService.stub(IViewDescriptorService, {
						onDidChangeLocation: Event.None,
						getViewLocationById: () => ViewContainerLocation.Sidebar,
						getViewDescriptorById: () => null,
						getViewContainerByViewId: () => viewContainer,
						getDefaultContainerById: () => viewContainer,
						getViewContainerModel: () => new class extends mock<IViewContainerModel>() {
							override readonly visibleViewDescriptors = [OpenEditorsView.ID, 'workbench.explorer.fileView'].map(id => new class extends mock<IViewDescriptor>() {
								override readonly id = id;
							}());
							override readonly onDidChangeAllViewDescriptors = Event.None;
							override readonly onDidChangeContainerInfo = Event.None;
						}
					});
					const view = store.add(instantiationService.createInstance(OpenEditorsView, { id: OpenEditorsView.ID, title: 'Open Editors' }));
					view.render();
					const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
					container.append(part.getContainer()!, view.element);
					store.add(toDisposable(() => container.remove()));
					view.setVisible(true);
					view.layout(200);
					const file = store.add(new TestEditorInput(URI.file('/surviving.txt'), terminalEditorId));
					await part.activeGroup.openEditor(file, { pinned: true });
					const cache = Reflect.get(decorations, '_data') as { get(uri: URI): object | undefined };
					const parent = URI.parse('vscode-terminal:/test');
					const hasParentDecoration = () => {
						const decoration = decorations.getDecoration(parent, true);
						decoration?.dispose();
						return !!decoration;
					};
					let parentNotifications = 0;
					store.add(decorations.onDidChangeDecorations(event => {
						if (event.affectsResource(parent)) {
							parentNotifications++;
						}
					}));
					store.add(decorations.registerDecorationsProvider({
						label: 'Test',
						onDidChange: Event.None,
						provideDecorations: uri => uri.scheme === 'vscode-terminal' && uri.path !== parent.path ? { letter: 'M', bubble: true } : undefined
					}));
					const queries = sinon.spy(decorations, 'getDecoration');
					const closedResources: URI[] = [];
					for (let i = 0; i < 3; i++) {
						const { instance, exited } = createInstance(i);
						instanceCreated.fire(instance);
						editorHost.resolveResource(instance);
						const input = store.add(editorHost.getInputFromResource(instance.resource));
						await part.activeGroup.openEditor(input, { pinned: true });
						await clock.runAllAsync();
						strictEqual(container.querySelectorAll('.tabs-container .tab').length, 2);
						strictEqual(container.querySelectorAll('.open-editor').length, 2);
						strictEqual(!!cache.get(instance.resource), true);
						strictEqual(hasParentDecoration(), true);
						const notificationsBeforeClose = parentNotifications;

						// Register disposal before the 100ms decoration delivery. Input disposal queues
						// the real group's zero-delay close worker behind that already-due delivery.
						setTimeout(() => {
							if (cause === 'input disposal') {
								input.dispose();
							} else if (cause === 'instance disposal') {
								instance.dispose();
							} else if (cause === 'process exit') {
								exited.fire(0);
							} else {
								editorHost.detachInstance(instance);
								strictEqual(input.terminalInstance, undefined, 'the source input no longer owns the panel terminal');
								if (cause === 'panel transfer then disposal') {
									instance.dispose();
								}
							}
							strictEqual(part.activeGroup.contains(input), true, 'disposal precedes model closure');
							queries.resetHistory();
						}, 100);
						if (queuedNotification) {
							decorations.clearCachedDecorations(file.resource);
						}
						await clock.tickAsync(100);
						if (queuedNotification && instance.isDisposed) {
							strictEqual(queries.getCalls().filter(call => call.args[0].toString() === input.resource.toString()).length >= 2, true, 'Open Editors and the tab redraw before queued closure');
						}
						await clock.runAllAsync();
						if (cause === 'panel transfer then disposal after close') {
							strictEqual(part.activeGroup.contains(input), false, 'the source labels are released before disposal');
							instance.dispose();
							await clock.runAllAsync();
						}
						const terminalLives = cause === 'panel transfer';
						strictEqual(instance.isDisposed, !terminalLives);
						if (terminalLives) {
							deepStrictEqual({ cached: !!cache.get(instance.resource), parentDecoration: hasParentDecoration() }, { cached: true, parentDecoration: true });
							// A live panel terminal keeps its decorations until it actually dies.
							instance.dispose();
							await clock.runAllAsync();
						}
						closedResources.push(input.resource);
						deepStrictEqual({
							editors: part.activeGroup.editors.map(editor => editor.resource),
							cached: closedResources.map(resource => cache.get(resource)),
							parentDecoration: hasParentDecoration(),
							notifiedParent: parentNotifications > notificationsBeforeClose,
						}, { editors: [file.resource], cached: closedResources.map(() => undefined), parentDecoration: false, notifiedParent: true });
					}
					decorations.clearCachedDecorations(file.resource);
					await clock.runAllAsync();
					strictEqual(!!cache.get(file.resource), true, 'surviving labels still refresh');
				} finally {
					clock.restore();
					sinon.restore();
				}
			});
		}
	}

	suite('background terminals', () => {
		test('should remove disposed hidden terminals and their listeners', async () => {
			const terminals = [createInstance(1), createInstance(2), createInstance(3)];
			let instanceIndex = 0;
			instantiationService.stub(ITerminalInstanceService, 'convertProfileToShellLaunchConfig', () => ({ hideFromUser: true }));
			instantiationService.stub(ITerminalInstanceService, 'createInstance', () => {
				const { instance } = terminals[instanceIndex++];
				instanceCreated.fire(instance);
				return instance;
			});
			terminalService.registerProcessSupport(true);

			const backgroundedTerminalDisposables = Reflect.get(terminalService, '_backgroundedTerminalDisposables') as { size: number };
			for (const { disposed } of terminals) {
				const instance = await terminalService.createTerminal({
					config: { hideFromUser: true },
					skipContributedProfileCheck: true,
				});

				strictEqual(terminalService.instances.includes(instance), true);
				strictEqual(backgroundedTerminalDisposables.size, 1);
				strictEqual(disposed.hasListeners(), true);

				instance.dispose();

				strictEqual(terminalService.instances.includes(instance), false);
				strictEqual(backgroundedTerminalDisposables.size, 0);
				strictEqual(disposed.hasListeners(), false);
				strictEqual(clearedResources.at(-1), instance.resource);
			}
		});
	});

	suite('safeDisposeTerminal', () => {
		let onExitEmitter: Emitter<number | undefined>;

		setup(() => {
			onExitEmitter = store.add(new Emitter<number | undefined>());
		});

		test('should not show prompt when confirmOnKill is never', async () => {
			await setConfirmOnKill(configurationService, 'never');
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should not show prompt when any terminal editor is closed (handled by editor itself)', async () => {
			await setConfirmOnKill(configurationService, 'editor');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			await setConfirmOnKill(configurationService, 'always');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Editor,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should not show prompt when confirmOnKill is editor and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'editor');
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should show prompt when confirmOnKill is panel and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'panel');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
		test('should show prompt when confirmOnKill is always and panel terminal is closed', async () => {
			await setConfirmOnKill(configurationService, 'always');
			// No child process cases
			dialogService.setConfirmResult({ confirmed: false });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: false,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			// Child process cases
			dialogService.setConfirmResult({ confirmed: false });
			await terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				dispose: () => fail()
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
			dialogService.setConfirmResult({ confirmed: true });
			terminalService.safeDisposeTerminal({
				target: TerminalLocation.Panel,
				hasChildProcesses: true,
				onExit: onExitEmitter.event,
				dispose: () => onExitEmitter.fire(undefined)
			} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance);
		});
	});

	suite('persistent title and icon updates', () => {
		let backend: TestPersistentTerminalBackend;

		setup(() => {
			backend = new TestPersistentTerminalBackend();
			(terminalService as unknown as { _primaryBackend: Partial<ITerminalBackend> })._primaryBackend = backend;
		});

		test('should not update pty host metadata for custom pty terminals', () => runWithFakedTimers({}, async () => {
			const instance = createTerminalInstance({ customPtyImplementation: true });

			updateTitle(terminalService, instance);
			updateIcon(terminalService, instance, false);
			await timeout(500);

			strictEqual(backend.titleUpdateCount, 0);
			strictEqual(backend.iconUpdateCount, 0);
		}));

		test('should update pty host metadata for regular pty terminals', () => runWithFakedTimers({}, async () => {
			const instance = createTerminalInstance();

			updateTitle(terminalService, instance);
			updateIcon(terminalService, instance, true);
			await timeout(500);

			strictEqual(backend.titleUpdateCount, 1);
			strictEqual(backend.iconUpdateCount, 1);
			strictEqual(backend.lastTitle, 'terminal title');
			strictEqual(backend.lastIconUserInitiated, true);
		}));
	});
});

async function setConfirmOnKill(configurationService: TestConfigurationService, value: 'never' | 'always' | 'panel' | 'editor') {
	await configurationService.setUserConfiguration(TERMINAL_CONFIG_SECTION, { confirmOnKill: value });
	configurationService.onDidChangeConfigurationEmitter.fire({
		affectsConfiguration: () => true,
		affectedKeys: ['terminal.integrated.confirmOnKill']
	} as unknown as IConfigurationChangeEvent);
}

class TestPersistentTerminalBackend implements Partial<ITerminalBackend> {
	titleUpdateCount = 0;
	iconUpdateCount = 0;
	lastTitle: string | undefined;
	lastIconUserInitiated: boolean | undefined;

	async updateTitle(_id: number, title: string, _titleSource: TitleEventSource): Promise<void> {
		this.titleUpdateCount++;
		this.lastTitle = title;
	}

	async updateIcon(_id: number, userInitiated: boolean, _icon: TerminalIcon, _color?: string): Promise<void> {
		this.iconUpdateCount++;
		this.lastIconUserInitiated = userInitiated;
	}
}

function createTerminalInstance(options?: { customPtyImplementation?: boolean }): ITerminalInstance {
	return {
		persistentProcessId: 13,
		title: 'terminal title',
		titleSource: TitleEventSource.Process,
		staticTitle: undefined,
		icon: { id: 'remote' },
		color: undefined,
		isDisposed: false,
		shellLaunchConfig: options?.customPtyImplementation
			? { customPtyImplementation: () => { throw new Error('should not be called'); } }
			: {},
	} satisfies Partial<ITerminalInstance> as unknown as ITerminalInstance;
}

function updateTitle(terminalService: TerminalService, instance: ITerminalInstance): void {
	const fn = Reflect.get(terminalService, '_updateTitle') as (instance: ITerminalInstance) => void;
	fn.call(terminalService, instance);
}

function updateIcon(terminalService: TerminalService, instance: ITerminalInstance, userInitiated: boolean): void {
	const fn = Reflect.get(terminalService, '_updateIcon') as (instance: ITerminalInstance, userInitiated: boolean) => void;
	fn.call(terminalService, instance, userInitiated);
}
