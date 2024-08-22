/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { WalkThroughInput } from './walkThroughInput';
import { WalkThroughPart } from './walkThroughPart';
import { WalkThroughArrowUp, WalkThroughArrowDown, WalkThroughPageUp, WalkThroughPageDown } from './walkThroughActions';
import { WalkThroughSnippetContentProvider } from '../common/walkThroughContentProvider';
import { EditorWalkThroughAction, EditorWalkThroughInputSerializer } from './editor/editorWalkThrough';
import { Registry } from '../../../../platform/registry/common/platform';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors';
import { MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions';
import { registerWorkbenchContribution2 } from '../../../common/contributions';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(EditorPaneDescriptor.create(
		WalkThroughPart,
		WalkThroughPart.ID,
		localize('walkThrough.editor.label', "Playground"),
	),
		[new SyncDescriptor(WalkThroughInput)]);

registerAction2(EditorWalkThroughAction);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(EditorWalkThroughInputSerializer.ID, EditorWalkThroughInputSerializer);

registerWorkbenchContribution2(WalkThroughSnippetContentProvider.ID, WalkThroughSnippetContentProvider, { editorTypeId: WalkThroughPart.ID });

KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughArrowUp);

KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughArrowDown);

KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughPageUp);

KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughPageDown);

MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
	group: '1_welcome',
	command: {
		id: 'workbench.action.showInteractivePlayground',
		title: localize({ key: 'miPlayground', comment: ['&& denotes a mnemonic'] }, "Editor Playgrou&&nd")
	},
	order: 3
});
