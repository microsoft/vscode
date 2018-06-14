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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

registerEditorContribution(EditorBreadcrumbs);


const BreadcrumbCommandCtor = EditorCommand.bindToContribution<EditorBreadcrumbs>(EditorBreadcrumbs.get);

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.focus',
	precondition: undefined,
	handler: x => x.focus(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: EditorContextKeys.focus,
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT
	}
}));

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.focusNext',
	precondition: undefined,
	handler: x => x.focusNext(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, EditorBreadcrumbs.CK_Focused),
		primary: KeyCode.RightArrow
	}
}));

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.focusPrev',
	precondition: undefined,
	handler: x => x.focusPrev(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, EditorBreadcrumbs.CK_Focused),
		primary: KeyCode.LeftArrow
	}
}));

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.select',
	precondition: undefined,
	handler: x => x.select(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, EditorBreadcrumbs.CK_Focused),
		primary: KeyCode.Enter,
		secondary: [KeyCode.UpArrow, KeyCode.Space]
	}
}));

registerEditorCommand(new BreadcrumbCommandCtor({
	id: 'breadcrumbs.focusEditor',
	precondition: undefined,
	handler: x => x.editor.focus(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
		kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, EditorBreadcrumbs.CK_Focused),
		primary: KeyCode.Escape
	}
}));
