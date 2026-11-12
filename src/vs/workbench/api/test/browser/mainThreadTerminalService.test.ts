/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { CwdDetectionCapability } from '../../../../platform/terminal/common/capabilities/cwdDetectionCapability.js';
import { TerminalCapabilityStore, TerminalCapabilityStoreMultiplexer } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { EnvironmentVariableMutatorType, IEnvironmentVariableMutator, ISerializableEnvironmentVariableCollection } from '../../../../platform/terminal/common/environmentVariable.js';
import { TerminalLocation, TerminalLocationConfigValue } from '../../../../platform/terminal/common/terminal.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { TerminalEditorService } from '../../../contrib/terminal/browser/terminalEditorService.js';
import { TerminalGroupService } from '../../../contrib/terminal/browser/terminalGroupService.js';
import { TerminalInstanceService } from '../../../contrib/terminal/browser/terminalInstanceService.js';
import { TerminalService } from '../../../contrib/terminal/browser/terminalService.js';
import { IEnvironmentVariableCollectionWithPersistence, IEnvironmentVariableService } from '../../../contrib/terminal/common/environmentVariable.js';
import { ITerminalConfiguration, ITerminalProfileService } from '../../../contrib/terminal/common/terminal.js';
import { TestViewDescriptorService } from '../../../contrib/terminal/test/browser/xterm/xtermTestUtils.js';
import { ITerminalLinkProviderService } from '../../../contrib/terminalContrib/links/browser/links.js';
import { ITerminalQuickFixService } from '../../../contrib/terminalContrib/quickFix/browser/quickFix.js';
import { ITerminalCompletionService } from '../../../contrib/terminalContrib/suggest/browser/terminalCompletionService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { ProxyIdentifier } from '../../../services/extensions/common/proxyIdentifier.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { TestTerminalProfileService, workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadTerminalService } from '../../browser/mainThreadTerminalService.js';
import { ExtHostTerminalServiceShape } from '../../common/extHost.protocol.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadTerminalService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let service: MainThreadTerminalService;
	let terminals: TerminalService;
	let groups: TerminalGroupService;
	let editors: TerminalEditorService;
	let configurationService: TestConfigurationService;
	let environmentVariableService: IEnvironmentVariableService;
	let instantiationService: TestInstantiationService;
	let input: string[];

	setup(async () => {
		input = [];
		configurationService = new TestConfigurationService({
			files: {},
			terminal: {
				integrated: {
					allowInUntrustedWorkspace: true,
					defaultLocation: 'view',
					fontFamily: 'monospace',
					scrollback: 1000,
					fastScrollSensitivity: 2,
					mouseWheelScrollSensitivity: 1,
					unicodeVersion: '6',
					commandsToSkipShell: [],
					shellIntegration: { enabled: false },
					tabs: { title: '${process}', description: '' }
				}
			}
		});
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		instantiationService.stub(IViewsService, { isViewVisible: () => false });
		instantiationService.set(ITerminalProfileService, new class extends TestTerminalProfileService {
			override async getContributedDefaultProfile() { return undefined; }
			override refreshAvailableProfiles() { }
			override getDefaultProfileName() { return undefined; }
		});
		instantiationService.set(ITerminalInstanceService, store.add(instantiationService.createInstance(TerminalInstanceService)));
		editors = store.add(instantiationService.createInstance(TerminalEditorService));
		instantiationService.set(ITerminalEditorService, editors);
		groups = store.add(instantiationService.createInstance(TerminalGroupService));
		instantiationService.set(ITerminalGroupService, groups);
		terminals = store.add(instantiationService.createInstance(TerminalService));
		terminals.registerProcessSupport(true);
		instantiationService.set(ITerminalService, terminals);
		// The window is remote, while the default extension host below is local.
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly remoteAuthority = 'ssh-remote+linux';
		});
		environmentVariableService = instantiationService.get(IEnvironmentVariableService);
		// These provider registries are not used by terminal creation or disposal.
		instantiationService.stub(ITerminalLinkProviderService, {});
		instantiationService.stub(ITerminalQuickFixService, {});
		instantiationService.stub(ITerminalCompletionService, {});
		service = store.add(instantiationService.createInstance(MainThreadTerminalService, AnyCallRPCProtocol<Pick<ExtHostTerminalServiceShape, '$startExtensionTerminal' | '$acceptProcessInput'>>({
			$startExtensionTerminal: async id => {
				const cwd = terminals.getInstanceFromId(id)?.shellLaunchConfig.cwd;
				service.$sendProcessReady(id, -1, typeof cwd === 'string' ? cwd : '', undefined);
				return undefined;
			},
			$acceptProcessInput: (_id, data) => input.push(data)
		})));
		// TerminalService initializes its editor styles asynchronously, even when the test skips.
		await timeout(0);
	});

	async function setTerminalConfiguration(configuration: Partial<ITerminalConfiguration>): Promise<void> {
		await configurationService.setUserConfiguration('terminal.integrated', {
			...configurationService.getValue<ITerminalConfiguration>('terminal.integrated'),
			...configuration
		});
		configurationService.onDidChangeConfigurationEmitter.fire(new class extends mock<IConfigurationChangeEvent>() {
			override affectsConfiguration(section: string): boolean {
				return section.startsWith('terminal.integrated');
			}
		});
	}

	function createBridge(remoteAuthority: string | null, onInitialCollections: (collections: [string, ISerializableEnvironmentVariableCollection][]) => void, remoteOS = OperatingSystem.Linux): MainThreadTerminalService {
		const rpc = AnyCallRPCProtocol<Pick<ExtHostTerminalServiceShape, '$initEnvironmentVariableCollections'>>({
			$initEnvironmentVariableCollections: onInitialCollections
		});
		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly remoteAuthority = remoteAuthority;
			override readonly remoteOS = remoteOS;
			override getProxy<T>(identifier: ProxyIdentifier<T>) {
				return rpc.getProxy(identifier);
			}
		};
		return store.add(instantiationService.createInstance(MainThreadTerminalService, extHostContext));
	}

	function collection(entries: ISerializableEnvironmentVariableCollection): IEnvironmentVariableCollectionWithPersistence {
		return {
			persistent: true,
			map: new Map(entries),
			descriptionMap: new Map()
		};
	}

	test('records a local extension host origin in a remote window', () => {
		const pathCollection: ISerializableEnvironmentVariableCollection = [[
			'PATH',
			{ variable: 'PATH', value: 'C:\\copilot', type: EnvironmentVariableMutatorType.Prepend }
		]];

		service.$setEnvironmentVariableCollection('publisher.local', true, pathCollection, []);

		assert.deepStrictEqual(environmentVariableService.collections.get('publisher.local'), {
			...collection(pathCollection),
			remoteAuthority: null
		});
	});

	test('does not bootstrap a foreign PATH into a remote extension host and retains non-PATH values', () => {
		const foreignCollection: ISerializableEnvironmentVariableCollection = [
			['PATH', { variable: 'PATH', value: 'C:\\copilot', type: EnvironmentVariableMutatorType.Prepend }],
			['EDITOR', { variable: 'EDITOR', value: 'code', type: EnvironmentVariableMutatorType.Replace }]
		];
		const persistedCollection = {
			...collection(foreignCollection),
			remoteAuthority: 'ssh-remote+windows'
		};
		const initialCollections: [string, ISerializableEnvironmentVariableCollection][][] = [];
		environmentVariableService.set('publisher.extension', persistedCollection);

		const remoteBridge = createBridge('ssh-remote+linux', collections => initialCollections.push(collections));

		assert.deepStrictEqual(initialCollections, [[['publisher.extension', [
			['EDITOR', { variable: 'EDITOR', value: 'code', type: EnvironmentVariableMutatorType.Replace }]
		]]]]);

		const resyncedCollection = initialCollections[0][0][1].map<[string, IEnvironmentVariableMutator]>(([key, mutator]) => [
			key,
			mutator.variable === 'EDITOR' ? { ...mutator, value: 'code-insiders' } : mutator
		]);
		remoteBridge.$setEnvironmentVariableCollection('publisher.extension', true, resyncedCollection, []);
		assert.deepStrictEqual(environmentVariableService.collections.get('publisher.extension'), {
			...collection([['EDITOR', { variable: 'EDITOR', value: 'code-insiders', type: EnvironmentVariableMutatorType.Replace }]]),
			remoteAuthority: 'ssh-remote+linux'
		});
	});

	test('bootstraps same-host persisted PATH into its extension host', () => {
		const pathCollection: ISerializableEnvironmentVariableCollection = [[
			'PATH',
			{ variable: 'PATH', value: ':/copilot', type: EnvironmentVariableMutatorType.Prepend }
		]];
		const persistedCollection: IEnvironmentVariableCollectionWithPersistence = {
			...collection(pathCollection),
			remoteAuthority: 'ssh-remote+Linux'
		};
		environmentVariableService.set('publisher.extension', persistedCollection);
		const initialCollections: [string, ISerializableEnvironmentVariableCollection][][] = [];

		createBridge('ssh-remote+linux', collections => initialCollections.push(collections));

		assert.deepStrictEqual(initialCollections, [[['publisher.extension', pathCollection]]]);
	});

	test('normalizes the producing authority when an extension publishes its collection', () => {
		const bridge = createBridge('wsl+Ubuntu', () => { });
		bridge.$setEnvironmentVariableCollection('publisher.extension', true, [], []);
		assert.deepStrictEqual(environmentVariableService.collections.get('publisher.extension'), {
			...collection([]),
			remoteAuthority: 'wsl+ubuntu'
		});
	});

	for (const os of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
		test(`uses extension-host OS ${os} synchronously for cached PATH spelling`, () => {
			const entries: ISerializableEnvironmentVariableCollection = ['PATH', 'Path', 'path', 'EDITOR'].map(variable => [
				variable, { variable, value: 'value', type: EnvironmentVariableMutatorType.Replace }
			]);
			environmentVariableService.set('publisher.legacy', collection(entries));
			const initial: [string, ISerializableEnvironmentVariableCollection][][] = [];

			createBridge('ssh-remote+target', collections => initial.push(collections), os);

			assert.deepStrictEqual(initial, [[['publisher.legacy', entries.filter(([, mutator]) =>
				os === OperatingSystem.Windows ? mutator.variable === 'EDITOR' : mutator.variable !== 'PATH'
			)]]]);
		});
	}

	test('initializes an empty filtered snapshot and permits empty sync and delete', () => {
		environmentVariableService.set('publisher.legacy', collection([[
			'PATH',
			{ variable: 'PATH', value: 'C:\\copilot', type: EnvironmentVariableMutatorType.Prepend }
		]]));
		const initialCollections: [string, ISerializableEnvironmentVariableCollection][][] = [];
		const remoteBridge = createBridge('ssh-remote+linux', collections => initialCollections.push(collections));

		assert.deepStrictEqual(initialCollections, [[]]);

		remoteBridge.$setEnvironmentVariableCollection('publisher.legacy', false, [], []);
		assert.deepStrictEqual(environmentVariableService.collections.get('publisher.legacy'), {
			...collection([]),
			persistent: false,
			remoteAuthority: 'ssh-remote+linux'
		});
		remoteBridge.$setEnvironmentVariableCollection('publisher.legacy', false, undefined, []);
		assert.strictEqual(environmentVariableService.collections.has('publisher.legacy'), false);
	});

	test('releases the launch request after an API terminal closes', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		async function createAndClose() {
			const request = { name: 'Lifecycle test', shellPath: '/test-shell', hideFromUser: true };
			await service.$createTerminal('closed-terminal', request);
			const terminal = terminals.instances[0];
			await terminal.xtermReadyPromise;
			await service.$dispose('closed-terminal');
			assert.strictEqual(terminal.isDisposed, true);
			return new WeakRef(request);
		}
		const request = await createAndClose();
		// Process creation queues idle work. Let that complete before checking lifetime ownership.
		await new Promise<void>(resolve => mainWindow.requestIdleCallback(() => resolve()));
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(request.deref(), undefined, 'The closed terminal launch request is still retained');
	});

	test('closing one API terminal preserves a live terminal', async () => {
		await service.$createTerminal('closed-terminal', { name: 'Closed', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		await service.$createTerminal('live-terminal', { name: 'Live', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		const instances = [...terminals.instances];
		try {
			await Promise.all(instances.map(instance => instance.processReady));
			await service.$dispose('closed-terminal');
			await service.$dispose('closed-terminal');
			await service.$show('closed-terminal', false);
			await service.$sendText('closed-terminal', 'discarded', false);
			await service.$sendText('live-terminal', 'delivered', false);
			assert.deepStrictEqual({ input, disposed: instances.map(instance => instance.isDisposed) }, { input: ['delivered'], disposed: [true, false] });
		} finally {
			instances.forEach(instance => instance.dispose());
		}
	});

	test('a terminal closed outside the API no longer resolves its extension identifier', async () => {
		await service.$createTerminal('user-closed-terminal', { name: 'Closed by user', shellPath: '/test-shell', hideFromUser: true });
		const terminal = terminals.instances[0];
		terminal.dispose();
		await service.$show('user-closed-terminal', false);
		assert.strictEqual(terminals.instances.length, 0);
	});

	test('a process exit removes the extension identifier', async () => {
		await service.$createTerminal('exited-terminal', { name: 'Exited', hideFromUser: true, isExtensionCustomPtyTerminal: true });
		const terminal = store.add(terminals.instances[0]);
		await terminal.processReady;
		const disposed = Event.toPromise(terminal.onDisposed);
		service.$sendProcessExit(terminal.instanceId, 0);
		await disposed;
		await service.$show('exited-terminal', false);
		assert.strictEqual(terminals.instances.length, 0);
	});

	test('a terminal removed from its group still releases its extension identifier', async () => {
		await service.$createTerminal('detached-terminal', { name: 'Detached', shellPath: '/test-shell' });
		const terminal = store.add(terminals.instances[0]);
		groups.getGroupForInstance(terminal)!.removeInstance(terminal);
		terminal.dispose();
		await service.$show('detached-terminal', false);
		assert.strictEqual(terminals.instances.length, 0);
	});

	test('splits from a parent terminal referenced by its extension identifier', async () => {
		await service.$createTerminal('parent-terminal', { name: 'Parent', shellPath: '/test-shell' });
		await service.$createTerminal('child-terminal', { name: 'Child', shellPath: '/test-shell', location: { parentTerminal: 'parent-terminal' } });
		const [parent, child] = terminals.instances;
		try {
			assert.strictEqual(groups.getGroupForInstance(child), groups.getGroupForInstance(parent));
		} finally {
			child.dispose();
			parent.dispose();
		}
	});

	test('splits from a parent terminal referenced by its instance id', async () => {
		// Once a terminal has opened, the extension host refers to it by its instance id
		await service.$createTerminal('parent-terminal', { name: 'Parent', shellPath: '/test-shell' });
		const parent = terminals.instances[0];
		await service.$createTerminal('child-terminal', { name: 'Child', shellPath: '/test-shell', location: { parentTerminal: parent.instanceId } });
		const child = terminals.instances[1];
		try {
			assert.strictEqual(groups.getGroupForInstance(child), groups.getGroupForInstance(parent));
		} finally {
			child.dispose();
			parent.dispose();
		}
	});

	for (const identifier of ['extension identifier', 'instance id'] as const) {
		for (const state of ['hidden', 'backgrounded'] as const) {
			test(`preserves the location of a ${state} editor parent referenced by its ${identifier}`, async () => {
				await service.$createTerminal('parent-terminal', {
					name: 'Parent',
					hideFromUser: state === 'hidden',
					isExtensionCustomPtyTerminal: true,
					location: TerminalLocation.Editor
				});
				const parent = store.add(terminals.instances[0]);
				if (state === 'backgrounded') {
					store.add(editors.getInputFromResource(parent.resource));
					terminals.moveToBackground(parent);
				}
				await service.$createTerminal('child-terminal', {
					name: 'Child',
					isExtensionCustomPtyTerminal: true,
					location: { parentTerminal: identifier === 'extension identifier' ? 'parent-terminal' : parent.instanceId }
				});
				const child = store.add(terminals.foregroundInstances[0]);
				if (child.target === TerminalLocation.Editor) {
					store.add(editors.getInputFromResource(child.resource));
				}
				try {
					assert.deepStrictEqual({
						childLocation: child.target,
						editorInstances: editors.instances.map(instance => instance.instanceId),
						panelInstances: groups.instances.map(instance => instance.instanceId),
						parentInForeground: terminals.foregroundInstances.includes(parent)
					}, {
						childLocation: TerminalLocation.Editor,
						editorInstances: [child.instanceId],
						panelInstances: [],
						parentInForeground: false
					});
				} finally {
					child.dispose();
					parent.dispose();
				}
			});

			for (const hideChild of [false, true]) {
				test(`preserves the panel location of a ${state} parent referenced by its ${identifier} with an editor default and a ${hideChild ? 'hidden' : 'visible'} child`, async () => {
					await setTerminalConfiguration({ defaultLocation: TerminalLocationConfigValue.Editor });
					await service.$createTerminal('parent-terminal', {
						name: 'Parent',
						hideFromUser: state === 'hidden',
						isExtensionCustomPtyTerminal: true,
						location: TerminalLocation.Panel
					});
					const parent = store.add(terminals.instances[0]);
					if (state === 'backgrounded') {
						terminals.moveToBackground(parent);
					}
					await service.$createTerminal('child-terminal', {
						name: 'Child',
						hideFromUser: hideChild,
						isExtensionCustomPtyTerminal: true,
						location: { parentTerminal: identifier === 'extension identifier' ? 'parent-terminal' : parent.instanceId }
					});
					const child = store.add(terminals.instances.find(instance => instance !== parent)!);
					if (!hideChild && child.target === TerminalLocation.Editor) {
						store.add(editors.getInputFromResource(child.resource));
					}
					try {
						assert.deepStrictEqual({
							childLocation: child.target,
							editorInstances: editors.instances.map(instance => instance.instanceId),
							panelInstances: groups.instances.map(instance => instance.instanceId),
							parentInForeground: terminals.foregroundInstances.includes(parent)
						}, {
							childLocation: TerminalLocation.Panel,
							editorInstances: [],
							panelInstances: hideChild ? [] : [child.instanceId],
							parentInForeground: false
						});
					} finally {
						child.dispose();
						parent.dispose();
					}
				});
			}

			for (const splitCwd of ['initial', 'inherited'] as const) {
				test(`preserves ${splitCwd} cwd for a hidden child of a ${state} panel parent referenced by its ${identifier}`, async () => {
					await setTerminalConfiguration({ defaultLocation: TerminalLocationConfigValue.Editor, splitCwd });
					await service.$createTerminal('parent-terminal', {
						name: 'Parent',
						cwd: '/parent-initial',
						hideFromUser: state === 'hidden',
						isExtensionCustomPtyTerminal: true,
						location: TerminalLocation.Panel
					});
					const parent = store.add(terminals.instances[0]);
					await parent.processReady;
					if (state === 'backgrounded') {
						terminals.moveToBackground(parent);
					}
					const cwdDetection = store.add(new CwdDetectionCapability());
					const capabilities = store.add(new TerminalCapabilityStore());
					capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
					assert.ok(parent.capabilities instanceof TerminalCapabilityStoreMultiplexer);
					parent.capabilities.add(capabilities);
					cwdDetection.updateCwd('/parent-current');
					try {
						const children: { cwd: ITerminalInstance['shellLaunchConfig']['cwd']; location: ITerminalInstance['target'] }[] = [];
						for (const cwd of [undefined, '/child-explicit']) {
							const childId = cwd ? 'explicit-child-terminal' : 'child-terminal';
							await service.$createTerminal(childId, {
								name: childId,
								cwd,
								hideFromUser: true,
								isExtensionCustomPtyTerminal: true,
								location: { parentTerminal: identifier === 'extension identifier' ? 'parent-terminal' : parent.instanceId }
							});
							const child = store.add(terminals.instances.find(instance => instance.shellLaunchConfig.extHostTerminalId === childId)!);
							children.push({ cwd: child.shellLaunchConfig.cwd, location: child.target });
						}
						assert.deepStrictEqual({
							children,
							foreground: terminals.foregroundInstances.map(instance => instance.instanceId)
						}, {
							children: [
								{ cwd: splitCwd === 'initial' ? '/parent-initial' : '/parent-current', location: TerminalLocation.Panel },
								{ cwd: '/child-explicit', location: TerminalLocation.Panel }
							],
							foreground: []
						});
					} finally {
						for (const instance of [...terminals.instances]) {
							instance.dispose();
						}
					}
				});
			}
		}

		test(`keeps the child in the panel for a hidden panel parent referenced by its ${identifier}`, async () => {
			await service.$createTerminal('parent-terminal', { name: 'Parent', hideFromUser: true, isExtensionCustomPtyTerminal: true });
			const parent = store.add(terminals.instances[0]);
			await service.$createTerminal('child-terminal', {
				name: 'Child',
				isExtensionCustomPtyTerminal: true,
				location: { parentTerminal: identifier === 'extension identifier' ? 'parent-terminal' : parent.instanceId }
			});
			const child = store.add(terminals.foregroundInstances[0]);
			try {
				assert.deepStrictEqual({
					parentGroup: groups.getGroupForInstance(parent),
					groups: groups.groups.map(group => group.terminalInstances),
					foreground: terminals.foregroundInstances
				}, {
					parentGroup: undefined,
					groups: [[child]],
					foreground: [child]
				});
			} finally {
				child.dispose();
				parent.dispose();
			}
		});

		test(`splits from a previously hidden parent after it is shown using its ${identifier}`, async () => {
			await service.$createTerminal('parent-terminal', { name: 'Parent', hideFromUser: true, isExtensionCustomPtyTerminal: true });
			const parent = store.add(terminals.instances[0]);
			await terminals.showBackgroundTerminal(parent);
			await service.$createTerminal('child-terminal', {
				name: 'Child',
				isExtensionCustomPtyTerminal: true,
				location: { parentTerminal: identifier === 'extension identifier' ? 'parent-terminal' : parent.instanceId }
			});
			const child = store.add(terminals.instances.find(instance => instance.shellLaunchConfig.extHostTerminalId === 'child-terminal')!);
			try {
				assert.deepStrictEqual(groups.groups.map(group => group.terminalInstances), [[parent, child]]);
			} finally {
				child.dispose();
				parent.dispose();
			}
		});
	}

	test('keeps the child in the panel for a panel parent moved to the background', async () => {
		await service.$createTerminal('parent-terminal', { name: 'Parent', isExtensionCustomPtyTerminal: true });
		const parent = store.add(terminals.instances[0]);
		terminals.moveToBackground(parent);
		await service.$createTerminal('child-terminal', {
			name: 'Child',
			isExtensionCustomPtyTerminal: true,
			location: { parentTerminal: parent.instanceId }
		});
		const child = store.add(terminals.foregroundInstances[0]);
		try {
			assert.deepStrictEqual({
				parentGroup: groups.getGroupForInstance(parent),
				groups: groups.groups.map(group => group.terminalInstances),
				foreground: terminals.foregroundInstances
			}, {
				parentGroup: undefined,
				groups: [[child]],
				foreground: [child]
			});
		} finally {
			child.dispose();
			parent.dispose();
		}
	});

	test('a terminal closed during creation releases its extension identifier', async () => {
		store.add(terminals.onDidChangeInstances(() => terminals.instances[0]?.dispose()));
		await service.$createTerminal('early-closed-terminal', { name: 'Early close', shellPath: '/test-shell', hideFromUser: true });
		await service.$show('early-closed-terminal', false);
		assert.strictEqual(terminals.instances.length, 0);
	});
});
