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
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IExtensionDescription, IStartEntry } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { FileAccess } from 'vs/base/common/network';
import { DefaultIconPath, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IProductService } from 'vs/platform/product/common/productService';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { BuiltinGettingStartedCategory, BuiltinGettingStartedItem, BuiltinGettingStartedStartEntry, startEntries, walkthroughs } from 'vs/workbench/contrib/welcome/gettingStarted/common/gettingStartedContent';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { assertIsDefined } from 'vs/base/common/types';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { GettingStartedInput } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { GettingStartedPage } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStarted';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LinkedText, parseLinkedText } from 'vs/base/common/linkedText';
import { walkthroughsExtensionPoint } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedExtensionPoint';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export const IGettingStartedService = createDecorator<IGettingStartedService>('gettingStartedService');

export const enum GettingStartedCategory {
	Beginner = 'Beginner',
	Intermediate = 'Intermediate',
	Advanced = 'Advanced'
}

type LegacyButtonConfig =
	| { title: string, command?: never, link: string }
	| { title: string, command: string, link?: never, sideBySide?: boolean };

export interface IGettingStartedTask {
	id: string
	title: string
	description: LinkedText[]
	category: GettingStartedCategory | string
	when: ContextKeyExpression
	order: number
	doneOn: { commandExecuted: string, eventFired?: never } | { eventFired: string, commandExecuted?: never }
	media: { type: 'image', path: { hc: URI, light: URI, dark: URI }, altText: string }
}

export interface IGettingStartedWalkthroughDescriptor {
	id: GettingStartedCategory | string
	title: string
	description: string
	order: number
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'items' }
}

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
	order: number
	icon:
	| { type: 'icon', icon: ThemeIcon }
	| { type: 'image', path: string }
	when: ContextKeyExpression
	content:
	| { type: 'items', items: IGettingStartedTask[] }
	| { type: 'startEntry', command: string }
}

type TaskProgress = { done?: boolean; };
export interface IGettingStartedTaskWithProgress extends IGettingStartedTask, Required<TaskProgress> { }

export interface IGettingStartedCategoryWithProgress extends Omit<IGettingStartedCategory, 'content'> {
	content:
	| {
		type: 'items',
		items: IGettingStartedTaskWithProgress[],
		done: boolean;
		stepsComplete: number
		stepsTotal: number
	}
	| { type: 'startEntry', command: string }
}

export interface IGettingStartedService {
	_serviceBrand: undefined,

	readonly onDidAddCategory: Event<IGettingStartedCategoryWithProgress>
	readonly onDidRemoveCategory: Event<string>
	readonly onDidChangeTask: Event<IGettingStartedTaskWithProgress>
	readonly onDidChangeCategory: Event<IGettingStartedCategoryWithProgress>

	readonly onDidProgressTask: Event<IGettingStartedTaskWithProgress>

	getCategories(): IGettingStartedCategoryWithProgress[]

	progressByEvent(eventName: string): void;
	progressTask(id: string): void;
	deprogressTask(id: string): void;
}

