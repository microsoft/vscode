/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ActiveCustomEditorDiffCanToggleLayoutContext } from '../../../common/contextkeys.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor, isDiffEditorInput, IUntypedEditorInput, SideBySideEditor } from '../../../common/editor.js';
import { TextDiffEditor } from './textDiffEditor.js';

export const IDiffEditorCommandsService = createDecorator<IDiffEditorCommandsService>('diffEditorCommandsService');

/** Which side of the active diff editor to focus. */
export const enum FocusTextDiffEditorMode {
	Original,
	Modified,
	Toggle
}

/**
 * Backs the diff-editor commands (see {@link registerDiffEditorCommands}). The Agents window
 * overrides this to also drive its multi-diff Changes editor.
 */
export interface IDiffEditorCommandsService {
	readonly _serviceBrand: undefined;

	/** Toggles inline vs. side-by-side rendering for the active diff editor. */
	toggleRenderSideBySide(args: unknown[]): Promise<void>;

	/** Opens the original or modified side of the active diff editor, whichever has focus, as its own editor. */
	openActiveDiffSide(): Promise<void>;

	/** Navigates to the next or previous change in the active diff editor. */
	navigateInDiffEditor(args: unknown[], next: boolean): void;

	/** Focuses the original, modified, or currently unfocused side of the active diff editor. */
	focusInDiffEditor(args: unknown[], mode: FocusTextDiffEditorMode): void;

	/** Toggles whether the active diff editor ignores trim whitespace. */
	toggleDiffIgnoreTrimWhitespace(args: unknown[]): Promise<void>;

	/** Swaps the original and modified sides of the active diff editor. */
	swapDiffSides(args: unknown[]): Promise<void>;
}

