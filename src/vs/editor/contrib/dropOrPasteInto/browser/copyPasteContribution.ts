/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IJSONSchema, SchemaToType } from '../../../../base/common/jsonSchema.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as nls from '../../../../nls.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, EditorContributionInstantiation, ServicesAccessor, registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { CopyPasteController, PastePreference, changePasteTypeCommandId, pasteWidgetVisibleCtx } from './copyPasteController.js';
import { DefaultPasteProvidersFeature, DefaultTextPasteOrDropEditProvider } from './defaultProviders.js';

export const pasteAsCommandId = 'editor.action.pasteAs';

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
		oneOf: [
			{
				type: 'object',
				required: ['kind'],
				properties: {
					kind: {
						type: 'string',
						description: nls.localize('pasteAs.kind', "The kind of the paste edit to try pasting with.\nIf there are multiple edits for this kind, the editor will show a picker. If there are no edits of this kind, the editor will show an error message."),
					}
				},
			},
			{
				type: 'object',
				required: ['preferences'],
				properties: {
					preferences: {
						type: 'array',
						description: nls.localize('pasteAs.preferences', "List of preferred paste edit kind to try applying.\nThe first edit matching the preferences will be applied."),
						items: { type: 'string' }
					}
				},
			}
		]
	} as const satisfies IJSONSchema;

	constructor() {
		super({
			id: pasteAsCommandId,
			label: nls.localize2('pasteAs', "Paste As..."),
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
		let preference: PastePreference | undefined;
		if (args) {
			if ('kind' in args) {
				preference = { only: new HierarchicalKind(args.kind) };
			} else if ('preferences' in args) {
				preference = { preferences: args.preferences.map(kind => new HierarchicalKind(kind)) };
			}
		}
		return CopyPasteController.get(editor)?.pasteAs(preference);
	}
});

registerEditorAction(class extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.pasteAsText',
			label: nls.localize2('pasteAsText', "Paste as Text"),
			precondition: EditorContextKeys.writable,
		});
	}

	public override run(_accessor: ServicesAccessor, editor: ICodeEditor) {
		return CopyPasteController.get(editor)?.pasteAs({ providerId: DefaultTextPasteOrDropEditProvider.id });
	}
});

export type PreferredPasteConfiguration = string;
