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
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { diffInserted, diffRemoved, editorHoverHighlight, editorWidgetBackground, editorWidgetBorder, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { Extensions as ExtensionsMigration, IConfigurationMigrationRegistry } from 'vs/workbench/common/configuration';

export interface IInlineChatSlashCommand {
	command: string;
	detail?: string;
	refer?: boolean;
}

export interface IInlineChatSession {
	id: number;
	placeholder?: string;
	message?: string;
	slashCommands?: IInlineChatSlashCommand[];
	wholeRange?: IRange;
	dispose?(): void;
}

export interface IInlineChatRequest {
	prompt: string;
	selection: ISelection;
	wholeRange: IRange;
	attempt: number;
}

export type IInlineChatResponse = IInlineChatEditResponse | IInlineChatBulkEditResponse | IInlineChatMessageResponse;

export const enum InlineChatResponseType {
	EditorEdit = 'editorEdit',
	BulkEdit = 'bulkEdit',
	Message = 'message'
}

export interface IInlineChatEditResponse {
	id: number;
	type: InlineChatResponseType.EditorEdit;
	edits: TextEdit[];
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineChatBulkEditResponse {
	id: number;
	type: InlineChatResponseType.BulkEdit;
	edits: WorkspaceEdit;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineChatMessageResponse {
	id: number;
	type: InlineChatResponseType.Message;
	message: IMarkdownString;
	placeholder?: string;
	wholeRange?: IRange;
}

export const enum InlineChatResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2
}

export interface IInlineChatSessionProvider {

	debugName: string;

	prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): ProviderResult<IInlineChatSession>;

	provideResponse(item: IInlineChatSession, request: IInlineChatRequest, token: CancellationToken): ProviderResult<IInlineChatResponse>;

	handleInlineChatResponseFeedback?(session: IInlineChatSession, response: IInlineChatResponse, kind: InlineChatResponseFeedbackKind): void;
}

export const IInlineChatService = createDecorator<IInlineChatService>('IInlineChatService');

export interface IInlineChatService {
	_serviceBrand: undefined;

	addProvider(provider: IInlineChatSessionProvider): IDisposable;
	getAllProvider(): Iterable<IInlineChatSessionProvider>;
}

export const INLINE_CHAT_ID = 'interactiveEditor';
export const INTERACTIVE_EDITOR_ACCESSIBILITY_HELP_ID = 'interactiveEditorAccessiblityHelp';

export const CTX_INLINE_CHAT_HAS_PROVIDER = new RawContextKey<boolean>('inlineChatHasProvider', false, localize('inlineChatHasProvider', "Whether a provider for interactive editors exists"));
export const CTX_INLINE_CHAT_VISIBLE = new RawContextKey<boolean>('inlineChatVisible', false, localize('inlineChatVisible', "Whether the interactive editor input is visible"));
export const CTX_INLINE_CHAT_FOCUSED = new RawContextKey<boolean>('inlineChatFocused', false, localize('inlineChatFocused', "Whether the interactive editor input is focused"));
export const CTX_INLINE_CHAT_EMPTY = new RawContextKey<boolean>('inlineChatEmpty', false, localize('inlineChatEmpty', "Whether the interactive editor input is empty"));
export const CTX_INLINE_CHAT_INNER_CURSOR_FIRST = new RawContextKey<boolean>('inlineChatInnerCursorFirst', false, localize('inlineChatInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_LAST = new RawContextKey<boolean>('inlineChatInnerCursorLast', false, localize('inlineChatInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INLINE_CHAT_MESSAGE_CROP_STATE = new RawContextKey<'cropped' | 'not_cropped' | 'expanded'>('inlineChatMarkdownMessageCropState', 'not_cropped', localize('inlineChatMarkdownMessageCropState', "Whether the interactive editor message is cropped, not cropped or expanded"));
export const CTX_INLINE_CHAT_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('inlineChatOuterCursorPosition', '', localize('inlineChatOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('inlineChatHasActiveRequest', false, localize('inlineChatHasActiveRequest', "Whether interactive editor has an active request"));
export const CTX_INLINE_CHAT_HAS_STASHED_SESSION = new RawContextKey<boolean>('inlineChatHasStashedSession', false, localize('inlineChatHasStashedSession', "Whether interactive editor has kept a session for quick restore"));
export const CTX_INLINE_CHAT_SHOWING_DIFF = new RawContextKey<boolean>('inlineChatDiff', false, localize('inlineChatDiff', "Whether interactive editor show diffs for changes"));
export const CTX_INLINE_CHAT_LAST_RESPONSE_TYPE = new RawContextKey<InlineChatResponseType | undefined>('inlineChatLastResponseType', undefined, localize('inlineChatResponseType', "What type was the last response of the current interactive editor session"));
export const CTX_INLINE_CHAT_DID_EDIT = new RawContextKey<boolean>('inlineChatDidEdit', false, localize('inlineChatDidEdit', "Whether interactive editor did change any code"));
export const CTX_INLINE_CHAT_LAST_FEEDBACK = new RawContextKey<'unhelpful' | 'helpful' | ''>('inlineChatLastFeedbackKind', '', localize('inlineChatLastFeedbackKind', "The last kind of feedback that was provided"));
export const CTX_INLINE_CHAT_DOCUMENT_CHANGED = new RawContextKey<boolean>('inlineChatDocumentChanged', false, localize('inlineChatDocumentChanged', "Whether the document has changed concurrently"));
export const CTX_INLINE_CHAT_EDIT_MODE = new RawContextKey<EditMode>('config.inlineChat.editMode', EditMode.Live);

// --- (select) action identifier

export const ACTION_ACCEPT_CHANGES = 'interactive.acceptChanges';
export const ACTION_REGENERATE_RESPONSE = 'inlineChat.regenerate';

// --- menus

export const MENU_INLINE_CHAT_WIDGET = MenuId.for('inlineChatWidget');
export const MENU_INLINE_CHAT_WIDGET_MARKDOWN_MESSAGE = MenuId.for('inlineChatWidget.markdownMessage');
export const MENU_INLINE_CHAT_WIDGET_STATUS = MenuId.for('inlineChatWidget.status');
export const MENU_INLINE_CHAT_WIDGET_FEEDBACK = MenuId.for('inlineChatWidget.feedback');
export const MENU_INLINE_CHAT_WIDGET_DISCARD = MenuId.for('inlineChatWidget.undo');

// --- colors


export const inlineChatBackground = registerColor('inlineChat.background', { dark: editorWidgetBackground, light: editorWidgetBackground, hcDark: editorWidgetBackground, hcLight: editorWidgetBackground }, localize('inlineChat.background', "Background color of the interactive editor widget"));
export const inlineChatBorder = registerColor('inlineChat.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('inlineChat.border', "Border color of the interactive editor widget"));
export const inlineChatShadow = registerColor('inlineChat.shadow', { dark: widgetShadow, light: widgetShadow, hcDark: widgetShadow, hcLight: widgetShadow }, localize('inlineChat.shadow', "Shadow color of the interactive editor widget"));
export const inlineChatRegionHighlight = registerColor('inlineChat.regionHighlight', { dark: editorHoverHighlight, light: editorHoverHighlight, hcDark: editorHoverHighlight, hcLight: editorHoverHighlight }, localize('inlineChat.regionHighlight', "Background highlighting of the current interactive region. Must be transparent."), true);
export const inlineChatInputBorder = registerColor('inlineChatInput.border', { dark: editorWidgetBorder, light: editorWidgetBorder, hcDark: editorWidgetBorder, hcLight: editorWidgetBorder }, localize('inlineChatInput.border', "Border color of the interactive editor input"));
export const inlineChatInputFocusBorder = registerColor('inlineChatInput.focusBorder', { dark: focusBorder, light: focusBorder, hcDark: focusBorder, hcLight: focusBorder }, localize('inlineChatInput.focusBorder', "Border color of the interactive editor input when focused"));
export const inlineChatInputPlaceholderForeground = registerColor('inlineChatInput.placeholderForeground', { dark: inputPlaceholderForeground, light: inputPlaceholderForeground, hcDark: inputPlaceholderForeground, hcLight: inputPlaceholderForeground }, localize('inlineChatInput.placeholderForeground', "Foreground color of the interactive editor input placeholder"));
export const inlineChatInputBackground = registerColor('inlineChatInput.background', { dark: inputBackground, light: inputBackground, hcDark: inputBackground, hcLight: inputBackground }, localize('inlineChatInput.background', "Background color of the interactive editor input"));

export const inlineChatDiffInserted = registerColor('inlineChatDiff.inserted', { dark: transparent(diffInserted, .5), light: transparent(diffInserted, .5), hcDark: transparent(diffInserted, .5), hcLight: transparent(diffInserted, .5) }, localize('inlineChatDiff.inserted', "Background color of inserted text in the interactive editor input"));
export const inlineChatDiffRemoved = registerColor('inlineChatrDiff.removed', { dark: transparent(diffRemoved, .5), light: transparent(diffRemoved, .5), hcDark: transparent(diffRemoved, .5), hcLight: transparent(diffRemoved, .5) }, localize('inlineChatDiff.removed', "Background color of removed text in the interactive editor input"));

// settings

export const enum EditMode {
	Live = 'live',
	LivePreview = 'livePreview',
	Preview = 'preview'
}

Registry.as<IConfigurationMigrationRegistry>(ExtensionsMigration.ConfigurationMigration).registerConfigurationMigrations(
	[{
		key: 'interactiveEditor.editMode', migrateFn: (value: any) => {
			return [['inlineChat.mode', { value: value }]];
		}
	}]
);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		'inlineChat.mode': {
			description: localize('mode', "Configure if changes crafted in the interactive editor are applied directly to the document or are previewed first."),
			default: EditMode.LivePreview,
			type: 'string',
			enum: [EditMode.LivePreview, EditMode.Preview, EditMode.Live],
			markdownEnumDescriptions: [
				localize('mode.livePreview', "Changes are applied directly to the document and are highlighted visually via inline or side-by-side diffs. Ending a session will keep the changes."),
				localize('mode.preview', "Changes are previewed only and need to be accepted via the apply button. Ending a session will discard the changes."),
				localize('mode.live', "Changes are applied directly to the document but can be highlighted via inline diffs. Ending a session will keep the changes."),
			]
		}
	}
});
