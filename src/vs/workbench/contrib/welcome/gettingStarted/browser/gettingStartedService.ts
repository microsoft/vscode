/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService, optional, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { FileAccess } from 'vs/base/common/network';
import { DefaultIconPath, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IProductService } from 'vs/platform/product/common/productService';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { BuiltinGettingStartedCategory, BuiltinGettingStartedItem, content } from 'vs/workbench/contrib/welcome/gettingStarted/common/gettingStartedContent';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { assertIsDefined } from 'vs/base/common/types';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';
import { GettingStartedInput } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { GettingStartedPage } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStarted';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LinkedText, parseLinkedText } from 'vs/base/common/linkedText';

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

export interface IGettingStartedCategoryDescriptor {
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

	readonly onDidAddTask: Event<IGettingStartedTaskWithProgress>
	readonly onDidAddCategory: Event<IGettingStartedCategoryWithProgress>
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

	private readonly _onDidAddTask = new Emitter<IGettingStartedTaskWithProgress>();
	onDidAddTask: Event<IGettingStartedTaskWithProgress> = this._onDidAddTask.event;
	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategoryWithProgress>();
	onDidAddCategory: Event<IGettingStartedCategoryWithProgress> = this._onDidAddCategory.event;

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

	private trackedExtensions = new Set<string>();

	private gettingStartedContributions = new Map<string, IGettingStartedCategory>();
	private tasks = new Map<string, IGettingStartedTask>();

	private tasExperimentService?: ITASExperimentService;
	private sessionInstalledExtensions = new Set<string>();

	private overrideShortcircuit: Promise<void>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IContextKeyService private readonly contextService: IContextKeyService,
		@IUserDataAutoSyncEnablementService  readonly userDataAutoSyncEnablementService: IUserDataAutoSyncEnablementService,
		@IExtensionService private readonly extensionService: IExtensionService,
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

		this.extensionService.getExtensions().then(extensions => {
			extensions.forEach(extension => this.registerExtensionContributions(extension));
		});