export class GettingStartedService extends Disposable implements IGettingStartedService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategoryWithProgress>();
	onDidAddCategory: Event<IGettingStartedCategoryWithProgress> = this._onDidAddCategory.event;

	private readonly _onDidRemoveCategory = new Emitter<string>();
	onDidRemoveCategory: Event<string> = this._onDidRemoveCategory.event;

	private readonly _onDidChangeCategory = new Emitter<IGettingStartedCategoryWithProgress>();
	onDidChangeCategory: Event<IGettingStartedCategoryWithProgress> = this._onDidChangeCategory.event;

	private readonly _onDidChangeTask = new Emitter<IGettingStartedTaskWithProgress>();
	onDidChangeTask: Event<IGettingStartedTaskWithProgress> = this._onDidChangeTask.event;

	private readonly _onDidProgressTask = new Emitter<IGettingStartedTaskWithProgress>();
	onDidProgressTask: Event<IGettingStartedTaskWithProgress> = this._onDidProgressTask.event;

	private memento: Memento;
	private taskProgress: Record<string, TaskProgress>;

	private commandListeners = new Map<string, string[]>();
	private eventListeners = new Map<string, string[]>();

	private gettingStartedContributions = new Map<string, IGettingStartedCategory>();
	private tasks = new Map<string, IGettingStartedTask>();

	private tasExperimentService?: ITASExperimentService;
	private sessionInstalledExtensions = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@IUserDataAutoSyncEnablementService  readonly userDataAutoSyncEnablementService: IUserDataAutoSyncEnablementService,
		@IProductService private readonly productService: IProductService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IHostService private readonly hostService: IHostService,
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
	) {
		super();

		this.tasExperimentService = tasExperimentService;

		this.memento = new Memento('gettingStartedService', this.storageService);
		this.taskProgress = this.memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);

		walkthroughsExtensionPoint.setHandler((_, { added, removed }) => {
			added.forEach(e => this.registerExtensionContributions(e.description));
			removed.forEach(e => this.unregisterExtensionContributions(e.description));
		});

		this._register(this.commandService.onDidExecuteCommand(command => this.progressByCommand(command.commandId)));

		this._register(this.extensionManagementService.onDidInstallExtension(async e => {
			if (await this.hostService.hadLastFocus()) {
				this.sessionInstalledExtensions.add(e.identifier.id);
			}
		}));

		if (userDataAutoSyncEnablementService.isEnabled()) { this.progressByEvent('sync-enabled'); }
		this._register(userDataAutoSyncEnablementService.onDidChangeEnablement(() => {
			if (userDataAutoSyncEnablementService.isEnabled()) { this.progressByEvent('sync-enabled'); }
		}));

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
				category.content.items.map((item, index) => {
					this.getTaskOverrides(item, category.id);
					return ({
						...item,
						description: parseDescription(item.description),
						category: category.id,
						order: index,
						when: ContextKeyExpr.deserialize(item.when) ?? ContextKeyExpr.true(),
						media: {
							type: item.media.type,
							altText: item.media.altText,
							path: convertPaths(item.media.path)
						}
					});
				}));
		});
	}

	private async getCategoryOverrides(category: BuiltinGettingStartedCategory | BuiltinGettingStartedStartEntry) {
		if (!this.tasExperimentService) { return; }

		const [title, description] = await Promise.all([
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.title`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.description`),
		]);

		const existing = assertIsDefined(this.gettingStartedContributions.get(category.id));
		existing.title = title ?? existing.title;
		existing.description = description ?? existing.description;
		this._onDidChangeCategory.fire(this.getCategoryProgress(existing));
	}

	private async getTaskOverrides(item: BuiltinGettingStartedItem, categoryId: string) {
		if (!this.tasExperimentService) { return; }

		const [title, description, media] = await Promise.all([
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.title`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.description`),
			this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.media`),
		]);

		const existingCategory = assertIsDefined(this.gettingStartedContributions.get(categoryId));
		if (existingCategory.content.type === 'startEntry') { throw Error('Unexpected content type'); }
		const existingItem = assertIsDefined(existingCategory.content.items.find(_item => _item.id === item.id));
		existingItem.title = title ?? existingItem.title;
		existingItem.description = description ? parseDescription(description) : existingItem.description;
		existingItem.media.path = media ? convertPaths(media) : existingItem.media.path;
		this._onDidChangeTask.fire(this.getTaskProgress(existingItem));
	}

	private registerExtensionContributions(extension: IExtensionDescription) {
		const convertPaths = (path: string | { hc: string, dark: string, light: string }): { hc: URI, dark: URI, light: URI } => {
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

		let sectionToOpen: string | undefined;

		if (!(extension.contributes?.walkthroughs?.length)) {
			return;
		}

		if (this.productService.quality === 'stable') {
			console.warn('Extension', extension.identifier.value, 'contributes welcome page content but this is a Stable build and extension contributions are only available in Insiders. The contributed content will be disregarded.');
			return;
		}

		if (!this.configurationService.getValue<string>('workbench.welcomePage.experimental.extensionContributions')) {
			console.warn('Extension', extension.identifier.value, 'contributes welcome page content but the welcome page extension contribution feature flag has not been set. Set `workbench.welcomePage.experimental.extensionContributions` to begin using this experimental feature.');
			return;
		}

		extension.contributes.startEntries?.forEach(entry => {
			const entryID = extension.identifier.value + '#startEntry#' + idForStartEntry(entry);
			this.registerStartEntry({
				content: {
					type: 'startEntry',
					command: entry.command,
				},
				description: entry.description,
				title: entry.title,
				id: entryID,
				order: 0,
				when: ContextKeyExpr.deserialize(entry.when) ?? ContextKeyExpr.true(),
				icon: {
					type: 'image',
					path: extension.icon
						? FileAccess.asBrowserUri(joinPath(extension.extensionLocation, extension.icon)).toString(true)
						: DefaultIconPath
				}
			});
		});


		extension.contributes?.walkthroughs?.forEach(section => {
			const categoryID = extension.identifier.value + '#walkthrough#' + section.id;
			if (
				this.sessionInstalledExtensions.has(extension.identifier.value)
				&& section.primary
				&& this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(section.when) ?? ContextKeyExpr.true())
			) {
				this.sessionInstalledExtensions.delete(extension.identifier.value);
				sectionToOpen = categoryID;
			}
			this.registerWalkthrough({
				content: { type: 'items' },
				description: section.description,
				title: section.title,
				id: categoryID,
				order: Math.min(),
				icon: {
					type: 'image',
					path: extension.icon
						? FileAccess.asBrowserUri(joinPath(extension.extensionLocation, extension.icon)).toString(true)
						: DefaultIconPath
				},
				when: ContextKeyExpr.deserialize(section.when) ?? ContextKeyExpr.true(),
			},
				section.tasks.map((task, index) => {
					const description = parseDescription(task.description);
					const buttonDescription = (task as any as { button: LegacyButtonConfig }).button;
					if (buttonDescription) {
						description.push({ nodes: [{ href: buttonDescription.link ?? `command:${buttonDescription.command}`, label: buttonDescription.title }] });
					}
					const fullyQualifiedID = extension.identifier.value + '#' + section.id + '#' + task.id;
					return ({
						description: description,
						media: { type: 'image', altText: task.media.altText, path: convertPaths(task.media.path) },
						doneOn: task.doneOn?.command
							? { commandExecuted: task.doneOn.command }
							: { eventFired: 'markDone:' + fullyQualifiedID },
						id: fullyQualifiedID,
						title: task.title,
						when: ContextKeyExpr.deserialize(task.when) ?? ContextKeyExpr.true(),
						category: categoryID,
						order: index,
					});
				}));
		});

		if (sectionToOpen) {
			for (const group of this.editorGroupsService.groups) {
				if (group.activeEditor instanceof GettingStartedInput) {
					(group.activeEditorPane as GettingStartedPage).makeCategoryVisibleWhenAvailable(sectionToOpen);
					return;
				}
			}

			if (this.configurationService.getValue<string>('workbench.welcomePage.experimental.extensionContributions') === 'openToSide') {
				this.editorService.openEditor(this.instantiationService.createInstance(GettingStartedInput, { selectedCategory: sectionToOpen }), {}, SIDE_GROUP);
			} else if (this.configurationService.getValue<string>('workbench.welcomePage.experimental.extensionContributions') === 'open') {
				this.editorService.openEditor(this.instantiationService.createInstance(GettingStartedInput, { selectedCategory: sectionToOpen }), {});
			} else if (this.configurationService.getValue<string>('workbench.welcomePage.experimental.extensionContributions') === 'openInBackground') {
				this.editorService.openEditor(this.instantiationService.createInstance(GettingStartedInput, { selectedCategory: sectionToOpen }), { inactive: true });
			}
		}
	}

	private unregisterExtensionContributions(extension: IExtensionDescription) {
		if (!(extension.contributes?.walkthroughs?.length)) {
			return;
		}

		extension.contributes?.startEntries?.forEach(section => {
			const categoryID = extension.identifier.value + '#startEntry#' + idForStartEntry(section);
			this.gettingStartedContributions.delete(categoryID);
			this._onDidRemoveCategory.fire(categoryID);
		});

		extension.contributes?.walkthroughs?.forEach(section => {
			const categoryID = extension.identifier.value + '#walkthrough#' + section.id;
			section.tasks.forEach(task => {
				const fullyQualifiedID = extension.identifier.value + '#' + section.id + '#' + task.id;
				this.tasks.delete(fullyQualifiedID);
			});
			this.gettingStartedContributions.delete(categoryID);
			this._onDidRemoveCategory.fire(categoryID);
		});
	}

	private registerDoneListeners(task: IGettingStartedTask) {
		if (task.doneOn.commandExecuted) {
			const existing = this.commandListeners.get(task.doneOn.commandExecuted);
			if (existing) { existing.push(task.id); }
			else {
				this.commandListeners.set(task.doneOn.commandExecuted, [task.id]);
			}
		}
		if (task.doneOn.eventFired) {
			const existing = this.eventListeners.get(task.doneOn.eventFired);
			if (existing) { existing.push(task.id); }
			else {
				this.eventListeners.set(task.doneOn.eventFired, [task.id]);
			}
		}
	}

	getCategories(): IGettingStartedCategoryWithProgress[] {
		const registeredCategories = [...this.gettingStartedContributions.values()];
		const categoriesWithCompletion = registeredCategories
			.sort((a, b) => a.order - b.order)
			.filter(category => this.contextService.contextMatchesRules(category.when))
			.map(category => {
				if (category.content.type === 'items') {
					return {
						...category,
						content: {
							type: 'items' as const,
							items: category.content.items.filter(item => this.contextService.contextMatchesRules(item.when))
						}
					};
				}
				return category;
			})
			.filter(category => category.content.type !== 'items' || category.content.items.length)
			.map(category => this.getCategoryProgress(category));
		return categoriesWithCompletion;
	}

	private getCategoryProgress(category: IGettingStartedCategory): IGettingStartedCategoryWithProgress {
		if (category.content.type === 'startEntry') {
			return { ...category, content: category.content };
		}

		const tasksWithProgress = category.content.items.map(task => this.getTaskProgress(task));
		const tasksComplete = tasksWithProgress.filter(task => task.done);

		return {
			...category,
			content: {
				type: 'items',
				items: tasksWithProgress,
				stepsComplete: tasksComplete.length,
				stepsTotal: tasksWithProgress.length,
				done: tasksComplete.length === tasksWithProgress.length,
			}
		};
	}

	private getTaskProgress(task: IGettingStartedTask): IGettingStartedTaskWithProgress {
		return {
			...task,
			done: false,
			...this.taskProgress[task.id]
		};
	}

	progressTask(id: string) {
		const oldProgress = this.taskProgress[id];
		if (!oldProgress || oldProgress.done !== true) {
			this.taskProgress[id] = { done: true };
			this.memento.saveMemento();
			const task = this.getTask(id);
			this._onDidProgressTask.fire(this.getTaskProgress(task));
		}
	}

	deprogressTask(id: string) {
		delete this.taskProgress[id];
		this.memento.saveMemento();
		const task = this.getTask(id);
		this._onDidProgressTask.fire(this.getTaskProgress(task));
	}

	private progressByCommand(command: string) {
		const listening = this.commandListeners.get(command) ?? [];
		listening.forEach(id => this.progressTask(id));
	}

	progressByEvent(event: string): void {
		const listening = this.eventListeners.get(event) ?? [];
		listening.forEach(id => this.progressTask(id));
	}

	private registerStartEntry(categoryDescriptor: IGettingStartedStartEntryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor})`);
			return;
		}

		const category: IGettingStartedCategory = { ...categoryDescriptor };

		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		this._onDidAddCategory.fire(this.getCategoryProgress(category));
	}

	private registerWalkthrough(categoryDescriptor: IGettingStartedWalkthroughDescriptor, items: IGettingStartedTask[]): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor.id})`);
			return;
		}

		const category: IGettingStartedCategory = { ...categoryDescriptor, content: { type: 'items', items } };
		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		items.forEach(task => {
			if (this.tasks.has(task.id)) { throw Error('Attempting to register task with id ' + task.id + ' twice. Second is dropped.'); }
			this.tasks.set(task.id, task);
			this.registerDoneListeners(task);
		});
		this._onDidAddCategory.fire(this.getCategoryProgress(category));
	}

	private getTask(id: string): IGettingStartedTask {
		const task = this.tasks.get(id);
		if (!task) { throw Error('Attempting to access task which does not exist in registry ' + id); }
		return task;
	}
}

const idForStartEntry = (entry: IStartEntry): string => `${entry.title}#${entry.command}`;

const parseDescription = (desc: string): LinkedText[] => desc.split('\n').filter(x => x).map(text => parseLinkedText(text));

const convertPaths = (path: string | { hc: string, dark: string, light: string }): { hc: URI, dark: URI, light: URI } => {
	const convertPath = (path: string) => path.startsWith('https://')
		? URI.parse(path, true)
		: FileAccess.asBrowserUri('vs/workbench/contrib/welcome/gettingStarted/common/media/' + path, require);
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

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'resetGettingStartedProgress',
			category: 'Getting Started',
			title: 'Reset Progress',
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const gettingStartedService = accessor.get(IGettingStartedService);
		const memento = new Memento('gettingStartedService', accessor.get(IStorageService));
		const record = memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);
		for (const key in record) {
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				try {
					gettingStartedService.deprogressTask(key);
				} catch (e) {
					console.error(e);
				}
			}
		}
		memento.saveMemento();
	}
});

registerSingleton(IGettingStartedService, GettingStartedService);
