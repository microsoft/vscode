/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { AgentHostSemanticDiffSourceResolver } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/semanticDiffSourceResolver.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISemanticDiffEditorRequest, ISemanticDiffSourceResolverService, OpenSemanticDiffEditorCommandId, SemanticDiffCardMenu } from '../../../../workbench/contrib/chat/common/semanticDiffEditor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { SemanticDiffAccessibility } from './semanticDiffAccessibility.js';
import { SemanticDiffEditor } from './semanticDiffEditor.js';
import { SemanticDiffEditorInput, SemanticDiffEditorSerializer } from './semanticDiffEditorInput.js';

registerSingleton(ISemanticDiffSourceResolverService, AgentHostSemanticDiffSourceResolver, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SemanticDiffEditor, SemanticDiffEditor.ID, localize('semanticDiff.editorName', "Semantic Group Diff")),
	[new SyncDescriptor(SemanticDiffEditorInput)],
);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SemanticDiffEditorInput.ID, SemanticDiffEditorSerializer);

registerAction2(class OpenSemanticDiffEditorAction extends Action2 {
	constructor() {
		super({
			id: OpenSemanticDiffEditorCommandId,
			title: localize2('semanticDiff.open', "Open Group Diff"),
			icon: Codicon.diffMultiple,
			precondition: ChatContextKeys.enabled,
			menu: { id: SemanticDiffCardMenu, group: 'navigation', when: ChatContextKeys.enabled },
		});
	}

	async run(accessor: ServicesAccessor, request: ISemanticDiffEditorRequest): Promise<void> {
		const input = new SemanticDiffEditorInput(request);
		try {
			const editor = await accessor.get(IEditorService).openEditor(input, { pinned: true, revealIfOpened: true });
			if (editor?.input !== input) {
				input.dispose();
			}
		} catch (error) {
			input.dispose();
			throw error;
		}
	}
});

AccessibleViewRegistry.register(new SemanticDiffAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new SemanticDiffAccessibility(AccessibleViewType.View));
