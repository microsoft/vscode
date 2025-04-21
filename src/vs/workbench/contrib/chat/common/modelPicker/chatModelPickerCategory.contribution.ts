/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import * as extensionsRegistry from '../../../../services/extensions/common/extensionsRegistry.js';
import { IChatModelCategoryService } from './chatModelCategoryService.js';

export interface IRawChatModelPickerCategoryContribution {
	/**
	 * The id of the category
	 */
	id: string;

	/**
	 * User-facing name of the category
	 */
	name: string;
}

const chatModelPickerCategoriesExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<IRawChatModelPickerCategoryContribution[]>({
	extensionPoint: 'chatModelPickerCategories',
	jsonSchema: {
		description: localize('vscode.extension.contributes.chatModelPickerCategories', 'Contributes categories for organizing models in the chat model picker'),
		type: 'array',
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { id: '', name: '' } }],
			required: ['id', 'name'],
			properties: {
				id: {
					description: localize('chatModelPickerCategoryId', "A unique identifier for this category."),
					type: 'string'
				},
				name: {
					description: localize('chatModelPickerCategoryName', "User-facing name for this category."),
					type: 'string'
				}
			}
		}
	},
	activationEventsGenerator: (contributions: IRawChatModelPickerCategoryContribution[], result: { push(item: string): void }) => {
		for (const contrib of contributions) {
			result.push(`onChatModelPickerCategory:${contrib.id}`);
		}
	},
});

export class ChatModelPickerCategoryHandler implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatModelPickerCategoryHandler';

	private _categoryRegistrationDisposables = new DisposableMap<string>();

	constructor(
		@IChatModelCategoryService private readonly modelCategoryService: IChatModelCategoryService,
		@ILogService private readonly logService: ILogService
	) {
		this.handleAndRegisterModelCategories();
	}

	private handleAndRegisterModelCategories(): void {
		chatModelPickerCategoriesExtensionPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				for (const categoryDescriptor of extension.value) {
					try {
						const store = new DisposableStore();
						store.add(this.modelCategoryService.registerCategory({
							id: categoryDescriptor.id,
							name: categoryDescriptor.name
						}));

						// Store the registration under a key that combines extension ID and category ID
						this._categoryRegistrationDisposables.set(
							getCategoryKey(extension.description.identifier, categoryDescriptor.id),
							store
						);
					} catch (e) {
						this.logService.error(`Failed to register model picker category ${categoryDescriptor.id}: ${e}`);
					}
				}
			}

			for (const extension of delta.removed) {
				for (const categoryDescriptor of extension.value) {
					this._categoryRegistrationDisposables.deleteAndDispose(getCategoryKey(extension.description.identifier, categoryDescriptor.id));
				}
			}
		});
	}
}

function getCategoryKey(extensionId: ExtensionIdentifier, categoryId: string): string {
	return `${extensionId.value}_${categoryId}`;
}
