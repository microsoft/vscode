/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
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
import { IProgress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { diffInserted, diffRemoved, editorHoverHighlight, editorWidgetBackground, editorWidgetBorder, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { Extensions as ExtensionsMigration, IConfigurationMigrationRegistry } from 'vs/workbench/common/configuration';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export interface IInlineChatSlashCommand {
	command: string;
	detail?: string;
	refer?: boolean;
	executeImmediately?: boolean;
}

export interface IInlineChatSession {
	id: number;
	placeholder?: string;
	input?: string;
	message?: string;
	slashCommands?: IInlineChatSlashCommand[];
	wholeRange?: IRange;
}

export interface IInlineChatRequest {
	prompt: string;
	selection: ISelection;
	wholeRange: IRange;
	attempt: number;
	requestId: string;
	live: boolean;
	previewDocument: URI;
	withIntentDetection: boolean;
}

export type IInlineChatResponse = IInlineChatEditResponse | IInlineChatBulkEditResponse;

export const enum InlineChatResponseType {
	EditorEdit = 'editorEdit',
	BulkEdit = 'bulkEdit'
}

export const enum InlineChatResponseTypes {
	Empty = 'empty',
	OnlyEdits = 'onlyEdits',
	OnlyMessages = 'onlyMessages',
	Mixed = 'mixed'
}

export interface IInlineChatEditResponse {
	id: number;
	type: InlineChatResponseType.EditorEdit;
	edits: TextEdit[];
	message?: IMarkdownString;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineChatBulkEditResponse {
	id: number;
	type: InlineChatResponseType.BulkEdit;
	edits: WorkspaceEdit;
	message?: IMarkdownString;
	placeholder?: string;
	wholeRange?: IRange;
}

export interface IInlineChatProgressItem {
	markdownFragment?: string;
	edits?: TextEdit[];
	editsShouldBeInstant?: boolean;
	message?: string;
	slashCommand?: string;
}

export const enum InlineChatResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2,
	Accepted = 3,
	Bug = 4
}

export interface IInlineChatReplyFollowup {
	kind: 'reply';
	message: string;
	title?: string;
	tooltip?: string;
}

export interface IInlineChatCommandFollowup {
	kind: 'command';
	commandId: string;
	args?: any[];
	title: string; // supports codicon strings
	when?: string;
}

export type IInlineChatFollowup = IInlineChatReplyFollowup | IInlineChatCommandFollowup;

export interface IInlineChatSessionProvider {

	extensionId: ExtensionIdentifier;
	label: string;
	supportIssueReporting?: boolean;

	prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): ProviderResult<IInlineChatSession>;

	provideResponse(item: IInlineChatSession, request: IInlineChatRequest, progress: IProgress<IInlineChatProgressItem>, token: CancellationToken): ProviderResult<IInlineChatResponse>;

	provideFollowups?(session: IInlineChatSession, response: IInlineChatResponse, token: CancellationToken): ProviderResult<IInlineChatFollowup[]>;

	handleInlineChatResponseFeedback?(session: IInlineChatSession, response: IInlineChatResponse, kind: InlineChatResponseFeedbackKind): void;
}

export const IInlineChatService = createDecorator<IInlineChatService>('IInlineChatService');

export interface InlineChatProviderChangeEvent {
	readonly added?: IInlineChatSessionProvider;
	readonly removed?: IInlineChatSessionProvider;
}

export interface IInlineChatService {
	_serviceBrand: undefined;

	onDidChangeProviders: Event<InlineChatProviderChangeEvent>;
	addProvider(provider: IInlineChatSessionProvider): IDisposable;
	getAllProvider(): Iterable<IInlineChatSessionProvider>;
}

export const INLINE_CHAT_ID = 'interactiveEditor';
export const INTERACTIVE_EDITOR_ACCESSIBILITY_HELP_ID = 'interactiveEditorAccessiblityHelp';

export const CTX_INLINE_CHAT_HAS_PROVIDER = new RawContextKey<boolean>('inlineChatHasProvider', false, localize('inlineChatHasProvider', "Whether a provider for interactive editors exists"));
export const CTX_INLINE_CHAT_VISIBLE = new RawContextKey<boolean>('inlineChatVisible', false, localize('inlineChatVisible', "Whether the interactive editor input is visible"));
export const CTX_INLINE_CHAT_FOCUSED = new RawContextKey<boolean>('inlineChatFocused', false, localize('inlineChatFocused', "Whether the interactive editor input is focused"));
export const CTX_INLINE_CHAT_RESPONSE_FOCUSED = new RawContextKey<boolean>('inlineChatResponseFocused', false, localize('inlineChatResponseFocused', "Whether the interactive widget's response is focused"));
export const CTX_INLINE_CHAT_EMPTY = new RawContextKey<boolean>('inlineChatEmpty', false, localize('inlineChatEmpty', "Whether the interactive editor input is empty"));
export const CTX_INLINE_CHAT_INNER_CURSOR_FIRST = new RawContextKey<boolean>('inlineChatInnerCursorFirst', false, localize('inlineChatInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_LAST = new RawContextKey<boolean>('inlineChatInnerCursorLast', false, localize('inlineChatInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_START = new RawContextKey<boolean>('inlineChatInnerCursorStart', false, localize('inlineChatInnerCursorStart', "Whether the cursor of the iteractive editor input is on the start of the input"));
export const CTX_INLINE_CHAT_INNER_CURSOR_END = new RawContextKey<boolean>('inlineChatInnerCursorEnd', false, localize('inlineChatInnerCursorEnd', "Whether the cursor of the iteractive editor input is on the end of the input"));
export const CTX_INLINE_CHAT_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('inlineChatOuterCursorPosition', '', localize('inlineChatOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST = new RawContextKey<boolean>('inlineChatHasActiveRequest', false, localize('inlineChatHasActiveRequest', "Whether interactive editor has an active request"));
export const CTX_INLINE_CHAT_HAS_STASHED_SESSION = new RawContextKey<boolean>('inlineChatHasStashedSession', false, localize('inlineChatHasStashedSession', "Whether interactive editor has kept a session for quick restore"));
export const CTX_INLINE_CHAT_LAST_RESPONSE_TYPE = new RawContextKey<InlineChatResponseType | undefined>('inlineChatLastResponseType', undefined, localize('inlineChatResponseType', "What type was the last response of the current interactive editor session"));
export const CTX_INLINE_CHAT_RESPONSE_TYPES = new RawContextKey<InlineChatResponseTypes | undefined>('inlineChatResponseTypes', InlineChatResponseTypes.Empty, localize('inlineChatResponseTypes', "What type was the responses have been receieved"));
export const CTX_INLINE_CHAT_DID_EDIT = new RawContextKey<boolean>('inlineChatDidEdit', undefined, localize('inlineChatDidEdit', "Whether interactive editor did change any code"));
export const CTX_INLINE_CHAT_USER_DID_EDIT = new RawContextKey<boolean>('inlineChatUserDidEdit', undefined, localize('inlineChatUserDidEdit', "Whether the user did changes ontop of the inline chat"));
export const CTX_INLINE_CHAT_LAST_FEEDBACK = new RawContextKey<'unhelpful' | 'helpful' | ''>('inlineChatLastFeedbackKind', '', localize('inlineChatLastFeedbackKind', "The last kind of feedback that was provided"));
export const CTX_INLINE_CHAT_SUPPORT_ISSUE_REPORTING = new RawContextKey<boolean>('inlineChatSupportIssueReporting', false, localize('inlineChatSupportIssueReporting', "Whether the interactive editor supports issue reporting"));
export const CTX_INLINE_CHAT_DOCUMENT_CHANGED = new RawContextKey<boolean>('inlineChatDocumentChanged', false, localize('inlineChatDocumentChanged', "Whether the document has changed concurrently"));
export const CTX_INLINE_CHAT_CHANGE_HAS_DIFF = new RawContextKey<boolean>('inlineChatChangeHasDiff', false, localize('inlineChatChangeHasDiff', "Whether the current change supports showing a diff"));
export const CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF = new RawContextKey<boolean>('inlineChatChangeShowsDiff', false, localize('inlineChatChangeShowsDiff', "Whether the current change showing a diff"));
export const CTX_INLINE_CHAT_EDIT_MODE = new RawContextKey<EditMode>('config.inlineChat.mode', EditMode.Live);

// --- (select) action identifier

export const ACTION_ACCEPT_CHANGES = 'inlineChat.acceptChanges';
export const ACTION_REGENERATE_RESPONSE = 'inlineChat.regenerate';
export const ACTION_VIEW_IN_CHAT = 'inlineChat.viewInChat';
export const ACTION_TOGGLE_DIFF = 'inlineChat.toggleDiff';

// --- menus

export const MENU_INLINE_CHAT_WIDGET = MenuId.for('inlineChatWidget');
export const MENU_INLINE_CHAT_WIDGET_STATUS = MenuId.for('inlineChatWidget.status');
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
export const overviewRulerInlineChatDiffInserted = registerColor('editorOverviewRuler.inlineChatInserted', { dark: transparent(diffInserted, 0.6), light: transparent(diffInserted, 0.8), hcDark: transparent(diffInserted, 0.6), hcLight: transparent(diffInserted, 0.8) }, localize('editorOverviewRuler.inlineChatInserted', 'Overview ruler marker color for inline chat inserted content.'));
export const minimapInlineChatDiffInserted = registerColor('editorOverviewRuler.inlineChatInserted', { dark: transparent(diffInserted, 0.6), light: transparent(diffInserted, 0.8), hcDark: transparent(diffInserted, 0.6), hcLight: transparent(diffInserted, 0.8) }, localize('editorOverviewRuler.inlineChatInserted', 'Overview ruler marker color for inline chat inserted content.'));

export const inlineChatDiffRemoved = registerColor('inlineChatDiff.removed', { dark: transparent(diffRemoved, .5), light: transparent(diffRemoved, .5), hcDark: transparent(diffRemoved, .5), hcLight: transparent(diffRemoved, .5) }, localize('inlineChatDiff.removed', "Background color of removed text in the interactive editor input"));
export const overviewRulerInlineChatDiffRemoved = registerColor('editorOverviewRuler.inlineChatRemoved', { dark: transparent(diffRemoved, 0.6), light: transparent(diffRemoved, 0.8), hcDark: transparent(diffRemoved, 0.6), hcLight: transparent(diffRemoved, 0.8) }, localize('editorOverviewRuler.inlineChatRemoved', 'Overview ruler marker color for inline chat removed content.'));


// settings

export const enum EditMode {
	Live = 'live',
	Preview = 'preview'
}

Registry.as<IConfigurationMigrationRegistry>(ExtensionsMigration.ConfigurationMigration).registerConfigurationMigrations(
	[{
		key: 'interactiveEditor.editMode', migrateFn: (value: any) => {
			return [['inlineChat.mode', { value: value }]];
		}
	}]
);

export const enum InlineChatConfigKeys {
	Mode = 'inlineChat.mode',
	FinishOnType = 'inlineChat.finishOnType',
	AcceptedOrDiscardBeforeSave = 'inlineChat.acceptedOrDiscardBeforeSave',
	HoldToSpeech = 'inlineChat.holdToSpeech',
	AccessibleDiffView = 'inlineChat.accessibleDiffView'
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		[InlineChatConfigKeys.Mode]: {
			description: localize('mode', "Configure if changes crafted with inline chat are applied directly to the document or are previewed first."),
			default: EditMode.Live,
			type: 'string',
			enum: [EditMode.Live, EditMode.Preview],
			markdownEnumDescriptions: [
				localize('mode.live', "Changes are applied directly to the document, can be highlighted via inline diffs, and accepted/discarded by hunks. Ending a session will keep the changes."),
				localize('mode.preview', "Changes are previewed only and need to be accepted via the apply button. Ending a session will discard the changes."),
			],
			tags: ['experimental']
		},
		[InlineChatConfigKeys.FinishOnType]: {
			description: localize('finishOnType', "Whether to finish an inline chat session when typing outside of changed regions."),
			default: false,
			type: 'boolean'
		},
		[InlineChatConfigKeys.AcceptedOrDiscardBeforeSave]: {
			description: localize('acceptedOrDiscardBeforeSave', "Whether pending inline chat sessions prevent saving."),
			default: true,
			type: 'boolean'
		},
		[InlineChatConfigKeys.HoldToSpeech]: {
			description: localize('holdToSpeech', "Whether holding the inline chat keybinding will automatically enable speech recognition."),
			default: true,
			type: 'boolean'
		},
		[InlineChatConfigKeys.AccessibleDiffView]: {
			description: localize('accessibleDiffView', "Whether the inline chat also renders an accessible diff viewer for its changes."),
			default: 'auto',
			type: 'string',
			enum: ['auto', 'on', 'off'],
			markdownEnumDescriptions: [
				localize('accessibleDiffView.auto', "The accessible diff viewer is based screen reader mode being enabled."),
				localize('accessibleDiffView.on', "The accessible diff viewer is always enabled."),
				localize('accessibleDiffView.off', "The accessible diff viewer is never enabled."),
			],
		}
	}
});
