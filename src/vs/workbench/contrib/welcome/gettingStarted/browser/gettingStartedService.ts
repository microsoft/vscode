/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService, optional, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IUserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { FileAccess } from 'vs/base/common/network';
import { DefaultIconPath, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { BuiltinGettingStartedCategory, BuiltinGettingStartedStep, BuiltinGettingStartedStartEntry, startEntries, walkthroughs } from 'vs/workbench/contrib/welcome/gettingStarted/common/gettingStartedContent';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { assertIsDefined } from 'vs/base/common/types';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILink, LinkedText, parseLinkedText } from 'vs/base/common/linkedText';
import { walkthroughsExtensionPoint, startEntriesExtensionPoint } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedExtensionPoint';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { dirname } from 'vs/base/common/path';
import { coalesce, flatten } from 'vs/base/common/arrays';
import { IViewsService } from 'vs/workbench/common/views';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import product from 'vs/platform/product/common/product';

export const WorkspacePlatform = new RawContextKey<'mac' | 'linux' | 'windows' | undefined>('workspacePlatform', undefined, localize('workspacePlatform', "The platform of the current workspace, which in remote contexts may be different from the platform of the UI"));
export const HasMultipleNewFileEntries = new RawContextKey<boolean>('hasMultipleNewFileEntries', false);

export const IGettingStartedService = createDecorator<IGettingStartedService>('gettingStartedService');

export const hiddenEntriesConfigurationKey = 'workbench.welcomePage.hiddenCategories';

export const walkthroughMetadataConfigurationKey = 'workbench.welcomePage.walkthroughMetadata';
export type WalkthroughMetaDataType = Map<string, { firstSeen: number; stepIDs: string[]; manaullyOpened: boolean }>;

export const enum GettingStartedCategory {
	Beginner = 'Beginner',
	Intermediate = 'Intermediate',
	Advanced = 'Advanced'
}

type LegacyButtonConfig =
	| { title: string, command?: never, link: string }
	| { title: string, command: string, link?: never, sideBySide?: boolean };

export interface IGettingStartedStep {
	id: string
	title: string
	description: LinkedText[]
	category: GettingStartedCategory | string
	when: ContextKeyExpression
	order: number
	/** @deprecated */
	doneOn?: { commandExecuted: string, eventFired?: never } | { eventFired: string, commandExecuted?: never }
	completionEvents: string[]
	media:
	| { type: 'image', path: { hc: URI, light: URI, dark: URI }, altText: string }
	| { type: 'svg', path: URI, altText: string }
	| { type: 'markdown', path: URI, base: URI, root: URI }
}

export interface IGettingStartedWalkthroughDescriptor {
	id: GettingStartedCategory | string
	title: string
	description: string
	isFeatured: boolean
	order: number
	next?: string
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'steps' }
}

export enum IGettingStartedNewMenuEntryDescriptorCategory {
	'file',
	'notebook',
	'folder',
}


export interface IGettingStartedNewMenuEntryDescriptor {
	title: string
	description?: string
	when?: ContextKeyExpression
	from: string
	sourceExtensionId?: string
	category: IGettingStartedNewMenuEntryDescriptorCategory
	action: { runCommand: string, invokeFunction?: never } | { invokeFunction: (accessor: ServicesAccessor) => void, runCommand?: never }
}

export const CoreNewEntryDisplayName = localize('builtinProviderDisplayName', "Built-in");

export interface IGettingStartedStartEntryDescriptor {
	id: GettingStartedCategory | string
	title: string
	description: string
	order: number
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'startEntry', command: string }
}

export interface IGettingStartedCategory {
	id: GettingStartedCategory | string
	title: string
	description: string
	isFeatured: boolean
	order: number
	next?: string
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'steps', steps: IGettingStartedStep[] }
	| { type: 'startEntry', command: string }
}

type StepProgress = { done?: boolean; };
export interface IGettingStartedStepWithProgress extends IGettingStartedStep, Required<StepProgress> { }

export interface IGettingStartedCategoryWithProgress extends Omit<IGettingStartedCategory, 'content'> {
	priority: number
	content:
	| {
		type: 'steps',
		steps: IGettingStartedStepWithProgress[],
		accolades: 'newCategory' | 'newContent' | 'featured' | undefined
		done: boolean;
		stepsComplete: number
		stepsTotal: number
	}
	| { type: 'startEntry', command: string }
}

export interface IGettingStartedService {
	_serviceBrand: undefined,

	readonly onDidAddCategory: Event<void>
	readonly onDidRemoveCategory: Event<void>

	readonly onDidChangeStep: Event<IGettingStartedStepWithProgress>
	readonly onDidChangeCategory: Event<IGettingStartedCategoryWithProgress>

