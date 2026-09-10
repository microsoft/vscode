/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyValue } from '../../../../../platform/contextkey/common/contextkey.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IGalleryMcpServer, IInstallableMcpServer } from '../../../../../platform/mcp/common/mcpManagement.js';
import { McpServerType, McpServerVariableType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { isWorkspaceFolder, IWorkspaceContextService, toWorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ActiveEditorContext, ResourceContextKey } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLocalMcpServer, IWorkbenchMcpManagementService, IWorkbencMcpServerInstallOptions, LocalMcpServerScope, WorkspaceMcpConfigKind } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { IAgentHostCustomizationService } from '../../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { TEXT_FILE_EDITOR_ID } from '../../../files/common/files.js';
import { AddConfigurationAction, OpenWorkspaceFolderMcpResourceCommand } from '../../browser/mcpCommands.js';
import { McpConfigurationDestination } from '../../browser/mcpConfigurationDestination.js';
import { InstallAction, InstallInRemoteAction, InstallInWorkspaceAction, ShowServerJsonConfigurationAction } from '../../browser/mcpServerActions.js';
import { mcpWorkspaceRootConfig } from '../../common/mcpConfiguration.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, McpCollectionDefinition, McpConnectionState, McpServerDefinition, McpServerInstallState } from '../../common/mcpTypes.js';
import { startServerByFilter } from '../../common/mcpTypesUtils.js';

class TestQuickInputService extends mock<IQuickInputService>() {
	readonly selections: (string | undefined)[] = [];
	readonly inputs: (string | undefined)[] = [];
	readonly pickLabels: string[][] = [];
	readonly pickOptions: { placeholder?: string; descriptions: (string | undefined)[]; details: (string | undefined)[] }[] = [];

	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[] | undefined>;
	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T | undefined>;
	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined>;
	override async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | T[] | undefined> {
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		this.pickLabels.push(items.map(item => item.label));
		this.pickOptions.push({ placeholder: options?.placeHolder, descriptions: items.map(item => item.description), details: items.map(item => item.detail) });
		assert.ok(this.selections.length, `Unexpected picker: ${items.map(item => item.label).join(', ')}`);
		const label = this.selections.shift();
		if (label === undefined) {
			return undefined;
		}
		const selected = items.find(item => item.label === label);
		assert.ok(selected, `Missing choice: ${label}`);
		return options?.canPickMany ? [selected] : selected;
	}

	override async input(): Promise<string | undefined> {
		assert.ok(this.inputs.length, 'Unexpected input');
		return this.inputs.shift();
	}
}

