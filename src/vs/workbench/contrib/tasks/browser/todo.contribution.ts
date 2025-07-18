/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ILanguageModelToolsService } from '../../chat/common/languageModelToolsService.js';
import {
	ITodoToolService,
	TodoToolService,
	TodoTool,
	TodoToolData
} from './todoTool.js';

// Register the todo tool service
registerSingleton(ITodoToolService, TodoToolService, InstantiationType.Delayed);

// Todo tool contribution that registers the tool with the language model tools service
class TodoToolContribution {

	constructor(
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ITodoToolService private readonly todoToolService: ITodoToolService,
	) {
		this.registerTool();
	}

	private registerTool(): void {
		// Register the tool data (metadata)
		this.languageModelToolsService.registerToolData(TodoToolData);

		// Create and register the tool implementation
		const todoTool = new TodoTool(this.todoToolService);
		this.languageModelToolsService.registerToolImplementation(TodoToolData.id, todoTool);
	}
}

// Register the contribution to run during workbench startup
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(TodoToolContribution, LifecyclePhase.Restored);
