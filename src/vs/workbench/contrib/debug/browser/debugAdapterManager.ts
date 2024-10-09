/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import * as strings from '../../../../base/common/strings.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorModel } from '../../../../editor/common/editorCommon.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import * as nls from '../../../../nls.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { Breakpoints } from '../common/breakpoints.js';
import { CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_EXTENSION_AVAILABLE, IAdapterDescriptor, IAdapterManager, IConfig, IDebugAdapter, IDebugAdapterDescriptorFactory, IDebugAdapterFactory, IDebugConfiguration, IDebugSession, INTERNAL_CONSOLE_OPTIONS_SCHEMA } from '../common/debug.js';
import { Debugger } from '../common/debugger.js';
import { breakpointsExtPoint, debuggersExtPoint, launchSchema, presentationSchema } from '../common/debugSchemas.js';
import { TaskDefinitionRegistry } from '../../tasks/common/taskDefinitionRegistry.js';
import { ITaskService } from '../../tasks/common/taskService.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

const jsonRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

export interface IAdapterManagerDelegate {
	onDidNewSession: Event<IDebugSession>;
}

export class AdapterManager extends Disposable implements IAdapterManager {

	private debuggers: Debugger[];
	private adapterDescriptorFactories: IDebugAdapterDescriptorFactory[];
	private debugAdapterFactories = new Map<string, IDebugAdapterFactory>();
	private debuggersAvailable!: IContextKey<boolean>;
	private debugExtensionsAvailable!: IContextKey<boolean>;
	private readonly _onDidRegisterDebugger = new Emitter<void>();
	private readonly _onDidDebuggersExtPointRead = new Emitter<void>();
	private breakpointContributions: Breakpoints[] = [];
	private debuggerWhenKeys = new Set<string>();
	private taskLabels: string[] = [];

	/** Extensions that were already active before any debugger activation events */
	private earlyActivatedExtensions: Set<string> | undefined;

	private usedDebugTypes = new Set<string>();