		this.extensionService.onDidChangeExtensions(() => {
			this.extensionService.getExtensions().then(extensions => {
				extensions.forEach(extension => this.registerExtensionContributions(extension));
			});
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
		this.overrideShortcircuit = new Promise(resolve => setTimeout(resolve, 300));

		content.forEach(async (category, index) => {
			category = await this.getCategoryOverrides(category);
			this.registerCategory({
				...category,
				icon: { type: 'icon', icon: category.icon },
				order: index,
				when: ContextKeyExpr.deserialize(category.when) ?? ContextKeyExpr.true()
			});

			if (category.content.type === 'items') {
				category.content.items.forEach(async (item, index) => {
					item = await this.getTaskOverrides(item, category.id);
					this.registerTask({
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
				});
			}
		});
	}

	private async getCategoryOverrides(category: BuiltinGettingStartedCategory): Promise<BuiltinGettingStartedCategory> {
		return new Promise(async (resolve) => {
			if (!this.tasExperimentService) { resolve(category); return; }
			let resolved = false;

			this.overrideShortcircuit.then(() => {
				resolve(category);
				resolved = true;
			});

			const [title, description] = await Promise.all([
				this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.title`),
				this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideCategory.${category.id}.description`),
			]);

			if (resolved) {
				const existing = assertIsDefined(this.gettingStartedContributions.get(category.id));
				existing.title = title ?? existing.title;
				existing.description = description ?? existing.description;
				this._onDidChangeCategory.fire(this.getCategoryProgress(existing));
			} else {
				resolve({
					...category,
					title: title ?? category.title,
					description: description ?? category.description,
				});
			}
		});
	}

	private async getTaskOverrides(item: BuiltinGettingStartedItem, categoryId: string): Promise<BuiltinGettingStartedItem> {
		return new Promise(async (resolve) => {
			if (!this.tasExperimentService) { resolve(item); return; }
			let resolved = false;

			this.overrideShortcircuit.then(() => {
				resolve(item);
				resolved = true;
			});

			const [title, description, media] = await Promise.all([
				this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.title`),
				this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.description`),
				this.tasExperimentService.getTreatment<string>(`gettingStarted.overrideTask.${item.id}.media`),
			]);

			if (resolved) {
				const existingCategory = assertIsDefined(this.gettingStartedContributions.get(categoryId));
				if (existingCategory.content.type === 'startEntry') { throw Error('Unexpected content type'); }
				const existingItem = assertIsDefined(existingCategory.content.items.find(_item => _item.id === item.id));
				existingItem.title = title ?? existingItem.title;
				existingItem.description = description ? parseDescription(description) : existingItem.description;
				existingItem.media.path = media ? convertPaths(media) : existingItem.media.path;
				this._onDidChangeTask.fire(this.getTaskProgress(existingItem));
			} else {
				resolve({
					...item,
					title: title ?? item.title,
					description: description ?? item.description,
					media: {
						altText: item.media.altText,
						path: media ? media : item.media.path,
						type: item.media.type,
					},
				});
			}
		});
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

		if (!this.trackedExtensions.has(ExtensionIdentifier.toKey(extension.identifier))) {
			this.trackedExtensions.add(ExtensionIdentifier.toKey(extension.identifier));
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

			extension.contributes?.walkthroughs?.forEach(section => {
				const categoryID = extension.identifier.value + '#' + section.id;
				if (
					this.sessionInstalledExtensions.has(extension.identifier.value)
					&& section.primary
					&& this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(section.when) ?? ContextKeyExpr.true())
				) {
					this.sessionInstalledExtensions.delete(extension.identifier.value);
					sectionToOpen = categoryID;
				}
				this.registerCategory({
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
				});
				try {
					section.tasks.forEach((task, index) => {
						const description = parseDescription(task.description);
						const buttonDescription = (task as any as { button: LegacyButtonConfig }).button;
						if (buttonDescription) {
							description.push({ nodes: [{ href: buttonDescription.link ?? `command:${buttonDescription.command}`, label: buttonDescription.title }] });
						}

						const fullyQualifiedID = extension.identifier.value + '#' + section.id + '#' + task.id;
						this.registerTask({
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
					});
				} catch (e) {
					console.error('Error registering walkthrough tasks for ', categoryID, e);
				}
			});
		}

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

	public registerTask(task: IGettingStartedTask): IGettingStartedTask {
		const category = this.gettingStartedContributions.get(task.category);
		if (!category) { throw Error('Registering getting started task to category that does not exist (' + task.category + ')'); }
		if (category.content.type !== 'items') { throw Error('Registering getting started task to category that is not of `items` type (' + task.category + ')'); }
		if (this.tasks.has(task.id)) { throw Error('Attempting to register task with id ' + task.id + ' twice. Second is dropped.'); }
		this.tasks.set(task.id, task);
		let insertIndex: number | undefined = category.content.items.findIndex(item => item.order > task.order);
		if (insertIndex === -1) { insertIndex = undefined; }
		insertIndex = insertIndex ?? category.content.items.length;
		category.content.items.splice(insertIndex, 0, task);
		this.registerDoneListeners(task);
		this._onDidAddTask.fire(this.getTaskProgress(task));
		return task;
	}

	public registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor})`);
			return;
		}

		const category: IGettingStartedCategory = {
			...categoryDescriptor,
			content: categoryDescriptor.content.type === 'items'
				? { type: 'items', items: [] }
				: categoryDescriptor.content
		};

		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		this._onDidAddCategory.fire(this.getCategoryProgress(category));
	}

	private getTask(id: string): IGettingStartedTask {
		const task = this.tasks.get(id);
		if (!task) { throw Error('Attempting to access task which does not exist in registry ' + id); }
		return task;
	}
}

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
