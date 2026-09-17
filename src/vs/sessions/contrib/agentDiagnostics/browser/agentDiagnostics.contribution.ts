/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SinglePaneLayoutEnabledContext } from '../../../common/contextkeys.js';
import { AgentDiagnosticsEditor, AgentDiagnosticsFocusedContext } from './agentDiagnosticsEditor.js';
import { AgentDiagnosticsEditorInput, AgentDiagnosticsEditorSerializer } from './agentDiagnosticsEditorInput.js';
import { AgentDiagnosticsToolsContribution } from './agentDiagnosticsTools.js';

const OPEN_AGENT_DIAGNOSTICS_COMMAND_ID = 'workbench.action.agentSessions.openDiagnostics';

class AgentDiagnosticsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.agentDiagnostics';

	constructor() {
		super();
		this._register(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(
				AgentDiagnosticsEditor,
				AgentDiagnosticsEditor.ID,
				localize('agentDiagnosticsEditor.label', "Diagnostics")
			),
			[new SyncDescriptor(AgentDiagnosticsEditorInput)]
		));
		this._register(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
			AgentDiagnosticsEditorInput.ID,
			AgentDiagnosticsEditorSerializer
		));
		this._register(registerAction2(OpenAgentDiagnosticsAction));
	}
}

class OpenAgentDiagnosticsAction extends Action2 {

	constructor() {
		const enabled = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled);
		super({
			id: OPEN_AGENT_DIAGNOSTICS_COMMAND_ID,
			title: localize2('openAgentDiagnostics', "Diagnostics"),
			category: SessionsCategories.Sessions,
			icon: Codicon.pulse,
			f1: true,
			precondition: enabled,
			menu: {
				id: Menus.SessionsEditorTabsBarAddTab,
				group: 'navigation',
				order: 4,
				when: ContextKeyExpr.and(enabled, SinglePaneLayoutEnabledContext, IsAuxiliaryWindowContext.toNegated(), IsTopRightEditorGroupContext),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const group = editorGroupsService.mainPart.activeGroup;

		layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		await editorService.openEditor(instantiationService.createInstance(AgentDiagnosticsEditorInput), { pinned: true, index: group.count }, group);
	}
}

class AgentDiagnosticsAccessibleView implements IAccessibleViewImplementation {

	readonly priority = 130;
	readonly name = 'agentDiagnostics';

	constructor(readonly type: AccessibleViewType) { }

	readonly when = AgentDiagnosticsFocusedContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AgentDiagnosticsEditor)) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.Help
			? [
				localize('agentDiagnostics.accessibilityHelp.overview', "The Diagnostics editor shows information for the focused Agents session and its active chat."),
				localize('agentDiagnostics.accessibilityHelp.tabs', "Use the left and right arrow keys to switch between Session Insights and Agent Debug."),
				localize('agentDiagnostics.accessibilityHelp.view', "Open the accessible view to read the selected diagnostics tab as text{0}.", '<keybinding:editor.action.accessibleView>'),
			].join('\n')
			: editor.getAccessibleContent();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AgentDiagnostics,
			{ type: this.type, language: 'plaintext' },
			() => content,
			() => editor.focus(),
			AccessibilityVerbositySettingId.AgentDiagnostics,
		);
	}
}

registerWorkbenchContribution2(AgentDiagnosticsContribution.ID, AgentDiagnosticsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentDiagnosticsToolsContribution.ID, AgentDiagnosticsToolsContribution, WorkbenchPhase.BlockRestore);
AccessibleViewRegistry.register(new AgentDiagnosticsAccessibleView(AccessibleViewType.Help));
AccessibleViewRegistry.register(new AgentDiagnosticsAccessibleView(AccessibleViewType.View));