	readonly onDidProgressStep: Event<IGettingStartedStepWithProgress>

	getCategories(): IGettingStartedCategoryWithProgress[]

	registerWalkthrough(categoryDescriptor: IGettingStartedWalkthroughDescriptor, steps: IGettingStartedStep[]): void;

	progressByEvent(eventName: string): void;
	progressStep(id: string): void;
	deprogressStep(id: string): void;

	selectNewEntry(categories: IGettingStartedNewMenuEntryDescriptorCategory[]): Promise<void>;

	markWalkthroughOpened(id: string): void;

	installedExtensionsRegistered: Promise<void>;
}

// Show walkthrough as "new" for 7 days after first install
const NEW_WALKTHROUGH_TIME = 7 * 24 * 60 * 60 * 1000;

export class GettingStartedService extends Disposable implements IGettingStartedService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddNewEntry = new Emitter<void>();
	onDidAddNewEntry: Event<void> = this._onDidAddNewEntry.event;

	private readonly _onDidAddCategory = new Emitter<void>();
	onDidAddCategory: Event<void> = this._onDidAddCategory.event;

	private readonly _onDidRemoveCategory = new Emitter<void>();
	onDidRemoveCategory: Event<void> = this._onDidRemoveCategory.event;

	private readonly _onDidChangeCategory = new Emitter<IGettingStartedCategoryWithProgress>();
	onDidChangeCategory: Event<IGettingStartedCategoryWithProgress> = this._onDidChangeCategory.event;

	private readonly _onDidChangeStep = new Emitter<IGettingStartedStepWithProgress>();
	onDidChangeStep: Event<IGettingStartedStepWithProgress> = this._onDidChangeStep.event;

	private readonly _onDidProgressStep = new Emitter<IGettingStartedStepWithProgress>();
	onDidProgressStep: Event<IGettingStartedStepWithProgress> = this._onDidProgressStep.event;

	private memento: Memento;
	private stepProgress: Record<string, StepProgress>;

	private sessionEvents = new Set<string>();
	private completionListeners = new Map<string, Set<string>>();

	private gettingStartedContributions = new Map<string, IGettingStartedCategory>();
	private steps = new Map<string, IGettingStartedStep>();

	private tasExperimentService?: ITASExperimentService;
	private sessionInstalledExtensions = new Set<string>();

	private categoryVisibilityContextKeys = new Set<string>();
	private stepCompletionContextKeyExpressions = new Set<ContextKeyExpression>();
	private stepCompletionContextKeys = new Set<string>();

	private newMenuItems: IGettingStartedNewMenuEntryDescriptor[] = [];

	private triggerInstalledExtensionsRegistered!: () => void;
	installedExtensionsRegistered: Promise<void>;

	private metadata: WalkthroughMetaDataType;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@IUserDataAutoSyncEnablementService  readonly userDataAutoSyncEnablementService: IUserDataAutoSyncEnablementService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IHostService private readonly hostService: IHostService,
		@IViewsService private readonly viewsService: IViewsService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
	) {
		super();

		this.tasExperimentService = tasExperimentService;

		this.metadata = new Map(
			JSON.parse(
				this.storageService.get(walkthroughMetadataConfigurationKey, StorageScope.GLOBAL, '[]')));

		const builtinNewMenuItems = [
			{
				title: localize('newUntitledTitle', "Text File"),
				action: { runCommand: 'workbench.action.files.newUntitledFile' },
				category: IGettingStartedNewMenuEntryDescriptorCategory.file,
				from: CoreNewEntryDisplayName,
			},
			{
				title: localize('newGit', "Folder from Git Repo"),
				action: { runCommand: 'git.clone' },
				when: ContextKeyExpr.deserialize('!git.missing'),
				category: IGettingStartedNewMenuEntryDescriptorCategory.folder,
				from: CoreNewEntryDisplayName,
			}
		];

		builtinNewMenuItems.forEach(item => this.registerNewMenuItem(item));

		this.memento = new Memento('gettingStartedService', this.storageService);
		this.stepProgress = this.memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);

		startEntriesExtensionPoint.setHandler((_, { added, removed }) => {
			added.forEach(e => this.registerExtensionNewContributions(e.description));
			removed.forEach(e => this.unregisterExtensionNewContributions(e.description));
		});

		walkthroughsExtensionPoint.setHandler((_, { added, removed }) => {
			added.forEach(e => this.registerExtensionWalkthroughContributions(e.description));
			removed.forEach(e => this.unregisterExtensionWalkthroughContributions(e.description));
		});

		this._register(this.commandService.onDidExecuteCommand(command => this.progressByEvent(`onCommand:${command.commandId}`)));

		this.extensionManagementService.getInstalled().then(installed => {
			installed.forEach(ext => this.progressByEvent(`extensionInstalled:${ext.identifier.id.toLowerCase()}`));
		});

		this._register(this.extensionManagementService.onDidInstallExtension(async e => {
			if (await this.hostService.hadLastFocus()) {
				this.sessionInstalledExtensions.add(e.identifier.id.toLowerCase());
			}
			this.progressByEvent(`extensionInstalled:${e.identifier.id.toLowerCase()}`);
		}));

		this._register(this.contextService.onDidChangeContext(event => {
			if (event.affectsSome(this.categoryVisibilityContextKeys)) { this._onDidAddCategory.fire(); }
			if (event.affectsSome(this.stepCompletionContextKeys)) {
				this.stepCompletionContextKeyExpressions.forEach(expression => {
					if (event.affectsSome(new Set(expression.keys())) && this.contextService.contextMatchesRules(expression)) {
						this.progressByEvent(`onContext:` + expression.serialize());
					}
				});
			}
		}));

		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.visible) { this.progressByEvent('onView:' + e.id); }
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			e.affectedKeys.forEach(key => { this.progressByEvent('onSettingChanged:' + key); });
		}));

		HasMultipleNewFileEntries.bindTo(this.contextService).set(false);

		this.remoteAgentService.getEnvironment().then(env => {
			const remoteOS = env?.os;

			const remotePlatform =
				remoteOS === OS.Macintosh ? 'mac'
					: remoteOS === OS.Windows ? 'windows'
						: remoteOS === OS.Linux ? 'linux'
							: undefined;

			if (remotePlatform) {
				WorkspacePlatform.bindTo(this.contextService).set(remotePlatform);
			} else if (isMacintosh) {
				WorkspacePlatform.bindTo(this.contextService).set('mac');
			} else if (isLinux) {
				WorkspacePlatform.bindTo(this.contextService).set('linux');
			} else if (isWindows) {
				WorkspacePlatform.bindTo(this.contextService).set('windows');
			} else {
				WorkspacePlatform.bindTo(this.contextService).set(undefined);
			}
		});

		if (userDataAutoSyncEnablementService.isEnabled()) { this.progressByEvent('onEvent:sync-enabled'); }
		this._register(userDataAutoSyncEnablementService.onDidChangeEnablement(() => {
			if (userDataAutoSyncEnablementService.isEnabled()) { this.progressByEvent('onEvent:sync-enabled'); }
		}));

		this.installedExtensionsRegistered = new Promise(r => this.triggerInstalledExtensionsRegistered = r);

		startEntries.forEach(async (entry, index) => {
			this.getCategoryOverrides(entry);
			this.registerStartEntry({
				...entry,
				icon: { type: 'icon', icon: entry.icon },
				order: index,
				when: ContextKeyExpr.deserialize(entry.when) ?? ContextKeyExpr.true()
			});
		});

		walkthroughs.forEach(async (category, index) => {
			this.getCategoryOverrides(category);
			this.registerWalkthrough({
				...category,
				icon: { type: 'icon', icon: category.icon },
				order: index,
				when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true()
			},
				category.content.steps.map((step, index) => {
					this.getStepOverrides(step, category.id);
					return ({
						...step,
						completionEvents: step.completionEvents ?? [],
						description: parseDescription(step.description),
						category: category.id,
						order: index,
						when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
						media: step.media.type === 'image'
							? {
								type: 'image',
								altText: step.media.altText,
								path: convertInternalMediaPathsToBrowserURIs(step.media.path)
							}
							: step.media.type === 'svg'
								? {
									type: 'svg',
									altText: step.media.altText,
									path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcome/gettingStarted/common/media/' + step.media.path }) })
								}
								: {
									type: 'markdown',
									path: convertInternalMediaPathToFileURI(step.media.path).with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcome/gettingStarted/common/media/' + step.media.path }) }),
									base: FileAccess.asFileUri('vs/workbench/contrib/welcome/gettingStarted/common/media/', require),
									root: FileAccess.asFileUri('vs/workbench/contrib/welcome/gettingStarted/common/media/', require),
								},
					});
				}));
		});
	}

	public async selectNewEntry(categories: IGettingStartedNewMenuEntryDescriptorCategory[]) {
		const disposables = new DisposableStore();
		const qp = this.quickInputService.createQuickPick();
		qp.title = localize('createNew', "Create New...");
		qp.matchOnDetail = true;
		qp.matchOnDescription = true;

		if (this.newMenuItems.filter(entry => categories.includes(entry.category)).length === 1
			&& !(categories.length === 1 && categories[0] === IGettingStartedNewMenuEntryDescriptorCategory.folder)) {
			const selection = this.newMenuItems
				.filter(entry => categories.includes(entry.category))[0];

			if (selection) {
				if (selection.action.runCommand) {
					await this.commandService.executeCommand(selection.action.runCommand);
				} else if (selection.action.invokeFunction) {
					await this.instantiationService.invokeFunction<unknown>(selection.action.invokeFunction);
				}
			}
			return;
		}

		const refreshQp = () => {
			const items: (((IQuickPickItem & IGettingStartedNewMenuEntryDescriptor) | IQuickPickSeparator))[] = [];
			let lastSeparator: IGettingStartedNewMenuEntryDescriptorCategory | undefined;
			this.newMenuItems
				.filter(entry => categories.length === 0 || categories.includes(entry.category))
				.filter(entry => this.contextService.contextMatchesRules(entry.when))
				.forEach((entry) => {
					const command = entry.action.runCommand;
					const keybinding = this.keybindingService.lookupKeybinding(command || '', this.contextService);
					if (lastSeparator !== entry.category && categories.length !== 1) {
						items.push({
							type: 'separator',
							label: displayCategory[entry.category]
						});
						lastSeparator = entry.category;
					}
					items.push({
						...entry,
						label: entry.title,
						type: 'item',
						keybinding,
						buttons: command ? [
							{
								iconClass: 'codicon codicon-gear',
								tooltip: localize('change keybinding', "Configure Keybinding")
							}
						] : [],
						detail: entry.description,
						description: entry.from,
					});
				});
			qp.items = items;
		};
		refreshQp();

		disposables.add(this.onDidAddNewEntry(() => refreshQp()));

		disposables.add(qp.onDidAccept(async e => {
			const selected = qp.selectedItems[0] as (IQuickPickItem & IGettingStartedNewMenuEntryDescriptor);
			if (selected) {
				if (selected.action.runCommand) {
					await this.commandService.executeCommand(selected.action.runCommand);
				} else if (selected.action.invokeFunction) {
					await this.instantiationService.invokeFunction<unknown>(selected.action.invokeFunction);
				}
			}
			qp.hide();
		}));

		disposables.add(qp.onDidHide(() => {
			qp.dispose();
			disposables.dispose();
		}));

		disposables.add(qp.onDidTriggerItemButton(e => {
			qp.hide();
			this.commandService.executeCommand('workbench.action.openGlobalKeybindings', (e.item as any).action.runCommand);
		}));

		qp.show();
	}

	private async getCategoryOverrides(category: BuiltinGettingStartedCategory | BuiltinGettingStartedStartEntry) {
		if (!this.tasExperimentService) { return; }

		const [title, description] = await Promise.all([
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.title`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.description`),
		]);

		if (!(title || description)) { return; }

		const existing = assertIsDefined(this.gettingStartedContributions.get(category.id));
		existing.title = title ?? existing.title;
		existing.description = description ?? existing.description;
		this._onDidChangeCategory.fire(this.getCategoryProgress(existing));
	}

	private async getStepOverrides(step: BuiltinGettingStartedStep, categoryId: string) {
		if (!this.tasExperimentService) { return; }

		const [title, description, media] = await Promise.all([
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideStep.${step.id}.title`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideStep.${step.id}.description`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideStep.${step.id}.media`),
		]);

		if (!(title || description || media)) { return; }

		const existingCategory = assertIsDefined(this.gettingStartedContributions.get(categoryId));
		if (existingCategory.content.type === 'startEntry') { throw Error('Unexpected content type'); }
		const existingStep = assertIsDefined(existingCategory.content.steps.find(_step => _step.id === step.id));

		existingStep.title = title ?? existingStep.title;
		existingStep.description = description ? parseDescription(description) : existingStep.description;
		existingStep.media.path = media ? convertInternalMediaPathsToBrowserURIs(media) : existingStep.media.path;
		this._onDidChangeStep.fire(this.getStepProgress(existingStep));
	}

	private async registerExtensionNewContributions(extension: IExtensionDescription) {
		if (product.quality === 'stable' && !this.configurationService.getValue('workbench.welcome.experimental.startEntries')) {
			console.warn('Warning: ignoring startEntries contributed by', extension.identifier, 'becuase this is a stable build and welcome.experimental.startEntries has not been set');
			return;
		}
		extension.contributes?.startEntries?.forEach(entry => {
			this.registerNewMenuItem({
				sourceExtensionId: extension.identifier.value,
				action: { runCommand: entry.command },
				description: entry.description,
				title: entry.title,
				category: IGettingStartedNewMenuEntryDescriptorCategory[entry.category],
				when: ContextKeyExpr.deserialize(entry.when) ?? ContextKeyExpr.true(),
				from: extension.displayName ?? extension.name,
			});
		});
	}

	markWalkthroughOpened(id: string) {
		const walkthrough = this.gettingStartedContributions.get(id);
		const prior = this.metadata.get(id);
		if (prior && walkthrough && walkthrough.content.type === 'steps') {
			this.metadata.set(id, { ...prior, manaullyOpened: true, stepIDs: walkthrough.content.steps.map(s => s.id) });
		}
		this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.GLOBAL, StorageTarget.USER);
	}

	private async registerExtensionWalkthroughContributions(extension: IExtensionDescription) {
		const convertExtensionPathToFileURI = (path: string) => path.startsWith('https://')
			? URI.parse(path, true)
			: FileAccess.asFileUri(joinPath(extension.extensionLocation, path));

		const convertExtensionRelativePathsToBrowserURIs = (path: string | { hc: string, dark: string, light: string }): { hc: URI, dark: URI, light: URI } => {
			const convertPath = (path: string) => path.startsWith('https://')
				? URI.parse(path, true)
				: FileAccess.asBrowserUri(joinPath(extension.extensionLocation, path));

			if (typeof path === 'string') {
				const converted = convertPath(path);
				return { hc: converted, dark: converted, light: converted };
			} else {
				return {
					hc: convertPath(path.hc),
					light: convertPath(path.light),
					dark: convertPath(path.dark)
				};
			}
		};

		if (!(extension.contributes?.walkthroughs?.length)) {
			return;
		}

		let sectionToOpen: string | undefined;
		let sectionToOpenIndex = Math.min(); // '+Infinity';
		await Promise.all(extension.contributes?.walkthroughs?.map(async (walkthrough, index) => {
			const categoryID = extension.identifier.value + '#' + walkthrough.id;

			const isNewlyInstalled = !this.metadata.get(categoryID);
			if (isNewlyInstalled) {
				this.metadata.set(categoryID, { firstSeen: +new Date(), stepIDs: walkthrough.steps.map(s => s.id), manaullyOpened: false });
			}

			const override = await Promise.race([
				this.tasExperimentService?.getTreatment<string>(`gettingStarted.overrideCategory.${categoryID}.when`),
				new Promise<string | undefined>(resolve => setTimeout(() => resolve(walkthrough.when), 5000))
			]);

			if (
				this.sessionInstalledExtensions.has(extension.identifier.value.toLowerCase())
				&& this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true())
			) {
				this.sessionInstalledExtensions.delete(extension.identifier.value.toLowerCase());
				if (index < sectionToOpenIndex && isNewlyInstalled) {
					sectionToOpen = categoryID;
					sectionToOpenIndex = index;
				}
			}

			const walkthoughDescriptior: IGettingStartedWalkthroughDescriptor = {
				content: { type: 'steps' },
				description: walkthrough.description,
				title: walkthrough.title,
				id: categoryID,
				isFeatured: false,
				order: Math.min(),
				icon: {
					type: 'image',
					path: extension.icon
						? FileAccess.asBrowserUri(joinPath(extension.extensionLocation, extension.icon)).toString(true)
						: DefaultIconPath
				},
				when: ContextKeyExpr.deserialize(override ?? walkthrough.when) ?? ContextKeyExpr.true(),
			} as const;

			const steps = (walkthrough.steps ?? (walkthrough as any).tasks).map((step, index) => {
				const description = parseDescription(step.description || '');
				const buttonDescription = (step as any as { button: LegacyButtonConfig }).button;
				if (buttonDescription) {
					description.push({ nodes: [{ href: buttonDescription.link ?? `command:${buttonDescription.command}`, label: buttonDescription.title }] });
				}
				const fullyQualifiedID = extension.identifier.value + '#' + walkthrough.id + '#' + step.id;

				let media: IGettingStartedStep['media'];

				if (step.media.image) {
					const altText = (step.media as any).altText;
					if (altText === undefined) {
						console.error('Walkthrough item:', fullyQualifiedID, 'is missing altText for its media element.');
					}
					media = { type: 'image', altText, path: convertExtensionRelativePathsToBrowserURIs(step.media.image) };
				}
				else if (step.media.markdown) {
					media = {
						type: 'markdown',
						path: convertExtensionPathToFileURI(step.media.markdown),
						base: convertExtensionPathToFileURI(dirname(step.media.markdown)),
						root: FileAccess.asFileUri(extension.extensionLocation),
					};
				}

				// Legacy media config
				else {
					const legacyMedia = step.media as unknown as { path: string, altText: string };
					if (typeof legacyMedia.path === 'string' && legacyMedia.path.endsWith('.md')) {
						media = {
							type: 'markdown',
							path: convertExtensionPathToFileURI(legacyMedia.path),
							base: convertExtensionPathToFileURI(dirname(legacyMedia.path)),
							root: FileAccess.asFileUri(extension.extensionLocation),
						};
					}
					else {
						const altText = legacyMedia.altText;
						if (altText === undefined) {
							console.error('Walkthrough item:', fullyQualifiedID, 'is missing altText for its media element.');
						}
						media = { type: 'image', altText, path: convertExtensionRelativePathsToBrowserURIs(legacyMedia.path) };
					}
				}

				return ({
					description, media,
					completionEvents: step.completionEvents?.filter(x => typeof x === 'string') ?? [],
					id: fullyQualifiedID,
					title: step.title,
					when: ContextKeyExpr.deserialize(step.when) ?? ContextKeyExpr.true(),
					category: categoryID,
					order: index,
				});
			});

			this.registerWalkthrough(walkthoughDescriptior, steps);
		}));

		this.storageService.store(walkthroughMetadataConfigurationKey, JSON.stringify([...this.metadata.entries()]), StorageScope.GLOBAL, StorageTarget.USER);

		this.triggerInstalledExtensionsRegistered();

		if (sectionToOpen && this.configurationService.getValue<string>('workbench.welcomePage.walkthroughs.openOnInstall')) {
			this.commandService.executeCommand('workbench.action.openWalkthrough', sectionToOpen);
		}
	}

	private registerNewMenuItem(categoryDescriptor: IGettingStartedNewMenuEntryDescriptor) {
		this.newMenuItems.push(categoryDescriptor);
		this.newMenuItems.sort((a, b) => b.category - a.category);
		if (categoryDescriptor.category === IGettingStartedNewMenuEntryDescriptorCategory.file || categoryDescriptor.category === IGettingStartedNewMenuEntryDescriptorCategory.notebook) {
			HasMultipleNewFileEntries.bindTo(this.contextService).set(true);
		}

		this._onDidAddNewEntry.fire();
	}

	private unregisterExtensionWalkthroughContributions(extension: IExtensionDescription) {
		if (!(extension.contributes?.walkthroughs?.length)) {
			return;
		}

		extension.contributes?.walkthroughs?.forEach(section => {
			const categoryID = extension.identifier.value + '#walkthrough#' + section.id;
			section.steps.forEach(step => {
				const fullyQualifiedID = extension.identifier.value + '#' + section.id + '#' + step.id;
				this.steps.delete(fullyQualifiedID);
			});
			this.gettingStartedContributions.delete(categoryID);
			this._onDidRemoveCategory.fire();
		});
	}

	private unregisterExtensionNewContributions(extension: IExtensionDescription) {
		if (!(extension.contributes?.startEntries?.length)) {
			return;
		}

		this.newMenuItems = this.newMenuItems.filter(entry => entry.sourceExtensionId !== extension.identifier.value);
		HasMultipleNewFileEntries.bindTo(this.contextService).set(
			this.newMenuItems.filter(entry =>
				entry.category === IGettingStartedNewMenuEntryDescriptorCategory.file
				|| entry.category === IGettingStartedNewMenuEntryDescriptorCategory.notebook).length > 1
		);
	}

	private registerDoneListeners(step: IGettingStartedStep) {
		if (step.doneOn) {
			if (step.doneOn.commandExecuted) { step.completionEvents.push(`onCommand:${step.doneOn.commandExecuted}`); }
			if (step.doneOn.eventFired) { step.completionEvents.push(`onEvent:${step.doneOn.eventFired}`); }
		}

		if (!step.completionEvents.length) {
			step.completionEvents = coalesce(flatten(
				step.description
					.filter(linkedText => linkedText.nodes.length === 1) // only buttons
					.map(linkedText =>
						linkedText.nodes
							.filter(((node): node is ILink => typeof node !== 'string'))
							.map(({ href }) => {
								if (href.startsWith('command:')) {
									return 'onCommand:' + href.slice('command:'.length, href.includes('?') ? href.indexOf('?') : undefined);
								}
								if (href.startsWith('https://') || href.startsWith('http://')) {
									return 'onLink:' + href;
								}
								return undefined;
							}))));
		}

		if (!step.completionEvents.length) {
			step.completionEvents.push('stepSelected');
		}

		for (let event of step.completionEvents) {
			const [_, eventType, argument] = /^([^:]*):?(.*)$/.exec(event) ?? [];

			if (!eventType) {
				console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
				continue;
			}

			switch (eventType) {
				case 'onLink': case 'onEvent': case 'onView': case 'onSettingChanged':
					break;
				case 'onContext': {
					const expression = ContextKeyExpr.deserialize(argument);
					if (expression) {
						this.stepCompletionContextKeyExpressions.add(expression);
						expression.keys().forEach(key => this.stepCompletionContextKeys.add(key));
						event = eventType + ':' + expression.serialize();
					} else {
						console.error('Unable to parse context key expression:', expression, 'in walkthrough step', step.id);
					}
					break;
				}
				case 'stepSelected':
					event = eventType + ':' + step.id;
					break;
				case 'onCommand':
					event = eventType + ':' + argument.replace(/^toSide:/, '');
					break;
				case 'extensionInstalled':
					event = eventType + ':' + argument.toLowerCase();
					break;
				default:
					console.error(`Unknown completionEvent ${event} when registering step ${step.id}`);
					continue;
			}

			this.registerCompletionListener(event, step);
			if (this.sessionEvents.has(event)) {
				this.progressStep(step.id);
			}
		}
	}

	private registerCompletionListener(event: string, step: IGettingStartedStep) {
		if (!this.completionListeners.has(event)) {
			this.completionListeners.set(event, new Set());
		}
		this.completionListeners.get(event)?.add(step.id);
	}

	getCategories(): IGettingStartedCategoryWithProgress[] {
		const registeredCategories = [...this.gettingStartedContributions.values()];
		const categoriesWithCompletion = registeredCategories
			.filter(category => this.contextService.contextMatchesRules(category.when))
			.map(category => {
				if (category.content.type === 'steps') {
					return {
						...category,
						content: {
							type: 'steps' as const,
							steps: category.content.steps.filter(step => this.contextService.contextMatchesRules(step.when))
						}
					};
				}
				return category;
			})
			.filter(category => category.content.type !== 'steps' || category.content.steps.length)
			.map(category => this.getCategoryProgress(category))
			.sort((a, b) => b.priority - a.priority);
		return categoriesWithCompletion;
	}

	private getCategoryProgress(category: IGettingStartedCategory): IGettingStartedCategoryWithProgress {
		if (category.content.type === 'startEntry') {
			return { ...category, content: category.content, priority: 0 };
		}
		const stepsWithProgress = category.content.steps.map(step => this.getStepProgress(step));
		const stepsComplete = stepsWithProgress.filter(step => step.done);

		const isFeatured = category.isFeatured;

		const hasOpened = this.metadata.get(category.id)?.manaullyOpened;
		const firstSeenDate = this.metadata.get(category.id)?.firstSeen;
		const isNew = firstSeenDate && firstSeenDate > (+new Date() - NEW_WALKTHROUGH_TIME);

		const lastStepIDs = this.metadata.get(category.id)?.stepIDs;
		const rawCategory = this.gettingStartedContributions.get(category.id);
		let currentStepIds: string[] = [];
		if (rawCategory?.content.type === 'steps') {
			currentStepIds = rawCategory.content.steps.map(s => s.id);
		}
		const hasNewSteps = lastStepIDs && (currentStepIds.length !== lastStepIDs.length || currentStepIds.some((id, index) => id !== lastStepIDs[index]));

		let priority = 0;

		if (isFeatured) {
			priority += 20;
		}

		if (isNew && firstSeenDate) {
			priority += 10 + (NEW_WALKTHROUGH_TIME - (+new Date() - firstSeenDate)) / (24 * 60 * 60 * 1000);
		}

		if (hasNewSteps) {
			priority += 1;
		}

		return {
			...category,
			priority,
			content: {
				type: 'steps',
				steps: stepsWithProgress,
				accolades:
					isFeatured ? 'featured'
						: (isNew && !hasOpened) ? 'newCategory'
							: hasNewSteps ? 'newContent'
								: undefined,

				// accolades: Math.random() < 0.333 ? 'featured' : Math.random() < 0.5 ? 'newCategory' : 'newContent',
				stepsComplete: stepsComplete.length,
				stepsTotal: stepsWithProgress.length,
				done: stepsComplete.length === stepsWithProgress.length,
			}
		};
	}

	private getStepProgress(step: IGettingStartedStep): IGettingStartedStepWithProgress {
		return {
			...step,
			done: false,
			...this.stepProgress[step.id]
		};
	}

	progressStep(id: string) {
		const oldProgress = this.stepProgress[id];
		if (!oldProgress || oldProgress.done !== true) {
			this.stepProgress[id] = { done: true };
			this.memento.saveMemento();
			const step = this.getStep(id);
			this._onDidProgressStep.fire(this.getStepProgress(step));
		}
	}

	deprogressStep(id: string) {
		delete this.stepProgress[id];
		this.memento.saveMemento();
		const step = this.getStep(id);
		this._onDidProgressStep.fire(this.getStepProgress(step));
	}

	progressByEvent(event: string): void {
		if (this.sessionEvents.has(event)) { return; }

		this.sessionEvents.add(event);
		this.completionListeners.get(event)?.forEach(id => this.progressStep(id));
	}

	private registerStartEntry(categoryDescriptor: IGettingStartedStartEntryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite walkthrough. (${categoryDescriptor})`);
			return;
		}

		const category: IGettingStartedCategory = { ...categoryDescriptor, isFeatured: false };

		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		this._onDidAddCategory.fire();
	}

	registerWalkthrough(categoryDescriptor: IGettingStartedWalkthroughDescriptor, steps: IGettingStartedStep[]): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite walkthrough. (${categoryDescriptor.id})`);
			return;
		}

		const category: IGettingStartedCategory = { ...categoryDescriptor, content: { type: 'steps', steps } };

		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		steps.forEach(step => {
			if (this.steps.has(step.id)) { throw Error('Attempting to register step with id ' + step.id + ' twice. Second is dropped.'); }
			this.steps.set(step.id, step);
			this.registerDoneListeners(step);
			step.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
		});

		if (this.contextService.contextMatchesRules(category.when)) {
			this._onDidAddCategory.fire();
		}

		this.tasExperimentService?.getTreatment<string>(`gettingStarted.overrideCategory.${categoryDescriptor.id.replace('#', '.')}.when`).then(override => {
			if (override) {
				const old = category.when;
				const gnu = ContextKeyExpr.deserialize(override) ?? old;
				this.categoryVisibilityContextKeys.add(override);
				category.when = gnu;

				if (this.contextService.contextMatchesRules(old) && !this.contextService.contextMatchesRules(gnu)) {
					this._onDidRemoveCategory.fire();
				} else if (!this.contextService.contextMatchesRules(old) && this.contextService.contextMatchesRules(gnu)) {
					this._onDidAddCategory.fire();
				}
			}
		});
		category.when.keys().forEach(key => this.categoryVisibilityContextKeys.add(key));
	}

	private getStep(id: string): IGettingStartedStep {
		const step = this.steps.get(id);
		if (!step) { throw Error('Attempting to access step which does not exist in registry ' + id); }
		return step;
	}
}

const parseDescription = (desc: string): LinkedText[] => desc.split('\n').filter(x => x).map(text => parseLinkedText(text));


const convertInternalMediaPathToFileURI = (path: string) => path.startsWith('https://')
	? URI.parse(path, true)
	: FileAccess.asFileUri('vs/workbench/contrib/welcome/gettingStarted/common/media/' + path, require);

const convertInternalMediaPathToBrowserURI = (path: string) => path.startsWith('https://')
	? URI.parse(path, true)
	: FileAccess.asBrowserUri('vs/workbench/contrib/welcome/gettingStarted/common/media/' + path, require);
const convertInternalMediaPathsToBrowserURIs = (path: string | { hc: string, dark: string, light: string }): { hc: URI, dark: URI, light: URI } => {
	if (typeof path === 'string') {
		const converted = convertInternalMediaPathToBrowserURI(path);
		return { hc: converted, dark: converted, light: converted };
	} else {
		return {
			hc: convertInternalMediaPathToBrowserURI(path.hc),
			light: convertInternalMediaPathToBrowserURI(path.light),
			dark: convertInternalMediaPathToBrowserURI(path.dark)
		};
	}
};

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'resetGettingStartedProgress',
			category: 'Developer',
			title: 'Reset Welcome Page Getting Started Progress',
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const gettingStartedService = accessor.get(IGettingStartedService);
		const storageService = accessor.get(IStorageService);

		storageService.store(
			hiddenEntriesConfigurationKey,
			JSON.stringify([]),
			StorageScope.GLOBAL,
			StorageTarget.USER);

		storageService.store(
			walkthroughMetadataConfigurationKey,
			JSON.stringify([]),
			StorageScope.GLOBAL,
			StorageTarget.USER);

		const memento = new Memento('gettingStartedService', accessor.get(IStorageService));
		const record = memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);
		for (const key in record) {
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				try {
					gettingStartedService.deprogressStep(key);
				} catch (e) {
					console.error(e);
				}
			}
		}
		memento.saveMemento();
	}
});

const displayCategory: Record<IGettingStartedNewMenuEntryDescriptorCategory, string> = {
	[IGettingStartedNewMenuEntryDescriptorCategory.file]: localize('file', "File"),
	[IGettingStartedNewMenuEntryDescriptorCategory.folder]: localize('folder', "Folder"),
	[IGettingStartedNewMenuEntryDescriptorCategory.notebook]: localize('notebook', "Notebook"),
};

registerSingleton(IGettingStartedService, GettingStartedService);
