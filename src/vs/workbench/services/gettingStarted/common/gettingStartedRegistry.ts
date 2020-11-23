/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';

export const enum GettingStartedCategory {
	Beginner = 'Beginner',
	Intermediate = 'Intermediate',
	Advanced = 'Advanced'
}

export const enum GettingStartedPriority {
	Beginner = 0,
	Intermediate = 10,
	Advanced = 20,
	FeatureContrib = 30,
	ExtensionContrib = 40,
}

export interface IGettingStartedTask {
	readonly id: string,
	readonly title: string,
	readonly description: string,
	readonly order: number,
	readonly category: GettingStartedCategory | string,
	readonly button?: { title: string, command: string }
	readonly detail?: { editor?: { lang: string, text: string }, steps?: string[] }
}

export interface IGettingStartedCategoryDescriptor {
	id: GettingStartedCategory | string,
	title: string,
	description: string,
	icon: string
	priority: GettingStartedPriority | number
}

export interface IGettingStartedCategory {
	readonly id: GettingStartedCategory | string,
	readonly title: string,
	readonly description: string,
	readonly icon: string
	readonly priority: GettingStartedPriority | number
	readonly tasks: readonly Readonly<IGettingStartedTask>[]
}

interface IWritableGettingStartedCategory {
	id: GettingStartedCategory | string,
	title: string,
	description: string,
	icon: string
	priority: GettingStartedPriority | number
	tasks: IGettingStartedTask[]
}

export interface IGettingStartedRegistry {
	onDidAddTask: Event<IGettingStartedTask>
	onDidAddCategory: Event<IGettingStartedCategory>

	registerTask(task: IGettingStartedTask): IGettingStartedTask;
	registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void

	getCategory(id: GettingStartedCategory | string): Readonly<IGettingStartedCategory> | undefined
	getCategories(): readonly Readonly<IGettingStartedCategory>[]
}

export class GettingStartedRegistryImpl implements IGettingStartedRegistry {
	private readonly _onDidAddTask = new Emitter<IGettingStartedTask>();
	onDidAddTask: Event<IGettingStartedTask> = this._onDidAddTask.event;
	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategory>();
	onDidAddCategory: Event<IGettingStartedCategory> = this._onDidAddCategory.event;

	private readonly gettingStartedContributions = new Map<string, IWritableGettingStartedCategory>();

	public registerTask(task: IGettingStartedTask): IGettingStartedTask {
		const category = this.gettingStartedContributions.get(task.category);
		if (!category) { throw Error('Registering getting started task to category that does not exist (' + task.category + ')'); }
		category.tasks.push(task);
		this._onDidAddTask.fire(task);
		return task;
	}

	public registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor})`);
			return;
		}
		const category: IWritableGettingStartedCategory = { ...categoryDescriptor, tasks: [], };
		this.gettingStartedContributions.set(categoryDescriptor.id, category);
		this._onDidAddCategory.fire(category);
	}

	public getCategory(id: GettingStartedCategory | string): Readonly<IGettingStartedCategory> | undefined {
		return this.gettingStartedContributions.get(id);
	}

	public getCategories(): readonly Readonly<IGettingStartedCategory>[] {
		const categories = [...this.gettingStartedContributions.values()];
		return categories.sort((a, b) => a.priority - b.priority);
	}
}

export const GettingStartedRegistryID = 'GettingStartedRegistry';
const registryImpl = new GettingStartedRegistryImpl();
Registry.add(GettingStartedRegistryID, registryImpl);
export const GettingStartedRegistry: IGettingStartedRegistry = Registry.as(GettingStartedRegistryID);

GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Beginner,
	title: nls.localize('gettingStarted.beginner.title', "Get Started"),
	icon: 'lightbulb',
	description: nls.localize('gettingStarted.beginner.description', "Get to know your new Editor"),
	priority: GettingStartedPriority.Beginner,
});


GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Intermediate,
	title: nls.localize('gettingStarted.intermediate.title', "Essentials"),
	icon: 'heart',
	description: nls.localize('gettingStarted.intermediate.description', "Must know features you'll love"),
	priority: GettingStartedPriority.Intermediate,
});

GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Advanced,
	title: nls.localize('gettingStarted.advanced.title', "Tips & Tricks"),
	icon: 'tools',
	description: nls.localize('gettingStarted.advanced.description', "Favorites from VS Code experts"),
	priority: GettingStartedPriority.Advanced,
});
