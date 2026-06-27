/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { browserChatToolReferenceNames } from '../../../../../platform/browserView/common/browserChatToolReferenceNames.js';
import { IAICustomizationWorkspaceService } from '../../common/aiCustomizationWorkspaceService.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../common/tools/languageModelToolsService.js';

/**
 * Describes a tool set whose membership is resolved dynamically from a list of tool reference names.
 */
interface IDynamicToolSetSpec {
	readonly id: string;
	readonly referenceName: string;
	readonly icon: ThemeIcon;
	readonly description: string;
	readonly detail: string;
	readonly members: readonly string[];
}

/**
 * Contributes the built-in "client" tool sets surfaced as rows in the Chat Customizations → Tools section.
 */
export class ClientToolSetsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chat.clientToolSets';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
	) {
		super();

		this._register(this._registerDynamicToolSet(toolsService, {
			id: 'vscode-tasks',
			referenceName: 'vscodeTasks',
			icon: Codicon.tasklist,
			description: localize('clientToolSet.tasks.description', "Tasks"),
			detail: localize('clientToolSet.tasks.detail', "Create and run tasks defined in your workspace."),
			members: [
				'createAndRunTask',
				'runTask',
				'getTaskOutput',
			],
		}));

		this._register(this._registerDynamicToolSet(toolsService, {
			id: 'vscode-browser',
			referenceName: 'vscodeBrowser',
			icon: Codicon.browser,
			description: localize('clientToolSet.browser.description', "Integrated Browser"),
			detail: localize('clientToolSet.browser.detail', "Open, navigate, and inspect pages in the built-in browser."),
			members: browserChatToolReferenceNames,
		}));

		this._register(this._registerDynamicToolSet(toolsService, {
			id: 'vscode-general',
			referenceName: 'vscodeGeneral',
			icon: Codicon.vscode,
			description: localize('clientToolSet.vscode.description', "VS Code"),
			detail: localize('clientToolSet.vscode.detail', "Navigate code, manage extensions, and run built-in VS Code commands."),
			members: [
				'runTests',
				'testFailure',
				'problems',
				'rename',
				'usages',
				'extensions',
				'installExtension',
				'newWorkspace',
				'runCommand',
				'toolSearch',
				'vscodeAPI',
			],
		}));

		if (!workspaceService.isSessionsWindow) {
			this._register(this._registerDynamicToolSet(toolsService, {
				id: 'vscode-notebooks',
				referenceName: 'vscodeNotebooks',
				icon: Codicon.notebook,
				description: localize('clientToolSet.notebooks.description', "Jupyter Notebooks"),
				detail: localize('clientToolSet.notebooks.detail', "Create and edit Jupyter notebooks and run their cells."),
				members: [
					'createJupyterNotebook',
					'editNotebook',
					'runNotebookCell',
					'getNotebookSummary',
					'readNotebookCellOutput',
				],
			}));
		}
	}

	/**
	 * Creates a tool set and keeps its membership in sync with the tools registered under the
	 * reference names in {@link IDynamicToolSetSpec.members}. Returns a disposable that removes the
	 * tool set and all of its member registrations.
	 */
	private _registerDynamicToolSet(toolsService: ILanguageModelToolsService, spec: IDynamicToolSetSpec): IDisposable {
		const store = new DisposableStore();

		const toolSet = store.add(toolsService.createToolSet(
			ToolDataSource.Internal,
			spec.id,
			spec.referenceName,
			{
				icon: spec.icon,
				description: spec.description,
				detail: spec.detail,
				hiddenInToolsPicker: true,
			}
		));

		/** Tracks the currently-added member tools so membership can be reconciled on change. */
		const members = new Map<string, { readonly tool: IToolData; readonly disposable: IDisposable }>();
		const reconcile = () => {
			for (const name of spec.members) {
				const tool = toolsService.getToolByName(name) ?? toolsService.getTool(name);
				const existing = members.get(name);
				if (tool === existing?.tool) {
					continue;
				}
				existing?.disposable.dispose();
				members.delete(name);
				if (tool) {
					members.set(name, { tool, disposable: toolSet.addTool(tool) });
				}
			}
		};

		store.add(toolsService.onDidChangeTools(() => reconcile()));
		store.add(toDisposable(() => {
			for (const { disposable } of members.values()) {
				disposable.dispose();
			}
			members.clear();
		}));
		reconcile();

		return store;
	}
}
