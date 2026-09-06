/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { INotebookContributionData } from './notebookCommon.js';

export interface IBuiltinNotebookType {
	readonly viewType: string;
	readonly data: INotebookContributionData;
}

interface IBuiltinNotebookTypeRegistry {
	register(viewType: string, data: INotebookContributionData): IDisposable;
	getAll(): Iterable<IBuiltinNotebookType>;
}

const notebookTypeRegistryId = 'workbench.contributions.builtinNotebookTypes';

class BuiltinNotebookTypeRegistry implements IBuiltinNotebookTypeRegistry {
	private readonly notebookTypes = new Map<string, IBuiltinNotebookType>();

	register(viewType: string, data: INotebookContributionData): IDisposable {
		if (this.notebookTypes.has(viewType)) {
			throw new Error(`Built-in notebook type '${viewType}' is already registered`);
		}

		this.notebookTypes.set(viewType, { viewType, data });
		return toDisposable(() => this.notebookTypes.delete(viewType));
	}

	getAll(): Iterable<IBuiltinNotebookType> {
		return this.notebookTypes.values();
	}
}

Registry.add(notebookTypeRegistryId, new BuiltinNotebookTypeRegistry());

export function registerBuiltinNotebookType(viewType: string, data: INotebookContributionData): IDisposable {
	return Registry.as<IBuiltinNotebookTypeRegistry>(notebookTypeRegistryId).register(viewType, data);
}

export function getBuiltinNotebookTypes(): Iterable<IBuiltinNotebookType> {
	return Registry.as<IBuiltinNotebookTypeRegistry>(notebookTypeRegistryId).getAll();
}
