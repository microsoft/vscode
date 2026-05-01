/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentNetworkFilterService } from '../../../../../platform/networkFilter/common/networkFilterService.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatContextService } from '../../../chat/browser/contextContrib/chatContextService.js';
import { ILanguageModelToolsService, ToolDataSource, ToolSet } from '../../../chat/common/tools/languageModelToolsService.js';
import { BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { formatBrowserEditorList } from './browserToolHelpers.js';
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
	private readonly _modelListeners = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _browserToolSet: ToolSet;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IChatContextService private readonly chatContextService: IChatContextService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserViewWorkbenchService private readonly browserViewService: IBrowserViewWorkbenchService,
		@IAgentNetworkFilterService private readonly agentNetworkFilterService: IAgentNetworkFilterService,
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

		this._register(this.browserViewService.onDidChangeSharingAvailable(() => {
			this._updateToolRegistrations();
		}));
	}

	private _updateToolRegistrations(): void {
		this._toolsStore.clear();
		this._modelListeners.clearAndDisposeAll();

		if (!this.browserViewService.isSharingAvailable) {
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

		// Subscribe to browser view changes and model sharing state changes
		this._syncModelListeners();
		this._toolsStore.add(this.browserViewService.onDidChangeBrowserViews(() => {
			this._syncModelListeners();
			this._updateBrowserContext();
		}));
		this._toolsStore.add(this.editorService.onDidActiveEditorChange(() => this._updateBrowserContext()));
		this._toolsStore.add(this.editorService.onDidVisibleEditorsChange(() => this._updateBrowserContext()));
		this._toolsStore.add(this.agentNetworkFilterService.onDidChange(() => this._updateBrowserContext()));

		this._updateBrowserContext();
	}

	/**
	 * Subscribe to sharingState changes on each known model so the workspace
	 * context updates whenever a page is shared or unshared.
	 */
	private _syncModelListeners(): void {
		const views = this.browserViewService.getKnownBrowserViews();
		// Remove listeners for views that no longer exist
		for (const id of this._modelListeners.keys()) {
			if (!views.has(id)) {
				this._modelListeners.deleteAndDispose(id);
			}
		}
		// Add listeners for new views
		for (const [id, input] of views) {
			if (!this._modelListeners.has(id) && input.model) {
				const store = new DisposableStore();
				store.add(input.model.onDidChangeSharingState(() => this._updateBrowserContext()));
				this._modelListeners.set(id, store);
			}
		}
	}

	private _updateBrowserContext(): void {
		const views = [...this.browserViewService.getKnownBrowserViews().values()];
		const sharedViews = views.filter(v => v.model?.sharingState === BrowserViewSharingState.Shared);
		const unsharedCount = views.length - sharedViews.length;

		if (sharedViews.length === 0 && unsharedCount === 0) {
			this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution.CONTEXT_ID, []);
			return;
		}

		let value = '';
		if (sharedViews.length > 0) {
			value = 'The following browser pages are currently shared with you and can be interacted with using the browser tools:';
			value += '\n' + formatBrowserEditorList(this.editorService, sharedViews, { agentNetworkFilterService: this.agentNetworkFilterService });
		} else {
			value = 'No browser pages are currently shared with you.';
		}

		if (unsharedCount > 0) {
			if (value) {
				value += '\n\n';
			}
			value += `${unsharedCount} ${unsharedCount === 1 ? 'page is' : 'pages are'} open but not shared.`;
			value += `\nUse the 'open_browser_page' tool to open a new page or to help the user share an existing page.`;
		}

		this.chatContextService.updateWorkspaceContextItems(BrowserChatAgentToolsContribution.CONTEXT_ID, [{
			handle: 0,
			label: localize('browserContext.label', "Browser Pages"),
			value: value
		}]);
	}
}
registerWorkbenchContribution2(BrowserChatAgentToolsContribution.ID, BrowserChatAgentToolsContribution, WorkbenchPhase.AfterRestored);
