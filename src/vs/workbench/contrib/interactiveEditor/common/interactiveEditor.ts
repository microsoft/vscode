/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRange } from 'vs/editor/common/core/range';
import { ISelection } from 'vs/editor/common/core/selection';
import { ProviderResult, TextEdit, WorkspaceEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { diffInserted, diffRemoved, editorHoverHighlight, editorWidgetBorder, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from 'vs/platform/theme/common/colorRegistry';

export interface IInteractiveEditorSlashCommand {
	command: string;
	detail?: string;
	refer?: boolean;
}

export interface IInteractiveEditorSession {
	id: number;
	placeholder?: string;
	message?: string;
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

export const enum InteractiveEditorResponseType {
	EditorEdit = 'editorEdit',
	BulkEdit = 'bulkEdit',
	Message = 'message'
}

export interface IInteractiveEditorEditResponse {
	id: number;
	type: InteractiveEditorResponseType.EditorEdit;
	edits: TextEdit[];
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInteractiveEditorBulkEditResponse {
	id: number;
	type: InteractiveEditorResponseType.BulkEdit;
	edits: WorkspaceEdit;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInteractiveEditorMessageResponse {
	id: number;
	type: InteractiveEditorResponseType.Message;
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

export const INTERACTIVE_EDITOR_ID = 'interactiveEditor';


export const CTX_INTERACTIVE_EDITOR_HAS_PROVIDER = new RawContextKey<boolean>('interactiveEditorHasProvider', false, localize('interactiveEditorHasProvider', "Whether a provider for interactive editors exists"));
export const CTX_INTERACTIVE_EDITOR_VISIBLE = new RawContextKey<boolean>('interactiveEditorVisible', false, localize('interactiveEditorVisible', "Whether the interactive editor input is visible"));
export const CTX_INTERACTIVE_EDITOR_FOCUSED = new RawContextKey<boolean>('interactiveEditorFocused', false, localize('interactiveEditorFocused', "Whether the interactive editor input is focused"));
export const CTX_INTERACTIVE_EDITOR_EMPTY = new RawContextKey<boolean>('interactiveEditorEmpty', false, localize('interactiveEditorEmpty', "Whether the interactive editor input is empty"));
export const CTX_INTERACTIVE_EDITOR_INNER_CURSOR_FIRST = new RawContextKey<boolean>('interactiveEditorInnerCursorFirst', false, localize('interactiveEditorInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INTERACTIVE_EDITOR_INNER_CURSOR_LAST = new RawContextKey<boolean>('interactiveEditorInnerCursorLast', false, localize('interactiveEditorInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INTERACTIVE_EDITOR_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('interactiveEditorOuterCursorPosition', '', localize('interactiveEditorOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INTERACTIVE_EDITOR_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('interactiveEditorHasActiveRequest', false, localize('interactiveEditorHasActiveRequest', "Whether interactive editor has an active request"));
export const CTX_INTERACTIVE_EDITOR_INLNE_DIFF = new RawContextKey<boolean>('interactiveEditorInlineDiff', false, localize('interactiveEditorInlineDiff', "Whether interactive editor show inline diffs for changes"));
export const CTX_INTERACTIVE_EDITOR_LAST_RESPONSE_TYPE = new RawContextKey<InteractiveEditorResponseType | undefined>('interactiveEditorLastResponseType', undefined, localize('interactiveEditorResponseType', "What type was the last response of the current interactive editor session"));
export const CTX_INTERACTIVE_EDITOR_LAST_EDIT_TYPE = new RawContextKey<'simple' | ''>('interactiveEditorLastEditKind', '', localize('interactiveEditorLastEditKind', "The last kind of edit that was performed"));
export const CTX_INTERACTIVE_EDITOR_LAST_FEEDBACK = new RawContextKey<'unhelpful' | 'helpful' | ''>('interactiveEditorLastFeedbackKind', '', localize('interactiveEditorLastFeedbackKind', "The last kind of feedback that was provided"));
export const CTX_INTERACTIVE_EDITOR_EDIT_MODE = new RawContextKey<EditMode>('config.interactiveEditor.editMode', EditMode.Live);

// --- menus

export const MENU_INTERACTIVE_EDITOR_WIDGET = MenuId.for('interactiveEditorWidget');
export const MENU_INTERACTIVE_EDITOR_WIDGET_MARKDOWN_MESSAGE = MenuId.for('interactiveEditorWidget.markdownMessage');
export const MENU_INTERACTIVE_EDITOR_WIDGET_STATUS = MenuId.for('interactiveEditorWidget.status');
export const MENU_INTERACTIVE_EDITOR_WIDGET_UNDO = MenuId.for('interactiveEditorWidget.undo');
MenuRegistry.appendMenuItem(MENU_INTERACTIVE_EDITOR_WIDGET_STATUS, {
	submenu: MENU_INTERACTIVE_EDITOR_WIDGET_UNDO,
	title: localize('undo', "Undo..."),
	icon: Codicon.discard,
	group: '0_main',
	order: 2,
	when: CTX_INTERACTIVE_EDITOR_EDIT_MODE.isEqualTo('direct')
});

// --- colors

export const interactiveEditorBorder = registerColor('interactiveEditor.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('interactiveEditor.border', "Border color of the interactive editor widget"));
export const interactiveEditorShadow = registerColor('interactiveEditor.shadow', { dark: widgetShadow, light: widgetShadow, hcDark: widgetShadow, hcLight: widgetShadow }, localize('interactiveEditor.shadow', "Shadow color of the interactive editor widget"));
export const interactiveEditorRegionHighlight = registerColor('interactiveEditor.regionHighlight', { dark: editorHoverHighlight, light: editorHoverHighlight, hcDark: editorHoverHighlight, hcLight: editorHoverHighlight }, localize('interactiveEditor.regionHighlight', "Background highlighting of the current interactive region. Must be transparent."), true);
export const interactiveEditorInputBorder = registerColor('interactiveEditorInput.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('interactiveEditorInput.border', "Border color of the interactive editor input"));
export const interactiveEditorInputFocusBorder = registerColor('interactiveEditorInput.focusBorder', { dark: focusBorder, light: focusBorder, hcDark: focusBorder, hcLight: focusBorder }, localize('interactiveEditorInput.focusBorder', "Border color of the interactive editor input when focused"));
export const interactiveEditorInputPlaceholderForeground = registerColor('interactiveEditorInput.placeholderForeground', { dark: inputPlaceholderForeground, light: inputPlaceholderForeground, hcDark: inputPlaceholderForeground, hcLight: inputPlaceholderForeground }, localize('interactiveEditorInput.placeholderForeground', "Foreground color of the interactive editor input placeholder"));
export const interactiveEditorInputBackground = registerColor('interactiveEditorInput.background', { dark: inputBackground, light: inputBackground, hcDark: inputBackground, hcLight: inputBackground }, localize('interactiveEditorInput.background', "Background color of the interactive editor input"));

export const interactiveEditorDiffInserted = registerColor('interactiveEditorDiff.inserted', { dark: transparent(diffInserted, .5), light: transparent(diffInserted, .5), hcDark: transparent(diffInserted, .5), hcLight: transparent(diffInserted, .5) }, localize('interactiveEditorDiff.inserted', "Background color of inserted text in the interactive editor input"));
export const interactiveEditorDiffRemoved = registerColor('interactiveEditorDiff.removed', { dark: transparent(diffRemoved, .5), light: transparent(diffRemoved, .5), hcDark: transparent(diffRemoved, .5), hcLight: transparent(diffRemoved, .5) }, localize('interactiveEditorDiff.removed', "Background color of removed text in the interactive editor input"));

// settings

export const enum EditMode {
	Live = 'live',
	LivePreview = 'livePreview',
	Preview = 'preview'
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		'interactiveEditor.editMode': {
			description: localize('editMode', "Configure if changes crafted in the interactive editor are applied directly or previewed first"),
			default: EditMode.Live,
			type: 'string',
			enum: [EditMode.Live, EditMode.LivePreview, EditMode.Preview]
		}
	}
});
