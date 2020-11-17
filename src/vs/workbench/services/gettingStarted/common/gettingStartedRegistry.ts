/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export interface IGettingStartedItem {
	readonly id: string,
	readonly name: string,
	readonly description: string,
	readonly priority: number,
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
	readonly items: readonly Readonly<IGettingStartedItem>[]
}

interface IWritableGettingStartedCategory {
	id: GettingStartedCategory | string,
	name: string,
	description: string,
	priority: GettingStartedPriority | number
	items: IGettingStartedItem[]
}

export class GettingStartedRegistryImpl {
	private readonly gettingStartedContributions = new Map<string, IWritableGettingStartedCategory>();

	public registerItem(item: IGettingStartedItem, categoryID: GettingStartedCategory | string): void {
		const category = this.gettingStartedContributions.get(categoryID);
		if (!category) { throw Error('Registering getting started item to category that does not exist (' + categoryID + ')'); }
		category.items.push(item);
	}

	public registerCategory(categoryDescriptor: IGettingStartedCategoryDescriptor): void {
		const oldCategory = this.gettingStartedContributions.get(categoryDescriptor.id);
		if (oldCategory) {
			console.error(`Skipping attempt to overwrite getting started category. (${categoryDescriptor})`);
			return;
		}
		const category: IWritableGettingStartedCategory = { ...categoryDescriptor, items: [], };
		this.gettingStartedContributions.set(categoryDescriptor.id, category);
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

registryImpl.registerCategory({
	id: GettingStartedCategory.Beginner,
	name: nls.localize('gettingStarted.beginner.title', "Welcome to VS Code"),
	description: nls.localize('gettingStarted.beginner.description', "Get to know your new Editor"),
	priority: GettingStartedPriority.Beginner,
});

registryImpl.registerCategory({
	id: GettingStartedCategory.Intermediate,
	name: nls.localize('gettingStarted.intermediate.title', "Essentials"),
	description: nls.localize('gettingStarted.intermediate.description', "Must know features you'll love"),
	priority: GettingStartedPriority.Intermediate,
});

registryImpl.registerCategory({
	id: GettingStartedCategory.Advanced,
	name: nls.localize('gettingStarted.advanced.title', "Genius Picks"),
	description: nls.localize('gettingStarted.advanced.description', "Favorite tips & tricks from VS Code experts"),
	priority: GettingStartedPriority.Advanced,
});


Registry.add(GettingStartedRegistryID, registryImpl);

export const GettingStartedRegistry: GettingStartedRegistryImpl = Registry.as(GettingStartedRegistryID);
