/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { GettingStartedInputFactory, GettingStartedInput, GettingStartedPage } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStarted';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import product from 'vs/platform/product/common/product';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';

export * as icons from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedIcons';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showGettingStarted',
			title: localize('Getting Started', "Getting Started"),
			category: localize('help', "Help"),
			f1: true,
			precondition: ContextKeyExpr.has('config.workbench.experimental.gettingStarted'),
			menu: {
				id: MenuId.MenubarHelpMenu,
				when: ContextKeyExpr.has('config.workbench.experimental.gettingStarted'),
				group: '1_welcome',
				order: 2,
			}
		});
	}

	public run(accessor: ServicesAccessor) {
		accessor.get(IEditorService).openEditor(new GettingStartedInput({}), {});
	}
});

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(GettingStartedInput.ID, GettingStartedInputFactory);
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		GettingStartedPage,
		GettingStartedPage.ID,
		localize('gettingStarted', "Getting Started")
	),
	[
		new SyncDescriptor(GettingStartedInput)
	]
);

if (product.quality !== 'stable') {
	Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.experimental.gettingStarted': {
				type: 'boolean',
				description: localize('gettingStartedDescription', "Enables an experimental Getting Started page, available via the Help menu."),
				default: false,
			}
		}
	});
}

const category = localize('gettingStarted', "Getting Started");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.goBack',
			title: localize('gettingStarted.goBack', "Go Back"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.escape();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.next',
			title: localize('gettingStarted.goNext', "Next"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.DownArrow,
				secondary: [KeyCode.RightArrow],
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusNext();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.prev',
			title: localize('gettingStarted.goPrev', "Previous"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.UpArrow,
				secondary: [KeyCode.LeftArrow],
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusPrevious();
		}
	}
});
