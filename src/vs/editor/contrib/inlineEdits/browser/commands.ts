/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { transaction } from 'vs/base/common/observable';
import { asyncTransaction } from 'vs/base/common/observableInternal/base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { inlineEditAcceptId, inlineEditVisible, showNextInlineEditActionId, showPreviousInlineEditActionId } from 'vs/editor/contrib/inlineEdits/browser/consts';
import { InlineEditsController } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsController';
import * as nls from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';


function labelAndAlias(str: nls.ILocalizedString): { label: string, alias: string } {
	return {
		label: str.value,
		alias: str.original,
	};
}

export class ShowNextInlineEditAction extends EditorAction {
	public static ID = showNextInlineEditActionId;
	constructor() {
		super({
			id: ShowNextInlineEditAction.ID,
			...labelAndAlias(nls.localize2('action.inlineEdits.showNext', "Show Next Inline Edit")),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, inlineEditVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketRight,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		controller?.model.get()?.next();
	}
}

export class ShowPreviousInlineEditAction extends EditorAction {
	public static ID = showPreviousInlineEditActionId;
	constructor() {
		super({
			id: ShowPreviousInlineEditAction.ID,
			...labelAndAlias(nls.localize2('action.inlineEdits.showPrevious', "Show Previous Inline Edit")),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, inlineEditVisible),
			kbOpts: {
				weight: 100,
				primary: KeyMod.Alt | KeyCode.BracketLeft,
			},
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		controller?.model.get()?.previous();
	}
}

export class TriggerInlineEditAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdits.trigger',
			...labelAndAlias(nls.localize2('action.inlineEdits.trigger', "Trigger Inline Edit")),
			precondition: EditorContextKeys.writable
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		await asyncTransaction(async tx => {
			/** @description triggerExplicitly from command */
			await controller?.model.get()?.triggerExplicitly(tx);
		});
	}
}

export class AcceptInlineEdit extends EditorAction {
	constructor() {
		super({
			id: inlineEditAcceptId,
			...labelAndAlias(nls.localize2('action.inlineEdits.accept', "Accept Inline Edit")),
			precondition: inlineEditVisible,
			menuOpts: {
				menuId: MenuId.InlineEditsActions,
				title: nls.localize('inlineEditsActions', "Accept Inline Edit"),
				group: 'primary',
				order: 1,
				icon: Codicon.check,
			},
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.Space,
				weight: 20000,
				kbExpr: inlineEditVisible,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		if (editor instanceof EmbeddedCodeEditorWidget) {
			editor = editor.getParentEditor();
		}
		const controller = InlineEditsController.get(editor);
		if (controller) {
			controller.model.get()?.accept(controller.editor);
			controller.editor.focus();
		}
	}
}

/*
TODO@hediet
export class PinInlineEdit extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.inlineEdits.pin',
			...labelAndAlias(nls.localize2('action.inlineEdits.pin', "Pin Inline Edit")),
			precondition: undefined,
			kbOpts: {
				primary: KeyMod.Shift | KeyCode.Space,
				weight: 20000,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		if (controller) {
			controller.model.get()?.togglePin();
		}
	}
}

MenuRegistry.appendMenuItem(MenuId.InlineEditsActions, {
	command: {
		id: 'editor.action.inlineEdits.pin',
		title: nls.localize('Pin', "Pin"),
		icon: Codicon.pin,
	},
	group: 'primary',
	order: 1,
	when: isPinnedContextKey.negate(),
});

MenuRegistry.appendMenuItem(MenuId.InlineEditsActions, {
	command: {
		id: 'editor.action.inlineEdits.unpin',
		title: nls.localize('Unpin', "Unpin"),
		icon: Codicon.pinned,
	},
	group: 'primary',
	order: 1,
	when: isPinnedContextKey,
});*/

export class HideInlineEdit extends EditorAction {
	public static ID = 'editor.action.inlineEdits.hide';

	constructor() {
		super({
			id: HideInlineEdit.ID,
			...labelAndAlias(nls.localize2('action.inlineEdits.hide', "Hide Inline Edit")),
			precondition: inlineEditVisible,
			kbOpts: {
				weight: 100,
				primary: KeyCode.Escape,
			}
		});
	}

	public async run(accessor: ServicesAccessor | undefined, editor: ICodeEditor): Promise<void> {
		const controller = InlineEditsController.get(editor);
		transaction(tx => {
			controller?.model.get()?.stop(tx);
		});
	}
}
