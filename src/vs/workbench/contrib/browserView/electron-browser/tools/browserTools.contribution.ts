/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IPlaywrightService } from '../../../../../platform/browserView/common/playwrightService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatContextService } from '../../../chat/browser/contextContrib/chatContextService.js';
import { ILanguageModelToolsService, ToolDataSource, ToolSet } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserEditorInput } from '../browserEditorInput.js';
import { ClickBrowserTool, ClickBrowserToolData } from './clickBrowserTool.js';
import { DragElementTool, DragElementToolData } from './dragElementTool.js';
import { HandleDialogBrowserTool, HandleDialogBrowserToolData } from './handleDialogBrowserTool.js';
import { HoverElementTool, HoverElementToolData } from './hoverElementTool.js';
import { NavigateBrowserTool, NavigateBrowserToolData } from './navigateBrowserTool.js';
import { OpenBrowserTool, OpenBrowserToolData } from './openBrowserTool.js';
import { OpenBrowserToolNonAgentic, OpenBrowserToolNonAgenticData } from './openBrowserToolNonAgentic.js';
import { ReadBrowserTool, ReadBrowserToolData } from './readBrowserTool.js';
import { RunPlaywrightCodeTool, RunPlaywrightCodeToolData } from './runPlaywrightCodeTool.js';
import { ScreenshotBrowserTool, ScreenshotBrowserToolData } from './screenshotBrowserTool.js';
import { TypeBrowserTool, TypeBrowserToolData } from './typeBrowserTool.js';

class BrowserChatAgentToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'browserView.chatAgentTools';
	private static readonly CONTEXT_ID = 'browserView.trackedPages';

	private readonly _toolsStore = this._register(new DisposableStore());
	private readonly _browserToolSet: ToolSet;

	private _trackedIds: ReadonlySet<string> = new Set();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPlaywrightService private readonly playwrightService: IPlaywrightService,
		@IChatContextService private readonly chatContextService: IChatContextService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super();

		this._browserToolSet = this._register(this.toolsService.createToolSet(
			ToolDataSource.Internal,
			'browser',
			'browser',
			{
				icon: Codicon.globe,
				description: localize('browserToolSet.description', 'Open and interact with integrated browser pages'),
			}
		));

		this._updateToolRegistrations();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.browser.enableChatTools')) {
				this._updateToolRegistrations();
			}
		}));
	}

	private _updateToolRegistrations(): void {
		this._toolsStore.clear();

		if (!this.configurationService.getValue<boolean>('workbench.browser.enableChatTools')) {
			// If chat tools are disabled, we only register the non-agentic open tool,
			// which allows opening browser pages without granting access to their contents.
			this._toolsStore.add(this.toolsService.registerTool(OpenBrowserToolNonAgenticData, this.instantiationService.createInstance(OpenBrowserToolNonAgentic)));
			this._toolsStore.add(this._browserToolSet.addTool(OpenBrowserToolNonAgenticData));
			this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution.CONTEXT_ID, []);
			return;
		}

		this._toolsStore.add(this.toolsService.registerTool(OpenBrowserToolData, this.instantiationService.createInstance(OpenBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(ReadBrowserToolData, this.instantiationService.createInstance(ReadBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(ScreenshotBrowserToolData, this.instantiationService.createInstance(ScreenshotBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(NavigateBrowserToolData, this.instantiationService.createInstance(NavigateBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(ClickBrowserToolData, this.instantiationService.createInstance(ClickBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(DragElementToolData, this.instantiationService.createInstance(DragElementTool)));
		this._toolsStore.add(this.toolsService.registerTool(HoverElementToolData, this.instantiationService.createInstance(HoverElementTool)));
		this._toolsStore.add(this.toolsService.registerTool(TypeBrowserToolData, this.instantiationService.createInstance(TypeBrowserTool)));
		this._toolsStore.add(this.toolsService.registerTool(RunPlaywrightCodeToolData, this.instantiationService.createInstance(RunPlaywrightCodeTool)));
		this._toolsStore.add(this.toolsService.registerTool(HandleDialogBrowserToolData, this.instantiationService.createInstance(HandleDialogBrowserTool)));

		this._toolsStore.add(this._browserToolSet.addTool(OpenBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(ReadBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(ScreenshotBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(NavigateBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(ClickBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(DragElementToolData));
		this._toolsStore.add(this._browserToolSet.addTool(HoverElementToolData));
		this._toolsStore.add(this._browserToolSet.addTool(TypeBrowserToolData));
		this._toolsStore.add(this._browserToolSet.addTool(RunPlaywrightCodeToolData));
		this._toolsStore.add(this._browserToolSet.addTool(HandleDialogBrowserToolData));

		// Publish tracked browser pages as workspace context for chat requests
		this.playwrightService.getTrackedPages().then(ids => {
			this._trackedIds = new Set(ids);
			this._updateBrowserContext();
		});
		this._toolsStore.add(this.playwrightService.onDidChangeTrackedPages(ids => {
			this._trackedIds = new Set(ids);
			this._updateBrowserContext();
		}));
		this._toolsStore.add(this.editorService.onDidEditorsChange(() => this._updateBrowserContext()));
	}

	private _updateBrowserContext(): void {
		const lines: string[] = [];
		const activeEditor = this.editorService.activeEditor;
		const visibleEditors = new Set(this.editorService.visibleEditors);
		for (const editor of this.editorService.editors) {
			if (editor instanceof BrowserEditorInput && this._trackedIds.has(editor.id)) {
				const title = editor.getTitle() || 'Untitled';
				const url = editor.getDescription() || 'about:blank';
				const hint = editor === activeEditor ? ' (active)' : visibleEditors.has(editor) ? ' (visible)' : '';
				lines.push(`- [${editor.id}] ${title} (${url})${hint}`);
			}
		}

		if (lines.length === 0) {
			this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution.CONTEXT_ID, []);
			return;
		}

		this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution.CONTEXT_ID, [{
			handle: 0,
			label: localize('browserContext.label', "Browser Pages"),
			modelDescription: `The following browser pages are currently available and can be interacted with using the browser tools:`,
			value: lines.join('\n'),
		}]);
	}
}
registerWorkbenchContribution2(BrowserChatAgentToolsContribution.ID, BrowserChatAgentToolsContribution, WorkbenchPhase.AfterRestored);
