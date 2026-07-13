/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ActiveCustomEditorDiffCanToggleLayoutContext } from '../../../common/contextkeys.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, isDiffEditorInput, SideBySideEditor } from '../../../common/editor.js';
import { TextDiffEditor } from './textDiffEditor.js';

export const IDiffEditorCommandsService = createDecorator<IDiffEditorCommandsService>('diffEditorCommandsService');

/**
 * Backs the diff-editor commands (see {@link registerDiffEditorCommands}). The Agents window
 * overrides this to also drive its multi-diff Changes editor. Only the actions needed there
 * live here today; the remaining diff-editor command handlers are still inline pending a move.
 */
export interface IDiffEditorCommandsService {
	readonly _serviceBrand: undefined;

	/** Toggles inline vs. side-by-side rendering for the active diff editor. */
	toggleRenderSideBySide(args: unknown[]): Promise<void>;
}

export class DiffEditorCommandsService implements IDiffEditorCommandsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService protected readonly editorService: IEditorService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	async toggleRenderSideBySide(args: unknown[]): Promise<void> {
		const modifiedResource = getActiveDiffModifiedResource(this.editorService, this.contextKeyService, args);
		if (!modifiedResource) {
			return;
		}

		const key = 'diffEditor.renderSideBySide';
		const value = this.textResourceConfigurationService.getValue(modifiedResource, key);
		await this.textResourceConfigurationService.updateValue(modifiedResource, key, !value);
	}
}

export function getActiveTextDiffEditor(editorService: IEditorService, args: unknown[]): TextDiffEditor | undefined {
	const resource = args.length > 0 && args[0] instanceof URI ? args[0] : undefined;

	for (const editor of [editorService.activeEditorPane, ...editorService.visibleEditorPanes]) {
		if (editor instanceof TextDiffEditor && (!resource || editor.input instanceof DiffEditorInput && isEqual(editor.input.primary.resource, resource))) {
			return editor;
		}
	}

	return undefined;
}

export function getActiveDiffModifiedResource(editorService: IEditorService, contextKeyService: IContextKeyService, args: unknown[]): URI | undefined {
	const activeTextDiffEditor = getActiveTextDiffEditor(editorService, args);
	const model = activeTextDiffEditor?.getControl()?.getModifiedEditor()?.getModel();
	if (model) {
		return model.uri;
	}

	const resource = args.length > 0 && args[0] instanceof URI ? args[0] : undefined;
	if (ActiveCustomEditorDiffCanToggleLayoutContext.getValue(contextKeyService)) {
		const activeCustomDiffModifiedResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
		if (activeCustomDiffModifiedResource && (!resource || isEqual(activeCustomDiffModifiedResource, resource))) {
			return activeCustomDiffModifiedResource;
		}
	}

	for (const editor of [editorService.activeEditor, ...editorService.visibleEditors]) {
		if (isDiffEditorInput(editor) && editor.modified.resource && (!resource || isEqual(editor.modified.resource, resource))) {
			return editor.modified.resource;
		}
	}

	return undefined;
}
