/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { ProviderResult, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { editorWidgetBorder, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, widgetShadow } from 'vs/platform/theme/common/colorRegistry';

export interface IInteractiveEditorSlashCommand {
	command: string;
	detail?: string;
	refer?: boolean;
}

export interface IInteractiveEditorSession {
	id: number;
	placeholder?: string;
	slashCommands?: IInteractiveEditorSlashCommand[];
	wholeRange?: IRange;
	dispose?(): void;
}

export interface IInteractiveEditorRequest {
	prompt: string;
	selection: ISelection;
	wholeRange: IRange;
}

export type IInteractiveEditorResponse = IInteractiveEditorEditResponse | IInteractiveEditorBulkEditResponse | IInteractiveEditorMessageResponse;

export interface IInteractiveEditorEditResponse {
	id: number;
	type: 'editorEdit';
	edits: TextEdit[];
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInteractiveEditorBulkEditResponse {
	id: number;
	type: 'bulkEdit';
	edits: WorkspaceEdit;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInteractiveEditorMessageResponse {
	id: number;
	type: 'message';
	message: IMarkdownString;
	placeholder?: string;
	wholeRange?: IRange;
}

export const enum InteractiveEditorResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2
}

export interface IInteractiveEditorSessionProvider {

	debugName: string;

	prepareInteractiveEditorSession(model: ITextModel, range: ISelection, token: CancellationToken): ProviderResult<IInteractiveEditorSession>;

	provideResponse(item: IInteractiveEditorSession, request: IInteractiveEditorRequest, token: CancellationToken): ProviderResult<IInteractiveEditorResponse>;

	handleInteractiveEditorResponseFeedback?(session: IInteractiveEditorSession, response: IInteractiveEditorResponse, kind: InteractiveEditorResponseFeedbackKind): void;
}

export const IInteractiveEditorService = createDecorator<IInteractiveEditorService>('IInteractiveEditorService');

export interface IInteractiveEditorService {
	_serviceBrand: undefined;

	addProvider(provider: IInteractiveEditorSessionProvider): IDisposable;
	getAllProvider(): Iterable<IInteractiveEditorSessionProvider>;
}

export const MENU_INTERACTIVE_EDITOR_WIDGET = MenuId.for('interactiveEditorWidget');

export const CTX_INTERACTIVE_EDITOR_HAS_PROVIDER = new RawContextKey<boolean>('interactiveEditorHasProvider', false, localize('interactiveEditorHasProvider', "Whether a provider for interactive editors exists"));
export const CTX_INTERACTIVE_EDITOR_VISIBLE = new RawContextKey<boolean>('interactiveEditorVisible', false, localize('interactiveEditorVisible', "Whether the interactive editor input is visible"));
export const CTX_INTERACTIVE_EDITOR_FOCUSED = new RawContextKey<boolean>('interactiveEditorFocused', false, localize('interactiveEditorFocused', "Whether the interactive editor input is focused"));
export const CTX_INTERACTIVE_EDITOR_EMPTY = new RawContextKey<boolean>('interactiveEditorEmpty', false, localize('interactiveEditorEmpty', "Whether the interactive editor input is empty"));
export const CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST = new RawContextKey<boolean>('interactiveEditorInnerCursorFirst', false, localize('interactiveEditorInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST = new RawContextKey<boolean>('interactiveEditorInnerCursorLast', false, localize('interactiveEditorInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('interactiveEditorOuterCursorPosition', '', localize('interactiveEditorOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('interactiveEditorHasActiveRequest', false, localize('interactiveEditorHasActiveRequest', "Whether interactive editor has an active request"));

// colors

registerColor('interactiveEditor.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('interactiveEditor.border', "Border color of the interactive editor widget"));
registerColor('interactiveEditor.shadow', { dark: widgetShadow, light: widgetShadow, hcDark: widgetShadow, hcLight: widgetShadow }, localize('interactiveEditor.shadow', "Shadow color of the interactive editor widget"));
registerColor('interactiveEditorInput.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('interactiveEditorInput.border', "Border color of the interactive editor input"));
registerColor('interactiveEditorInput.focusBorder', { dark: focusBorder, light: focusBorder, hcDark: focusBorder, hcLight: focusBorder }, localize('interactiveEditorInput.focusBorder', "Border color of the interactive editor input when focused"));
registerColor('interactiveEditorInput.placeholderForeground', { dark: inputPlaceholderForeground, light: inputPlaceholderForeground, hcDark: inputPlaceholderForeground, hcLight: inputPlaceholderForeground }, localize('interactiveEditorInput.placeholderForeground', "Foreground color of the interactive editor input placeholder"));
registerColor('interactiveEditorInput.background', { dark: inputBackground, light: inputBackground, hcDark: inputBackground, hcLight: inputBackground }, localize('interactiveEditorInput.background', "Background color of the interactive editor input"));
