/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchicalKind } from '../../../../base/common/hierarchicalKind';
import { IJSONSchema, SchemaToType } from '../../../../base/common/jsonSchema';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes';
import { ICodeEditor } from '../../../browser/editorBrowser';
import { EditorAction, EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions';
import { EditorContextKeys } from '../../../common/editorContextKeys';
import { registerEditorFeature } from '../../../common/editorFeatures';
import { CopyPasteController, changePasteTypeCommandId, pasteWidgetVisibleCtx } from './copyPasteController';
import { DefaultPasteProvidersFeature, DefaultTextPasteOrDropEditProvider } from './defaultProviders';
import * as nls from '../../../../nls';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';

registerEditorContribution(CopyPasteController.ID, CopyPasteController, EditorContributionInstantiation.Eager); // eager because it listens to events on the container dom node of the editor
registerEditorFeature(DefaultPasteProvidersFeature);

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: changePasteTypeCommandId,
			precondition: pasteWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor) {
		return CopyPasteController.get(editor)?.changePasteType();
	}
});

registerEditorCommand(new class extends EditorCommand {
	constructor() {
		super({
			id: 'editor.hidePasteWidget',
			precondition: pasteWidgetVisibleCtx,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
			}
		});
	}

	public override runEditorCommand(_accessor: ServicesAccessor | null, editor: ICodeEditor) {
		CopyPasteController.get(editor)?.clearWidgets();
	}
});


registerEditorAction(class PasteAsAction extends EditorAction {
	private static readonly argsSchema = {
		type: 'object',
		properties: {
			kind: {
				type: 'string',
				description: nls.localize('pasteAs.kind', "The kind of the paste edit to try applying. If not provided or there are multiple edits for this kind, the editor will show a picker."),
			}
		},
	} as const satisfies IJSONSchema;

	constructor() {
		super({
			id: 'editor.action.pasteAs',
			label: nls.localize('pasteAs', "Paste As..."),
			alias: 'Paste As...',
			precondition: EditorContextKeys.writable,
			metadata: {
				description: 'Paste as',
				args: [{
					name: 'args',
					schema: PasteAsAction.argsSchema
				}]
			}
		});
	}

	public override run(_accessor: ServicesAccessor, editor: ICodeEditor, args?: SchemaToType<typeof PasteAsAction.argsSchema>) {
		let kind = typeof args?.kind === 'string' ? args.kind : undefined;
		if (!kind && args) {
			// Support old id property
			// TODO: remove this in the future
			kind = typeof (args as any).id === 'string' ? (args as any).id : undefined;
		}
		return CopyPasteController.get(editor)?.pasteAs(kind ? new HierarchicalKind(kind) : undefined);
	}
});

registerEditorAction(class extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.pasteAsText',
			label: nls.localize('pasteAsText', "Paste as Text"),
			alias: 'Paste as Text',
			precondition: EditorContextKeys.writable,
		});
	}

	public override run(_accessor: ServicesAccessor, editor: ICodeEditor) {
		return CopyPasteController.get(editor)?.pasteAs({ providerId: DefaultTextPasteOrDropEditProvider.id });
	}
});
