/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../../nls.js';

export abstract class InlineCompletionContextKeys {

	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible', false, localize('inlineSuggestionVisible', "Whether an inline suggestion is visible"));
	public static readonly inlineSuggestionHasIndentation = new RawContextKey<boolean>('inlineSuggestionHasIndentation', false, localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace"));
	public static readonly inlineSuggestionHasIndentationLessThanTabSize = new RawContextKey<boolean>('inlineSuggestionHasIndentationLessThanTabSize', true, localize('inlineSuggestionHasIndentationLessThanTabSize', "Whether the inline suggestion starts with whitespace that is less than what would be inserted by tab"));
	public static readonly suppressSuggestions = new RawContextKey<boolean | undefined>('inlineSuggestionSuppressSuggestions', undefined, localize('suppressSuggestions', "Whether suggestions should be suppressed for the current suggestion"));

	public static readonly cursorInIndentation = new RawContextKey<boolean | undefined>('cursorInIndentation', false, localize('cursorInIndentation', "Whether the cursor is in indentation"));
	public static readonly hasSelection = new RawContextKey<boolean | undefined>('editor.hasSelection', false, localize('editor.hasSelection', "Whether the editor has a selection"));
	public static readonly cursorAtInlineEdit = new RawContextKey<boolean | undefined>('cursorAtInlineEdit', false, localize('cursorAtInlineEdit', "Whether the cursor is at an inline edit"));
	public static readonly inlineEditVisible = new RawContextKey<boolean>('inlineEditIsVisible', false, localize('inlineEditVisible', "Whether an inline edit is visible"));
	public static readonly tabShouldJumpToInlineEdit = new RawContextKey<boolean | undefined>('tabShouldJumpToInlineEdit', false, localize('tabShouldJumpToInlineEdit', "Whether tab should jump to an inline edit."));
	public static readonly tabShouldAcceptInlineEdit = new RawContextKey<boolean | undefined>('tabShouldAcceptInlineEdit', false, localize('tabShouldAcceptInlineEdit', "Whether tab should accept the inline edit."));
}
