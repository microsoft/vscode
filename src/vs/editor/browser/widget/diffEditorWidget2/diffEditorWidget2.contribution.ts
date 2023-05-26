/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyEqualsExpr, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

export class ToggleCollapseUnchangedRegions extends Action2 {
	constructor() {
		super({
			id: 'diffEditor.toggleCollapseUnchangedRegions',
			title: { value: localize('toggleCollapseUnchangedRegions', "Toggle Collapse Unchanged Regions"), original: 'Toggle Collapse Unchanged Regions' },
			icon: Codicon.map,
			precondition: ContextKeyEqualsExpr.create('diffEditorVersion', 2),
		});
	}

	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue<boolean>('diffEditor.experimental.collapseUnchangedRegions');
		configurationService.updateValue('diffEditor.experimental.collapseUnchangedRegions', newValue);
	}
}

registerAction2(ToggleCollapseUnchangedRegions);

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: new ToggleCollapseUnchangedRegions().desc.id,
		title: localize('collapseUnchangedRegions', "Collapse Unchanged Regions"),
		icon: Codicon.map
	},
	group: 'navigation',
	when: ContextKeyExpr.and(
		ContextKeyExpr.has('config.diffEditor.experimental.collapseUnchangedRegions'),
		ContextKeyEqualsExpr.create('diffEditorVersion', 2)
	)
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: new ToggleCollapseUnchangedRegions().desc.id,
		title: localize('showUnchangedRegions', "Show Unchanged Regions"),
		icon: ThemeIcon.modify(Codicon.map, 'disabled'),
	},
	group: 'navigation',
	when: ContextKeyExpr.and(
		ContextKeyExpr.has('config.diffEditor.experimental.collapseUnchangedRegions').negate(),
		ContextKeyEqualsExpr.create('diffEditorVersion', 2)
	)
});