suite('MCP configuration entry points', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const rootFile = '.mcp.json';
	const legacyFile = '.vscode/mcp.json';
	const installable: IInstallableMcpServer = { name: 'same-name', config: { type: McpServerType.LOCAL, command: 'node', args: ['server.js'] } };

	function setup(enabled: boolean, existing: string[] = [], multiRoot = false) {
		const instantiation = store.add(new TestInstantiationService());
		const quickInput = new TestQuickInputService();
		const folder = toWorkspaceFolder(URI.file('/project'));
		const secondFolder = toWorkspaceFolder(URI.file('/second'));
		const workspace = new Workspace('mcp-test', multiRoot ? [folder, secondFolder] : [folder], multiRoot ? URI.file('/project.code-workspace') : null);
		const opened: URI[] = [];
		const selections: (IRange | undefined)[] = [];
		const started: string[] = [];
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const existenceChecks: string[] = [];
		const installs: { server: IInstallableMcpServer; options: IWorkbencMcpServerInstallOptions | undefined }[] = [];
		const servers = observableValue<readonly IMcpServer[]>('servers', []);
		const collections = observableValue<readonly McpCollectionDefinition[]>('collections', []);

		instantiation.stub(IConfigurationService, new TestConfigurationService({ [mcpWorkspaceRootConfig]: enabled }));
		instantiation.stub(IQuickInputService, quickInput);
		instantiation.stub(IWorkspaceContextService, {
			getWorkspace: () => workspace,
			getWorkspaceFolder: resource => workspace.getFolder(resource),
			getWorkbenchState: () => multiRoot ? WorkbenchState.WORKSPACE : WorkbenchState.FOLDER,
		});
		instantiation.stub(IUriIdentityService, { extUri });
		instantiation.stub(IFileService, {
			resolve: async resource => {
				existenceChecks.push(resource.path);
				if (existing.some(file => resource.path === folder.toResource(file).path)) {
					return upcastPartial<IFileStatWithMetadata>({ resource });
				}
				throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
			},
			createFile: async () => { throw new Error('The destination UI must not create files'); },
			writeFile: async () => { throw new Error('The destination UI must not write files'); },
		});
		instantiation.stub(IEditorService, {});
		instantiation.stub(IEditorService, 'openEditor', async (editor: { resource: URI; options?: { selection?: IRange } }) => {
			opened.push(editor.resource);
			selections.push(editor.options?.selection);
			return undefined;
		});
		instantiation.stub(ICommandService, {});
		instantiation.stub(ICommandService, 'executeCommand', async () => false);
		instantiation.stub(IWorkbenchEnvironmentService, {});
		instantiation.stub(IOpenerService, {});
		instantiation.stub(INotificationService, { error: error => errors.push(error) });
		instantiation.stub(ILabelService, {});
		instantiation.stub(IAgentHostCustomizationService, {});
		instantiation.stub(IChatWidgetService, {});
		instantiation.stub(ITelemetryService, NullTelemetryService);
		instantiation.stub(IMcpService, { servers });
		instantiation.stub(IMcpRegistry, { collections });

		const runtimeServer = (id: string, resource: URI) => {
			const definition = upcastPartial<McpServerDefinition>({ id, label: installable.name, presentation: { origin: { uri: resource, range: new Range(3, 1, 3, 5) } } });
			const collection = upcastPartial<McpCollectionDefinition>({ id, serverDefinitions: constObservable([definition]) });
			collections.set([...collections.get().filter(collection => collection.id !== id), collection], undefined);
			return upcastDeepPartial<IMcpServer>({
				definition: { id, label: installable.name },
				collection: { id },
				start: async () => {
					started.push(id);
					return { state: McpConnectionState.Kind.Stopped };
				},
			});
		};

		const install = async (server: IInstallableMcpServer | URI, options?: IWorkbencMcpServerInstallOptions) => {
			assert.ok(!URI.isUri(server));
			installs.push({ server, options });
			const target = options?.target;
			const resource = isWorkspaceFolder(target) ? target.toResource(options?.workspaceConfig === WorkspaceMcpConfigKind.Root ? rootFile : legacyFile)
				: target === ConfigurationTarget.WORKSPACE ? workspace.configuration!
					: URI.file(target === ConfigurationTarget.USER_REMOTE ? '/remote/mcp.json' : '/user/mcp.json');
			const id = `installed:${resource.path}`;
			const local = upcastPartial<IWorkbenchLocalMcpServer>({ id, name: server.name, config: server.config, mcpResource: resource, scope: LocalMcpServerScope.Workspace });
			servers.set([runtimeServer('other-same-name', URI.file('/other/.mcp.json')), runtimeServer(id, resource)], undefined);
			return local;
		};
		instantiation.stub(IWorkbenchMcpManagementService, { install });
		instantiation.stub(IMcpWorkbenchService, {
			canInstall: () => true,
			install: async (server, options) => {
				const local = await install(server.installable ?? installable, options);
				return upcastPartial<IWorkbenchMcpServer>({ id: local.id, name: local.name, local });
			},
		});
		return { instantiation, quickInput, folder, secondFolder, workspace, opened, selections, started, errors, existenceChecks, installs, servers, runtimeServer, destination: instantiation.createInstance(McpConfigurationDestination) };
	}

	for (const enabled of [false, true]) {
		for (const hasRoot of [false, true]) {
			for (const hasLegacy of [false, true]) {
				const existing = [...(hasRoot ? [rootFile] : []), ...(hasLegacy ? [legacyFile] : [])];
				test(`open: enabled=${enabled}, root=${hasRoot}, legacy=${hasLegacy}`, async () => {
					const fixture = setup(enabled, existing);
					if (hasRoot && hasLegacy) {
						fixture.quickInput.selections.push(rootFile);
					}
					await new OpenWorkspaceFolderMcpResourceCommand().run(fixture.instantiation);
					assert.deepStrictEqual({
						opened: fixture.opened.map(uri => uri.path),
						pickers: fixture.quickInput.pickLabels,
						installs: fixture.installs,
					}, {
						opened: [fixture.folder.toResource(hasRoot || (!hasLegacy && enabled) ? rootFile : legacyFile).path],
						pickers: hasRoot && hasLegacy ? [[rootFile, legacyFile]] : [],
						installs: [],
					});
				});

				test(`add destination: enabled=${enabled}, root=${hasRoot}, legacy=${hasLegacy}`, async () => {
					const fixture = setup(enabled, existing);
					if (enabled && hasLegacy) {
						fixture.quickInput.selections.push(rootFile);
					}
					const result = await fixture.destination.selectForAdd(fixture.folder, installable);
					assert.deepStrictEqual({
						result,
						pickers: fixture.quickInput.pickLabels,
						descriptions: fixture.quickInput.pickOptions.map(options => options.descriptions),
					}, {
						result: enabled ? WorkspaceMcpConfigKind.Root : WorkspaceMcpConfigKind.LegacyVscode,
						pickers: enabled && hasLegacy ? [[rootFile, legacyFile]] : [],
						descriptions: enabled && hasLegacy ? [['Workspace root', 'Deprecated']] : [],
					});
				});
			}
		}
	}

	test('opening either file can be cancelled without opening or installing', async () => {
		const fixture = setup(false, [rootFile, legacyFile]);
		fixture.quickInput.selections.push(undefined);
		await new OpenWorkspaceFolderMcpResourceCommand().run(fixture.instantiation);
		assert.deepStrictEqual({ opened: fixture.opened, installs: fixture.installs }, { opened: [], installs: [] });
	});

	for (const operation of ['open', 'add'] as const) {
		test(`${operation} surfaces file provider failures instead of treating them as absence`, async () => {
			const fixture = setup(true);
			const error = new FileOperationError('Provider unavailable', FileOperationResult.FILE_OTHER_ERROR);
			fixture.instantiation.stub(IFileService, 'resolve', async () => { throw error; });
			if (operation === 'open') {
				await assert.rejects(fixture.destination.selectForOpen(fixture.folder), error);
			} else {
				await assert.rejects(fixture.destination.selectForAdd(fixture.folder, installable), error);
			}
			assert.deepStrictEqual({ pickers: fixture.quickInput.pickLabels, installs: fixture.installs }, { pickers: [], installs: [] });
		});
	}

	test('multi-root open preserves folder selection and inspects only the selected folder', async () => {
		const fixture = setup(true, [], true);
		fixture.instantiation.stub(ICommandService, 'executeCommand', async () => fixture.secondFolder);
		await new OpenWorkspaceFolderMcpResourceCommand().run(fixture.instantiation);
		assert.deepStrictEqual({
			opened: fixture.opened.map(uri => uri.path),
			checked: fixture.existenceChecks,
			pickers: fixture.quickInput.pickLabels,
		}, {
			opened: [fixture.secondFolder.toResource(rootFile).path],
			checked: [fixture.secondFolder.toResource(rootFile).path, fixture.secondFolder.toResource(legacyFile).path],
			pickers: [],
		});
	});

	for (const selection of [legacyFile, undefined]) {
		test(`unsupported root configuration offers explicit legacy selection: ${selection}`, async () => {
			const fixture = setup(true);
			fixture.quickInput.selections.push(selection);
			const server = { ...installable, inputs: [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }] };
			const result = await fixture.destination.selectForAdd(fixture.folder, server);
			assert.deepStrictEqual({
				result,
				pickers: fixture.quickInput.pickLabels,
				placeholder: fixture.quickInput.pickOptions[0].placeholder,
				details: fixture.quickInput.pickOptions[0].details,
				checked: fixture.existenceChecks,
			}, {
				result: selection ? WorkspaceMcpConfigKind.LegacyVscode : undefined,
				pickers: [[legacyFile]],
				placeholder: 'This server requires .vscode/mcp.json',
				details: ['\'inputs\' is not supported in .mcp.json. Use .vscode/mcp.json.'],
				checked: [],
			});
		});
	}

	test('explicit unsupported root destination fails rather than rerouting', async () => {
		const fixture = setup(true);
		await assert.rejects(fixture.destination.selectForAdd(fixture.folder, { ...installable, inputs: [{ id: 'token', type: McpServerVariableType.PROMPT, description: 'Token', password: true }] }, WorkspaceMcpConfigKind.Root));
		assert.deepStrictEqual({ pickers: fixture.quickInput.pickLabels, installs: fixture.installs }, { pickers: [], installs: [] });
	});

	for (const enabled of [false, true]) {
		test(`manual multi-root Add Server folder choices follow the flag: ${enabled}`, async () => {
			const fixture = setup(enabled, [], true);
			fixture.quickInput.selections.push('Command (stdio)', enabled ? fixture.secondFolder.name : 'Workspace');
			fixture.quickInput.inputs.push('node server.js', installable.name);
			await new AddConfigurationAction().run(fixture.instantiation);
			assert.deepStrictEqual({
				scopes: fixture.quickInput.pickLabels[1],
				target: fixture.installs[0].options?.target,
				kind: fixture.installs[0].options?.workspaceConfig,
				opened: fixture.opened.map(uri => uri.path),
				selections: fixture.selections,
				started: fixture.started,
			}, {
				scopes: enabled ? ['Global', 'Workspace', fixture.folder.name, fixture.secondFolder.name] : ['Global', 'Workspace'],
				target: enabled ? fixture.secondFolder : ConfigurationTarget.WORKSPACE,
				kind: enabled ? WorkspaceMcpConfigKind.Root : undefined,
				opened: [enabled ? fixture.secondFolder.toResource(rootFile).path : fixture.workspace.configuration!.path],
				selections: [new Range(3, 1, 3, 5)],
				started: [`installed:${enabled ? fixture.secondFolder.toResource(rootFile).path : fixture.workspace.configuration!.path}`],
			});
		});
	}

	test('manual folder add cancellation does not install, reveal, or start', async () => {
		const fixture = setup(true, [legacyFile]);
		fixture.quickInput.selections.push('Command (stdio)', 'Workspace', undefined);
		fixture.quickInput.inputs.push('node server.js', installable.name);
		await new AddConfigurationAction().run(fixture.instantiation);
		assert.deepStrictEqual({ installed: fixture.installs, opened: fixture.opened, started: fixture.started, errors: fixture.errors }, { installed: [], opened: [], started: [], errors: [] });
	});

	test('manual add with interpolation requires explicit legacy confirmation', async () => {
		const fixture = setup(true);
		fixture.quickInput.selections.push('Command (stdio)', 'Workspace', legacyFile);
		fixture.quickInput.inputs.push('node ${input:token}', installable.name);
		await new AddConfigurationAction().run(fixture.instantiation);
		assert.deepStrictEqual({
			lastPicker: fixture.quickInput.pickLabels.at(-1),
			kind: fixture.installs[0].options?.workspaceConfig,
			opened: fixture.opened.map(uri => uri.path),
		}, {
			lastPicker: [legacyFile],
			kind: WorkspaceMcpConfigKind.LegacyVscode,
			opened: [fixture.folder.toResource(legacyFile).path],
		});
	});

	test('manual add still offers the aggregate workspace when enabled', async () => {
		const fixture = setup(true, [legacyFile], true);
		fixture.quickInput.selections.push('Command (stdio)', 'Workspace');
		fixture.quickInput.inputs.push('node server.js', installable.name);
		await new AddConfigurationAction().run(fixture.instantiation);
		assert.deepStrictEqual({
			pickerCount: fixture.quickInput.pickLabels.length,
			options: fixture.installs[0].options,
			opened: fixture.opened.map(uri => uri.path),
		}, {
			pickerCount: 2,
			options: { target: ConfigurationTarget.WORKSPACE, workspaceConfig: undefined },
			opened: [fixture.workspace.configuration!.path],
		});
	});

	for (const file of [rootFile, legacyFile]) {
		test(`editor Add Server preserves ${file} and skips scope/file selection`, async () => {
			const fixture = setup(true, [rootFile, legacyFile]);
			fixture.quickInput.selections.push('Command (stdio)');
			fixture.quickInput.inputs.push('node server.js', installable.name);
			const resource = fixture.folder.toResource(file);
			await new AddConfigurationAction().run(fixture.instantiation, resource);
			assert.deepStrictEqual({
				pickerCount: fixture.quickInput.pickLabels.length,
				kind: fixture.installs[0].options?.workspaceConfig,
				opened: fixture.opened.map(uri => uri.path),
				selections: fixture.selections,
				started: fixture.started,
				errors: fixture.errors,
			}, {
				pickerCount: 1,
				kind: file === rootFile ? WorkspaceMcpConfigKind.Root : WorkspaceMcpConfigKind.LegacyVscode,
				opened: [resource.path],
				selections: [new Range(3, 1, 3, 5)],
				started: [`installed:${resource.path}`],
				errors: [],
			});
		});
	}

	test('legacy editor Add Server still works with the flag off and a string URI', async () => {
		const fixture = setup(false, [rootFile, legacyFile]);
		fixture.quickInput.selections.push('Command (stdio)');
		fixture.quickInput.inputs.push('node server.js', installable.name);
		await new AddConfigurationAction().run(fixture.instantiation, fixture.folder.toResource(legacyFile).toString());
		assert.deepStrictEqual({
			pickerCount: fixture.quickInput.pickLabels.length,
			kind: fixture.installs[0].options?.workspaceConfig,
			opened: fixture.opened.map(uri => uri.path),
		}, {
			pickerCount: 1,
			kind: WorkspaceMcpConfigKind.LegacyVscode,
			opened: [fixture.folder.toResource(legacyFile).path],
		});
	});

	for (const path of ['/project/nested/.mcp.json', '/outside/.mcp.json', '/project/settings.json']) {
		test(`invalid editor destination fails before prompting: ${path}`, async () => {
			const fixture = setup(true);
			await new AddConfigurationAction().run(fixture.instantiation, URI.file(path));
			assert.deepStrictEqual({ pickers: fixture.quickInput.pickLabels, installs: fixture.installs, errors: fixture.errors }, {
				pickers: [],
				installs: [],
				errors: [new Error('Select a .mcp.json or .vscode/mcp.json file at the root of an open workspace folder.')],
			});
		});
	}

	test('explicit root editor add is rejected when the flag is off', async () => {
		const fixture = setup(false, [rootFile]);
		await new AddConfigurationAction().run(fixture.instantiation, fixture.folder.toResource(rootFile));
		assert.deepStrictEqual({ pickers: fixture.quickInput.pickLabels, installs: fixture.installs, errors: fixture.errors }, {
			pickers: [],
			installs: [],
			errors: [new Error('Enable chat.mcp.workspaceRootConfig.enabled to add servers to .mcp.json, or use .vscode/mcp.json.')],
		});
	});

	test('explicit root editor add notifies once for unsupported configuration without side effects', async () => {
		const fixture = setup(true, [rootFile, legacyFile]);
		fixture.quickInput.selections.push('Command (stdio)');
		fixture.quickInput.inputs.push('node ${input:token}', installable.name);
		await new AddConfigurationAction().run(fixture.instantiation, fixture.folder.toResource(rootFile));
		assert.deepStrictEqual({
			pickerCount: fixture.quickInput.pickLabels.length,
			installs: fixture.installs,
			opened: fixture.opened,
			started: fixture.started,
			errors: fixture.errors,
		}, {
			pickerCount: 1,
			installs: [],
			opened: [],
			started: [],
			errors: [new Error('\'${...}\' is not supported in .mcp.json. Use .vscode/mcp.json.')],
		});
	});

	for (const cancelled of [false, true]) {
		test(`editor add ${cancelled ? 'silently handles cancellation' : 'notifies once for an installation failure'}`, async () => {
			const fixture = setup(true, [rootFile, legacyFile]);
			const error = cancelled ? new CancellationError() : new Error('Unable to write MCP configuration');
			fixture.instantiation.stub(IWorkbenchMcpManagementService, 'install', async () => { throw error; });
			fixture.quickInput.selections.push('Command (stdio)');
			fixture.quickInput.inputs.push('node server.js', installable.name);
			await new AddConfigurationAction().run(fixture.instantiation, fixture.folder.toResource(rootFile));
			assert.deepStrictEqual({ errors: fixture.errors, opened: fixture.opened, started: fixture.started }, {
				errors: cancelled ? [] : [error],
				opened: [],
				started: [],
			});
		});
	}

	test('editor menu retains AI gates and only offers root additions when enabled', () => {
		const menu = new AddConfigurationAction().desc.menu;
		assert.ok(menu && !Array.isArray(menu) && menu.when);
		const visible = (file: string, enabled: boolean, hidden = false) => {
			const values: Record<string, ContextKeyValue> = {
				[ResourceContextKey.Path.key]: `/project/${file}`,
				[ActiveEditorContext.key]: TEXT_FILE_EDITOR_ID,
				[`config.${mcpWorkspaceRootConfig}`]: enabled,
				[ChatContextKeys.Setup.hidden.key]: hidden,
				[ChatContextKeys.Setup.disabledInWorkspace.key]: false,
			};
			return menu.when!.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T });
		};
		assert.deepStrictEqual({
			rootOff: visible(rootFile, false),
			rootOn: visible(rootFile, true),
			legacyOff: visible(legacyFile, false),
			legacyOn: visible(legacyFile, true),
			hiddenRoot: visible(rootFile, true, true),
			hiddenLegacy: visible(legacyFile, true, true),
			otherFile: visible('settings.json', true),
		}, {
			rootOff: false,
			rootOn: true,
			legacyOff: true,
			legacyOn: true,
			hiddenRoot: false,
			hiddenLegacy: false,
			otherFile: false,
		});
	});

	for (const gallery of [false, true]) {
		for (const enabled of [false, true]) {
			test(`Install in Workspace: gallery=${gallery}, enabled=${enabled}`, async () => {
				const fixture = setup(enabled, [legacyFile]);
				if (!gallery && enabled) {
					fixture.quickInput.selections.push(rootFile);
				}
				const action = store.add(fixture.instantiation.createInstance(InstallInWorkspaceAction, false));
				action.mcpServer = upcastPartial<IWorkbenchMcpServer>({
					name: installable.name,
					gallery: gallery ? upcastPartial<IGalleryMcpServer>({ name: installable.name }) : undefined,
					installable: gallery ? undefined : installable,
					installState: McpServerInstallState.Uninstalled,
				});
				await action.run();
				const file = !gallery && enabled ? rootFile : legacyFile;
				assert.deepStrictEqual({
					kind: fixture.installs[0].options?.workspaceConfig,
					pickers: fixture.quickInput.pickLabels,
					started: fixture.started,
				}, {
					kind: !gallery && enabled ? WorkspaceMcpConfigKind.Root : WorkspaceMcpConfigKind.LegacyVscode,
					pickers: !gallery && enabled ? [[rootFile, legacyFile]] : [],
					started: [`installed:${fixture.folder.toResource(file).path}`],
				});
			});
		}
	}

	test('raw URL workspace install can cancel the configuration-file picker', async () => {
		const fixture = setup(true, [legacyFile]);
		fixture.quickInput.selections.push(undefined);
		const action = store.add(fixture.instantiation.createInstance(InstallInWorkspaceAction, false));
		action.mcpServer = upcastPartial<IWorkbenchMcpServer>({ name: installable.name, installable, installState: McpServerInstallState.Uninstalled });
		await action.run();
		assert.deepStrictEqual({ installs: fixture.installs, started: fixture.started }, { installs: [], started: [] });
	});

	test('gallery workspace install keeps folder and aggregate scope selection', async () => {
		const fixture = setup(true, [legacyFile], true);
		fixture.quickInput.selections.push('Workspace');
		const action = store.add(fixture.instantiation.createInstance(InstallInWorkspaceAction, false));
		action.mcpServer = upcastPartial<IWorkbenchMcpServer>({ name: installable.name, gallery: upcastPartial<IGalleryMcpServer>({ name: installable.name }), installState: McpServerInstallState.Uninstalled });
		await action.run();
		assert.deepStrictEqual({
			pickers: fixture.quickInput.pickLabels,
			options: fixture.installs[0].options,
		}, {
			pickers: [[fixture.folder.name, fixture.secondFolder.name, 'Workspace']],
			options: { target: ConfigurationTarget.WORKSPACE, workspaceConfig: undefined },
		});
	});

	for (const remote of [false, true]) {
		test(`${remote ? 'remote' : 'global'} install starts the exact installed ID`, async () => {
			const fixture = setup(true);
			if (remote) {
				fixture.instantiation.stub(IWorkbenchEnvironmentService, { remoteAuthority: 'test-remote' });
				fixture.instantiation.stub(ILabelService, { getHostLabel: () => 'Remote' });
			}
			const action = store.add(remote ? fixture.instantiation.createInstance(InstallInRemoteAction, false) : fixture.instantiation.createInstance(InstallAction, false));
			action.mcpServer = upcastPartial<IWorkbenchMcpServer>({ name: installable.name, installable, installState: McpServerInstallState.Uninstalled });
			await action.run();
			assert.deepStrictEqual(fixture.started, [`installed:/${remote ? 'remote' : 'user'}/mcp.json`]);
		});
	}

	test('Show Configuration (JSON) selects the exact ID among duplicate names', async () => {
		const fixture = setup(true);
		const legacy = fixture.runtimeServer('legacy-id', fixture.folder.toResource(legacyFile));
		const root = fixture.runtimeServer('root-id', fixture.folder.toResource(rootFile));
		fixture.servers.set([legacy, root], undefined);
		const action = store.add(fixture.instantiation.createInstance(ShowServerJsonConfigurationAction));
		action.mcpServer = upcastPartial<IWorkbenchMcpServer>({ id: 'root-id', name: installable.name, local: upcastPartial<IWorkbenchLocalMcpServer>({ id: 'root-id' }) });
		await action.run();
		assert.deepStrictEqual(fixture.opened.map(uri => uri.path), [fixture.folder.toResource(rootFile).path]);
	});

	test('startup waits for the installed ID instead of starting an existing same-name server', async () => {
		const fixture = setup(true);
		const legacy = fixture.runtimeServer('legacy-id', fixture.folder.toResource(legacyFile));
		const root = fixture.runtimeServer('root-id', fixture.folder.toResource(rootFile));
		fixture.servers.set([legacy], undefined);
		const waiting = startServerByFilter(fixture.instantiation.get(IMcpService), server => server.definition.id === 'root-id');
		const beforeDiscovery = [...fixture.started];
		fixture.servers.set([legacy, root], undefined);
		await waiting;
		assert.deepStrictEqual({ beforeDiscovery, afterDiscovery: fixture.started }, { beforeDiscovery: [], afterDiscovery: ['root-id'] });
	});

	test('startup timeout disposes the discovery observer', async () => {
		const fixture = setup(true);
		await assert.rejects(startServerByFilter(fixture.instantiation.get(IMcpService), () => true, 0), CancellationError);
		fixture.servers.set([fixture.runtimeServer('late-id', fixture.folder.toResource(rootFile))], undefined);
		assert.deepStrictEqual(fixture.started, []);
	});
});
