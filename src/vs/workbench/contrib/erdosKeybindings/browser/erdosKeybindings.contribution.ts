/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import * as nls from '../../../../nls.js';
import { erdosConfigurationNodeBase } from '../../../services/languageRuntime/common/languageRuntime.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(
	Extensions.Configuration
);
configurationRegistry.registerConfiguration({
	...erdosConfigurationNodeBase,
	properties: {
		'workbench.keybindings.rstudioKeybindings': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: false,
			description: nls.localize('keybindings.rstudioKeybindings', "Enable RStudio keybindings (requires restart)"),
		},
	}
});

class ErdosKeybindingsContribution extends Disposable {

	static readonly ID = 'workbench.contrib.erdosKeybindings';

	private readonly _registrations: DisposableStore = new DisposableStore();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		this._register(this._registrations);

		const rstudioKeybindingsEnabled =
			this._configurationService.getValue('workbench.keybindings.rstudioKeybindings');
		if (rstudioKeybindingsEnabled) {
			this.registerRStudioKeybindings();
		}

		this._register(
			this._configurationService.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration('workbench.keybindings.rstudioKeybindings')) {
					const rstudioKeybindingsEnabled =
						this._configurationService.getValue('workbench.keybindings.rstudioKeybindings');
					if (rstudioKeybindingsEnabled) {
						this.registerRStudioKeybindings();
					} else {
						this._registrations.clear();
					}
				}
			})
		);
	}

	private registerRStudioKeybindings() {
		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'r.createNewFile',
			weight: KeybindingWeight.BuiltinExtension,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyN
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.revealDefinition',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyCode.F2
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.focusActiveEditorGroup',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Digit1,
				secondary: [KeyMod.WinCtrl | KeyCode.Digit1]
			},
			primary: KeyMod.CtrlCmd | KeyCode.Digit1
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.erdosConsole.focusConsole',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Digit2,
				secondary: [KeyMod.WinCtrl | KeyCode.Digit2]
			},
			primary: KeyMod.CtrlCmd | KeyCode.Digit2
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.rename',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyM
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.commentLine',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.showAllSymbols',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				secondary: [KeyMod.WinCtrl | KeyCode.Period]
			},
			primary: KeyMod.CtrlCmd | KeyCode.Period
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.openGlobalKeybindings',
			weight: KeybindingWeight.BuiltinExtension,
			primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyK
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'quarto.insertCodeCell',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'quarto')),
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'quarto.runCurrent',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'quarto'),
				ContextKeyExpr.not('findInputFocussed'),
				ContextKeyExpr.not('replaceInputFocussed')
			),
			primary: KeyMod.CtrlCmd | KeyCode.Enter
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'quarto.runCurrentCell',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'quarto'),
				ContextKeyExpr.not('findInputFocussed'),
				ContextKeyExpr.not('replaceInputFocussed')
			),
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.reindentselectedlines',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KeyI
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.formatSelection',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'editor.action.deleteLines',
			weight: KeybindingWeight.BuiltinExtension,
			when: EditorContextKeys.editorTextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KeyD
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'r.insertSection',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'r')),
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'r.sourceCurrentFile',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'r')),
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'r.sourceCurrentFileWithEcho',
			weight: KeybindingWeight.BuiltinExtension,
			when: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				ContextKeyExpr.equals(EditorContextKeys.languageId.key, 'r')),
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.previousEditorInGroup',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow,
				secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.LeftArrow]
			},
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.nextEditorInGroup',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow,
				secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.RightArrow]
			},
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.view.scm',
			weight: KeybindingWeight.BuiltinExtension,
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyM,
				secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyM]
			},
			primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyM
		}));

		this._registrations.add(KeybindingsRegistry.registerKeybindingRule({
			id: 'workbench.action.setWorkingDirectory',
			weight: KeybindingWeight.BuiltinExtension,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH
		}));
	}
}

registerWorkbenchContribution2(ErdosKeybindingsContribution.ID, ErdosKeybindingsContribution, WorkbenchPhase.BlockRestore);
