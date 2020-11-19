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
	readonly name: string,
	readonly description: string,
	readonly priority: number,
	readonly category: GettingStartedCategory | string,
	readonly button?: { title: string, command: string }
	readonly detail?: { editor?: { lang: string, text: string }, steps?: string[] }
}

export interface IGettingStartedCategoryDescriptor {
	id: GettingStartedCategory | string,
	name: string,
	description: string,
	priority: GettingStartedPriority | number
}

export interface IGettingStartedCategory {
	readonly id: GettingStartedCategory | string,
	readonly name: string,
	readonly description: string,
	readonly priority: GettingStartedPriority | number
	readonly tasks: readonly Readonly<IGettingStartedTask>[]
}

interface IWritableGettingStartedCategory {
	id: GettingStartedCategory | string,
	name: string,
	description: string,
	priority: GettingStartedPriority | number
	tasks: IGettingStartedTask[]
}

export class GettingStartedRegistryImpl {
	private readonly _onDidAddTask = new Emitter<IGettingStartedTask>();
	onDidAddTask: Event<IGettingStartedTask> = this._onDidAddTask.event;
	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategory>();
	onDidAddCategory: Event<IGettingStartedCategory> = this._onDidAddCategory.event;

	private readonly gettingStartedContributions = new Map<string, IWritableGettingStartedCategory>();

	public registerTask(task: IGettingStartedTask): void {
		const category = this.gettingStartedContributions.get(task.category);
		if (!category) { throw Error('Registering getting started task to category that does not exist (' + task.category + ')'); }
		category.tasks.push(task);
		this._onDidAddTask.fire(task);
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

const GettingStartedRegistryID = 'GettingStartedRegistry';
const registryImpl = new GettingStartedRegistryImpl();
Registry.add(GettingStartedRegistryID, registryImpl);

export const GettingStartedRegistry: GettingStartedRegistryImpl = Registry.as(GettingStartedRegistryID);

GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Beginner,
	name: nls.localize('gettingStarted.beginner.title', "Welcome to VS Code"),
	description: nls.localize('gettingStarted.beginner.description', "Get to know your new Editor"),
	priority: GettingStartedPriority.Beginner,
});

GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Intermediate,
	name: nls.localize('gettingStarted.intermediate.title', "Essentials"),
	description: nls.localize('gettingStarted.intermediate.description', "Must know features you'll love"),
	priority: GettingStartedPriority.Intermediate,
});

GettingStartedRegistry.registerCategory({
	id: GettingStartedCategory.Advanced,
	name: nls.localize('gettingStarted.advanced.title', "Genius Picks"),
	description: nls.localize('gettingStarted.advanced.description', "Favorite tips & tricks from VS Code experts"),
	priority: GettingStartedPriority.Advanced,
});
