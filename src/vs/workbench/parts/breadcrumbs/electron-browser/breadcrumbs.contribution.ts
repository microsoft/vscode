/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { registerEditorContribution, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { EditorBreadcrumbs } from 'vs/workbench/parts/breadcrumbs/electron-browser/editorBreadcrumbs';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

registerEditorContribution(EditorBreadcrumbs);


const BreadcrumbCommandCtor = EditorCommand.bindToContribution<EditorBreadcrumbs>(EditorBreadcrumbs.get);

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.focus',
	precondition: undefined,
	handler: x => x.focus(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: EditorContextKeys.focus,
		primary: KeyMod.CtrlCmd | KeyCode.US_DOT
	}
}));
