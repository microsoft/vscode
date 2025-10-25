/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

export class ToggleMultiCursorModifierAction extends Action2 {

	static readonly ID = 'workbench.action.toggleMultiCursorModifier';

	private static readonly multiCursorModifierConfigurationKey = 'editor.multiCursorModifier';

	constructor() {
		super({
			id: ToggleMultiCursorModifierAction.ID,
			title: localize2('toggleLocation', 'Toggle Multi-Cursor Modifier'),
			f1: true
		});
	}

	override run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);

		const editorConf = configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		const newValue: 'ctrlCmd' | 'alt' = (editorConf.multiCursorModifier === 'ctrlCmd' ? 'alt' : 'ctrlCmd');

		return configurationService.updateValue(ToggleMultiCursorModifierAction.multiCursorModifierConfigurationKey, newValue);
	}
}

const multiCursorModifier = new RawContextKey<string>('multiCursorModifier', 'altKey');

class MultiCursorModifierContextKeyController extends Disposable implements IWorkbenchContribution {

	private readonly _multiCursorModifier: IContextKey<string>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._multiCursorModifier = multiCursorModifier.bindTo(contextKeyService);

		this._update();
		this._register(configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('editor.multiCursorModifier')) {
				this._update();
			}
		}));
	}

	private _update(): void {
		const editorConf = this.configurationService.getValue<{ multiCursorModifier: 'ctrlCmd' | 'alt' }>('editor');
		const value = (editorConf.multiCursorModifier === 'ctrlCmd' ? 'ctrlCmd' : 'altKey');
		this._multiCursorModifier.set(value);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(MultiCursorModifierContextKeyController, LifecyclePhase.Restored);

registerAction2(ToggleMultiCursorModifierAction);

MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
	group: '4_config',
	command: {
		id: ToggleMultiCursorModifierAction.ID,
		title: localize('miMultiCursorAlt', "Switch to Alt+Click for Multi-Cursor")
	},
	when: multiCursorModifier.isEqualTo('ctrlCmd'),
	order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSelectionMenu, {
	group: '4_config',
	command: {
		id: ToggleMultiCursorModifierAction.ID,
		title: (
			isMacintosh
				? localize('miMultiCursorCmd', "Switch to Cmd+Click for Multi-Cursor")
				: localize('miMultiCursorCtrl', "Switch to Ctrl+Click for Multi-Cursor")
		)
	},
	when: multiCursorModifier.isEqualTo('altKey'),
	order: 1
});