	constructor(
		delegate: IAdapterManagerDelegate,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ITaskService private readonly tasksService: ITaskService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();
		this.adapterDescriptorFactories = [];
		this.debuggers = [];
		this.registerListeners();
		this.contextKeyService.bufferChangeEvents(() => {
			this.debuggersAvailable = CONTEXT_DEBUGGERS_AVAILABLE.bindTo(contextKeyService);
			this.debugExtensionsAvailable = CONTEXT_DEBUG_EXTENSION_AVAILABLE.bindTo(contextKeyService);
		});
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this.debuggerWhenKeys)) {
				this.debuggersAvailable.set(this.hasEnabledDebuggers());
				this.updateDebugAdapterSchema();
			}
		}));
		this._register(this.onDidDebuggersExtPointRead(() => {
			this.debugExtensionsAvailable.set(this.debuggers.length > 0);
		}));

		// generous debounce since this will end up calling `resolveTask` internally
		const updateTaskScheduler = this._register(new RunOnceScheduler(() => this.updateTaskLabels(), 5000));

		this._register(Event.any(tasksService.onDidChangeTaskConfig, tasksService.onDidChangeTaskProviders)(() => {
			updateTaskScheduler.cancel();
			updateTaskScheduler.schedule();
		}));
		this.lifecycleService.when(LifecyclePhase.Eventually)
			.then(() => this.debugExtensionsAvailable.set(this.debuggers.length > 0)); // If no extensions with a debugger contribution are loaded

		this._register(delegate.onDidNewSession(s => {
			this.usedDebugTypes.add(s.configuration.type);
		}));

		updateTaskScheduler.schedule();
	}

	private registerListeners(): void {
		debuggersExtPoint.setHandler((extensions, delta) => {
			delta.added.forEach(added => {
				added.value.forEach(rawAdapter => {
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						added.collector.error(nls.localize('debugNoType', "Debugger 'type' can not be omitted and must be of type 'string'."));
					}

					if (rawAdapter.type !== '*') {
						const existing = this.getDebugger(rawAdapter.type);
						if (existing) {
							existing.merge(rawAdapter, added.description);
						} else {
							const dbg = this.instantiationService.createInstance(Debugger, this, rawAdapter, added.description);
							dbg.when?.keys().forEach(key => this.debuggerWhenKeys.add(key));
							this.debuggers.push(dbg);
						}
					}
				});
			});

			// take care of all wildcard contributions
			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					if (rawAdapter.type === '*') {
						this.debuggers.forEach(dbg => dbg.merge(rawAdapter, extension.description));
					}
				});
			});

			delta.removed.forEach(removed => {
				const removedTypes = removed.value.map(rawAdapter => rawAdapter.type);
				this.debuggers = this.debuggers.filter(d => removedTypes.indexOf(d.type) === -1);
			});

			this.updateDebugAdapterSchema();
			this._onDidDebuggersExtPointRead.fire();
		});

		breakpointsExtPoint.setHandler(extensions => {
			this.breakpointContributions = extensions.flatMap(ext => ext.value.map(breakpoint => this.instantiationService.createInstance(Breakpoints, breakpoint)));
		});
	}

	private updateTaskLabels() {
		this.tasksService.getKnownTasks().then(tasks => {
			this.taskLabels = tasks.map(task => task._label);
			this.updateDebugAdapterSchema();
		});
	}

	private updateDebugAdapterSchema() {
		// update the schema to include all attributes, snippets and types from extensions.
		const items = (<IJSONSchema>launchSchema.properties!['configurations'].items);
		const taskSchema = TaskDefinitionRegistry.getJsonSchema();
		const definitions: IJSONSchemaMap = {
			'common': {
				properties: {
					'name': {
						type: 'string',
						description: nls.localize('debugName', "Name of configuration; appears in the launch configuration dropdown menu."),
						default: 'Launch'
					},
					'debugServer': {
						type: 'number',
						description: nls.localize('debugServer', "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode"),
						default: 4711
					},
					'preLaunchTask': {
						anyOf: [taskSchema, {
							type: ['string']
						}],
						default: '',
						defaultSnippets: [{ body: { task: '', type: '' } }],
						description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts."),
						examples: this.taskLabels,
					},
					'postDebugTask': {
						anyOf: [taskSchema, {
							type: ['string'],
						}],
						default: '',
						defaultSnippets: [{ body: { task: '', type: '' } }],
						description: nls.localize('debugPostDebugTask', "Task to run after debug session ends."),
						examples: this.taskLabels,
					},
					'presentation': presentationSchema,
					'internalConsoleOptions': INTERNAL_CONSOLE_OPTIONS_SCHEMA,
					'suppressMultipleSessionWarning': {
						type: 'boolean',
						description: nls.localize('suppressMultipleSessionWarning', "Disable the warning when trying to start the same debug configuration more than once."),
						default: true
					}
				}
			}
		};
		launchSchema.definitions = definitions;
		items.oneOf = [];
		items.defaultSnippets = [];
		this.debuggers.forEach(adapter => {
			const schemaAttributes = adapter.getSchemaAttributes(definitions);
			if (schemaAttributes && items.oneOf) {
				items.oneOf.push(...schemaAttributes);
			}
			const configurationSnippets = adapter.configurationSnippets;
			if (configurationSnippets && items.defaultSnippets) {
				items.defaultSnippets.push(...configurationSnippets);
			}
		});
		jsonRegistry.registerSchema(launchSchemaId, launchSchema);
	}

	registerDebugAdapterFactory(debugTypes: string[], debugAdapterLauncher: IDebugAdapterFactory): IDisposable {
		debugTypes.forEach(debugType => this.debugAdapterFactories.set(debugType, debugAdapterLauncher));
		this.debuggersAvailable.set(this.hasEnabledDebuggers());
		this._onDidRegisterDebugger.fire();

		return {
			dispose: () => {
				debugTypes.forEach(debugType => this.debugAdapterFactories.delete(debugType));
			}
		};
	}

	hasEnabledDebuggers(): boolean {
		for (const [type] of this.debugAdapterFactories) {
			const dbg = this.getDebugger(type);
			if (dbg && dbg.enabled) {
				return true;
			}
		}

		return false;
	}

	createDebugAdapter(session: IDebugSession): IDebugAdapter | undefined {
		const factory = this.debugAdapterFactories.get(session.configuration.type);
		if (factory) {
			return factory.createDebugAdapter(session);
		}
		return undefined;
	}

	substituteVariables(debugType: string, folder: IWorkspaceFolder | undefined, config: IConfig): Promise<IConfig> {
		const factory = this.debugAdapterFactories.get(debugType);
		if (factory) {
			return factory.substituteVariables(folder, config);
		}
		return Promise.resolve(config);
	}

	runInTerminal(debugType: string, args: DebugProtocol.RunInTerminalRequestArguments, sessionId: string): Promise<number | undefined> {
		const factory = this.debugAdapterFactories.get(debugType);
		if (factory) {
			return factory.runInTerminal(args, sessionId);
		}
		return Promise.resolve(void 0);
	}

	registerDebugAdapterDescriptorFactory(debugAdapterProvider: IDebugAdapterDescriptorFactory): IDisposable {
		this.adapterDescriptorFactories.push(debugAdapterProvider);
		return {
			dispose: () => {
				this.unregisterDebugAdapterDescriptorFactory(debugAdapterProvider);
			}
		};
	}

	unregisterDebugAdapterDescriptorFactory(debugAdapterProvider: IDebugAdapterDescriptorFactory): void {
		const ix = this.adapterDescriptorFactories.indexOf(debugAdapterProvider);
		if (ix >= 0) {
			this.adapterDescriptorFactories.splice(ix, 1);
		}
	}

	getDebugAdapterDescriptor(session: IDebugSession): Promise<IAdapterDescriptor | undefined> {
		const config = session.configuration;
		const providers = this.adapterDescriptorFactories.filter(p => p.type === config.type && p.createDebugAdapterDescriptor);
		if (providers.length === 1) {
			return providers[0].createDebugAdapterDescriptor(session);
		} else {
			// TODO@AW handle n > 1 case
		}
		return Promise.resolve(undefined);
	}

	getDebuggerLabel(type: string): string | undefined {
		const dbgr = this.getDebugger(type);
		if (dbgr) {
			return dbgr.label;
		}

		return undefined;
	}

	get onDidRegisterDebugger(): Event<void> {
		return this._onDidRegisterDebugger.event;
	}

	get onDidDebuggersExtPointRead(): Event<void> {
		return this._onDidDebuggersExtPointRead.event;
	}

	canSetBreakpointsIn(model: ITextModel): boolean {
		const languageId = model.getLanguageId();
		if (!languageId || languageId === 'jsonc' || languageId === 'log') {
			// do not allow breakpoints in our settings files and output
			return false;
		}
		if (this.configurationService.getValue<IDebugConfiguration>('debug').allowBreakpointsEverywhere) {
			return true;
		}

		return this.breakpointContributions.some(breakpoints => breakpoints.language === languageId && breakpoints.enabled);
	}

	getDebugger(type: string): Debugger | undefined {
		return this.debuggers.find(dbg => strings.equalsIgnoreCase(dbg.type, type));
	}

	getEnabledDebugger(type: string): Debugger | undefined {
		const adapter = this.getDebugger(type);
		return adapter && adapter.enabled ? adapter : undefined;
	}

	someDebuggerInterestedInLanguage(languageId: string): boolean {
		return !!this.debuggers
			.filter(d => d.enabled)
			.find(a => a.interestedInLanguage(languageId));
	}

	async guessDebugger(gettingConfigurations: boolean): Promise<Debugger | undefined> {
		const activeTextEditorControl = this.editorService.activeTextEditorControl;
		let candidates: Debugger[] = [];
		let languageLabel: string | null = null;
		let model: IEditorModel | null = null;
		if (isCodeEditor(activeTextEditorControl)) {
			model = activeTextEditorControl.getModel();
			const language = model ? model.getLanguageId() : undefined;
			if (language) {
				languageLabel = this.languageService.getLanguageName(language);
			}
			const adapters = this.debuggers
				.filter(a => a.enabled)
				.filter(a => language && a.interestedInLanguage(language));
			if (adapters.length === 1) {
				return adapters[0];
			}
			if (adapters.length > 1) {
				candidates = adapters;
			}
		}

		// We want to get the debuggers that have configuration providers in the case we are fetching configurations
		// Or if a breakpoint can be set in the current file (good hint that an extension can handle it)
		if ((!languageLabel || gettingConfigurations || (model && this.canSetBreakpointsIn(model))) && candidates.length === 0) {
			await this.activateDebuggers('onDebugInitialConfigurations');

			candidates = this.debuggers
				.filter(a => a.enabled)
				.filter(dbg => dbg.hasInitialConfiguration() || dbg.hasDynamicConfigurationProviders() || dbg.hasConfigurationProvider());
		}

		if (candidates.length === 0 && languageLabel) {
			if (languageLabel.indexOf(' ') >= 0) {
				languageLabel = `'${languageLabel}'`;
			}
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Warning,
				message: nls.localize('CouldNotFindLanguage', "You don't have an extension for debugging {0}. Should we find a {0} extension in the Marketplace?", languageLabel),
				primaryButton: nls.localize({ key: 'findExtension', comment: ['&& denotes a mnemonic'] }, "&&Find {0} extension", languageLabel)
			});
			if (confirmed) {
				await this.commandService.executeCommand('debug.installAdditionalDebuggers', languageLabel);
			}
			return undefined;
		}

		this.initExtensionActivationsIfNeeded();

		candidates.sort((first, second) => first.label.localeCompare(second.label));
		candidates = candidates.filter(a => !a.isHiddenFromDropdown);

		const suggestedCandidates: Debugger[] = [];
		const otherCandidates: Debugger[] = [];
		candidates.forEach(d => {
			const descriptor = d.getMainExtensionDescriptor();
			if (descriptor.id && !!this.earlyActivatedExtensions?.has(descriptor.id)) {
				// Was activated early
				suggestedCandidates.push(d);
			} else if (this.usedDebugTypes.has(d.type)) {
				// Was used already
				suggestedCandidates.push(d);
			} else {
				otherCandidates.push(d);
			}
		});

		const picks: ({ label: string; debugger?: Debugger; type?: string } | MenuItemAction)[] = [];
		if (suggestedCandidates.length > 0) {
			picks.push(
				{ type: 'separator', label: nls.localize('suggestedDebuggers', "Suggested") },
				...suggestedCandidates.map(c => ({ label: c.label, debugger: c })));
		}

		if (otherCandidates.length > 0) {
			if (picks.length > 0) {
				picks.push({ type: 'separator', label: '' });
			}

			picks.push(...otherCandidates.map(c => ({ label: c.label, debugger: c })));
		}

		picks.push(
			{ type: 'separator', label: '' },
			{ label: languageLabel ? nls.localize('installLanguage', "Install an extension for {0}...", languageLabel) : nls.localize('installExt', "Install extension...") });

		const contributed = this.menuService.getMenuActions(MenuId.DebugCreateConfiguration, this.contextKeyService);
		for (const [, action] of contributed) {
			for (const item of action) {
				picks.push(item);
			}
		}
		const placeHolder = nls.localize('selectDebug', "Select debugger");
		return this.quickInputService.pick<{ label: string; debugger?: Debugger } | IQuickPickItem>(picks, { activeItem: picks[0], placeHolder })
			.then(async picked => {
				if (picked && 'debugger' in picked && picked.debugger) {
					return picked.debugger;
				} else if (picked instanceof MenuItemAction) {
					picked.run();
					return;
				}
				if (picked) {
					this.commandService.executeCommand('debug.installAdditionalDebuggers', languageLabel);
				}
				return undefined;
			});
	}

	private initExtensionActivationsIfNeeded(): void {
		if (!this.earlyActivatedExtensions) {
			this.earlyActivatedExtensions = new Set<string>();

			const status = this.extensionService.getExtensionsStatus();
			for (const id in status) {
				if (!!status[id].activationTimes) {
					this.earlyActivatedExtensions.add(id);
				}
			}
		}
	}

	async activateDebuggers(activationEvent: string, debugType?: string): Promise<void> {
		this.initExtensionActivationsIfNeeded();

		const promises: Promise<any>[] = [
			this.extensionService.activateByEvent(activationEvent),
			this.extensionService.activateByEvent('onDebug')
		];
		if (debugType) {
			promises.push(this.extensionService.activateByEvent(`${activationEvent}:${debugType}`));
		}
		await Promise.all(promises);
	}
}
