/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyDefinedExpr, ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { inWalkthroughsContext, WalkthroughsInput, WalkthroughsInputFactory, WalkthroughsPage } from 'vs/workbench/contrib/welcome/walkthroughs/browser/walkthroughs';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showWalkthroughs',
			title: localize('Walkthroughs', "Walkthroughs"),
			category: localize('help', "Help"),
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				when: ContextKeyDefinedExpr.create('config.workbench.experimental.walkthroughs'),
				order: 2,
			}
		});
	}

	public run(accessor: ServicesAccessor) {
		accessor.get(IEditorService).openEditor(new WalkthroughsInput({}), {});
	}
});

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(WalkthroughsInput.ID, WalkthroughsInputFactory);
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		WalkthroughsPage,
		WalkthroughsPage.ID,
		localize('walkthroughs', "Walkthroughs")
	),
	[
		new SyncDescriptor(WalkthroughsInput)
	]
);

const category = localize('walkthroughs', "Walkthroughs");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'walkthroughs.goBack',
			title: localize('walkthroughs.goBack', "Go Back"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				when: inWalkthroughsContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'walkthroughsPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof WalkthroughsPage) {
			editorPane.escape();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'walkthroughs.next',
			title: localize('walkthroughs.goNext', "Next"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.DownArrow,
				secondary: [KeyCode.RightArrow],
				when: inWalkthroughsContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'walkthroughsPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof WalkthroughsPage) {
			editorPane.focusNext();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'walkthroughs.prev',
			title: localize('walkthroughs.goPrev', "Previous"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.UpArrow,
				secondary: [KeyCode.LeftArrow],
				when: inWalkthroughsContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'walkthroughsPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof WalkthroughsPage) {
			editorPane.focusPrevious();
		}
	}
});