export class DiffEditorCommandsService implements IDiffEditorCommandsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService protected readonly editorService: IEditorService,
		@ITextResourceConfigurationService private readonly textResourceConfigurationService: ITextResourceConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) { }

	async toggleRenderSideBySide(args: unknown[]): Promise<void> {
		const modifiedResource = this.getActiveDiffModifiedResource(args);
		if (!modifiedResource) {
			return;
		}

		const key = 'diffEditor.renderSideBySide';
		const value = this.textResourceConfigurationService.getValue(modifiedResource, key);
		await this.textResourceConfigurationService.updateValue(modifiedResource, key, !value);
	}

	async openActiveDiffSide(): Promise<void> {
		const activeEditor = this.editorService.activeEditor;
		const activeTextEditorControl = this.editorService.activeTextEditorControl;
		if (!isDiffEditor(activeTextEditorControl) || !(activeEditor instanceof DiffEditorInput)) {
			return;
		}

		let editor: EditorInput | undefined;
		const originalEditor = activeTextEditorControl.getOriginalEditor();
		if (originalEditor.hasTextFocus()) {
			editor = activeEditor.original;
		} else {
			editor = activeEditor.modified;
		}

		await this.editorService.openEditor(editor);
	}

	navigateInDiffEditor(args: unknown[], next: boolean): void {
		const activeTextDiffEditor = this.getActiveTextDiffEditor(args);

		if (activeTextDiffEditor) {
			activeTextDiffEditor.getControl()?.goToDiff(next ? 'next' : 'previous');
		}
	}

	focusInDiffEditor(args: unknown[], mode: FocusTextDiffEditorMode): void {
		const activeTextDiffEditor = this.getActiveTextDiffEditor(args);

		if (activeTextDiffEditor) {
			switch (mode) {
				case FocusTextDiffEditorMode.Original:
					activeTextDiffEditor.getControl()?.getOriginalEditor().focus();
					break;
				case FocusTextDiffEditorMode.Modified:
					activeTextDiffEditor.getControl()?.getModifiedEditor().focus();
					break;
				case FocusTextDiffEditorMode.Toggle:
					if (activeTextDiffEditor.getControl()?.getModifiedEditor().hasWidgetFocus()) {
						return this.focusInDiffEditor(args, FocusTextDiffEditorMode.Original);
					} else {
						return this.focusInDiffEditor(args, FocusTextDiffEditorMode.Modified);
					}
			}
		}
	}

	async toggleDiffIgnoreTrimWhitespace(args: unknown[]): Promise<void> {
		const activeTextDiffEditor = this.getActiveTextDiffEditor(args);

		const model = activeTextDiffEditor?.getControl()?.getModifiedEditor()?.getModel();
		if (!model) {
			return;
		}

		const key = 'diffEditor.ignoreTrimWhitespace';
		const value = this.textResourceConfigurationService.getValue(model.uri, key);
		await this.textResourceConfigurationService.updateValue(model.uri, key, !value);
	}

	async swapDiffSides(args: unknown[]): Promise<void> {
		const diffEditor = this.getActiveTextDiffEditor(args);
		const activeGroup = diffEditor?.group;
		const diffInput = diffEditor?.input;
		if (!diffEditor || typeof activeGroup === 'undefined' || !(diffInput instanceof DiffEditorInput) || !diffInput.modified.resource) {
			return;
		}

		const untypedDiffInput = diffInput.toUntyped({ preserveViewState: activeGroup.id, preserveResource: true });
		if (!untypedDiffInput) {
			return;
		}

		// Since we are about to replace the diff editor, make
		// sure to first open the modified side if it is not
		// yet opened. This ensures that the swapping is not
		// bringing up a confirmation dialog to save.
		if (diffInput.modified.isModified() && this.editorService.findEditors({ resource: diffInput.modified.resource, typeId: diffInput.modified.typeId, editorId: diffInput.modified.editorId }).length === 0) {
			const editorToOpen: IUntypedEditorInput = { ...untypedDiffInput.modified };
			if (!editorToOpen.options) {
				editorToOpen.options = {};
			}
			editorToOpen.options.pinned = true;
			editorToOpen.options.inactive = true;

			await this.editorService.openEditor(editorToOpen, activeGroup);
		}

		// Replace the input with the swapped variant
		await this.editorService.replaceEditors([
			{
				editor: diffInput,
				replacement: {
					...untypedDiffInput,
					original: untypedDiffInput.modified,
					modified: untypedDiffInput.original,
					options: {
						...untypedDiffInput.options,
						pinned: true
					}
				}
			}
		], activeGroup);
	}

	private getActiveTextDiffEditor(args: unknown[]): TextDiffEditor | undefined {
		const resource = args.length > 0 && args[0] instanceof URI ? args[0] : undefined;

		for (const editor of [this.editorService.activeEditorPane, ...this.editorService.visibleEditorPanes]) {
			if (editor instanceof TextDiffEditor && (!resource || editor.input instanceof DiffEditorInput && isEqual(editor.input.primary.resource, resource))) {
				return editor;
			}
		}

		return undefined;
	}

	private getActiveDiffModifiedResource(args: unknown[]): URI | undefined {
		const activeTextDiffEditor = this.getActiveTextDiffEditor(args);
		const model = activeTextDiffEditor?.getControl()?.getModifiedEditor()?.getModel();
		if (model) {
			return model.uri;
		}

		const resource = args.length > 0 && args[0] instanceof URI ? args[0] : undefined;
		if (ActiveCustomEditorDiffCanToggleLayoutContext.getValue(this.contextKeyService)) {
			const activeCustomDiffModifiedResource = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
			if (activeCustomDiffModifiedResource && (!resource || isEqual(activeCustomDiffModifiedResource, resource))) {
				return activeCustomDiffModifiedResource;
			}
		}

		for (const editor of [this.editorService.activeEditor, ...this.editorService.visibleEditors]) {
			if (isDiffEditorInput(editor) && editor.modified.resource && (!resource || isEqual(editor.modified.resource, resource))) {
				return editor.modified.resource;
			}
		}

		return undefined;
	}
}
