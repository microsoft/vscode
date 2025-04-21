/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export interface IChatModelCategory {
	/**
	 * The unique identifier for this category
	 */
	id: string;

	/**
	 * The user-facing name of this category
	 */
	name: string;
}

export interface IChatModelCategoryService {
	readonly _serviceBrand: undefined;

	/**
	 * An event that fires when the registered categories change
	 */
	readonly onDidChangeCategories: Event<void>;

	/**
	 * Register a model category
	 * @param category The category to register
	 * @returns A disposable that will unregister the category
	 */
	registerCategory(category: IChatModelCategory): IDisposable;

	/**
	 * Get all registered categories
	 * @returns An array of registered categories
	 */
	getCategories(): IChatModelCategory[];

	/**
	 * Get a category by its ID
	 * @param id The ID of the category to retrieve
	 * @returns The category with the given ID, or undefined if not found
	 */
	getCategoryById(id: string): IChatModelCategory | undefined;
}

export const IChatModelCategoryService = createDecorator<IChatModelCategoryService>('chatModelCategoryService');

export const DEFAULT_MODEL_PICKER_CATEGORY = 'other';

export class ChatModelCategoryService extends Disposable implements IChatModelCategoryService {
	_serviceBrand: undefined;

	private readonly _onDidChangeCategories = this._register(new Emitter<void>());
	readonly onDidChangeCategories = this._onDidChangeCategories.event;

	private readonly _categories = new Map<string, IChatModelCategory>();
	private readonly _modelCategories = new Map<string, string>();

	constructor() {
		super();
		this._register(this.registerCategory({ id: DEFAULT_MODEL_PICKER_CATEGORY, name: localize('chat.modelPicker.other', "Other Models") }));
	}

	registerCategory(category: IChatModelCategory) {
		if (this._categories.has(category.id)) {
			throw new Error(`Model category with ID '${category.id}' is already registered`);
		}

		this._categories.set(category.id, category);
		this._onDidChangeCategories.fire();

		return {
			dispose: () => {
				if (this._categories.delete(category.id)) {
					this._onDidChangeCategories.fire();
				}
			}
		};
	}

	getCategories(): IChatModelCategory[] {
		return Array.from(this._categories.values()).sort((a, b) => {
			return a.name.localeCompare(b.name);
		});
	}

	getCategoryById(id: string): IChatModelCategory | undefined {
		return this._categories.get(id);
	}

	getCategoryForModel(modelId: string): string | undefined {
		return this._modelCategories.get(modelId);
	}
}
