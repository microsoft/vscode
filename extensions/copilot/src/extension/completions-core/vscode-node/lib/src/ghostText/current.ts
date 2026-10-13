/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { APIChoice } from '../openai/openai';
import { ResultType } from './resultType';

export const ICompletionsCurrentGhostText = createServiceIdentifier<ICompletionsCurrentGhostText>('ICompletionsCurrentGhostText');
export interface ICompletionsCurrentGhostText {
	readonly _serviceBrand: undefined;

	readonly clientCompletionId: string | undefined;

	currentRequestId: string | undefined;

	setGhostText(prefix: string, suffix: string, choices: APIChoice[], resultType: ResultType): void;
	getCompletionsForUserTyping(prefix: string, suffix: string): APIChoice[] | undefined;
	hasAcceptedCurrentCompletion(prefix: string, suffix: string): boolean;
}

/**
 * Stores the internal concept of the currently shown completion, as inferred by
 * the output of getGhostText. Used to check if a subsequent call to
 * getGhostText is typing-as-suggested.
 */
export class CurrentGhostText implements ICompletionsCurrentGhostText {
	declare _serviceBrand: undefined;
	/** The document prefix at the start of the typing-as-suggested flow. This
	 * does not use the prompt prefix since the ellision means that prefix is a
	 * sliding window over long documents. */
	private prefix?: string;

	/** The prompt suffix at the start of the typing-as-suggested flow. */
	private suffix?: string;

	/** The original APIChoice array created at the start of the
	 * typing-as-suggested flow. The first element in the array should be the
	 * completion shown to the user. */
	private choices: APIChoice[] = [];

	/** The currently shown completion id. */
	get clientCompletionId(): string | undefined {
		return this.choices[0]?.clientCompletionId;
	}

	/** The most recent inline completion request id, excluding speculative requests. */
	currentRequestId: string | undefined;

	/** Updates the current ghost text if it was not produced via
	 * TypingAsSuggested. Should only be called from the end of getGhostText. */
	setGhostText(prefix: string, suffix: string, choices: APIChoice[], resultType: ResultType) {
		if (resultType === ResultType.TypingAsSuggested) { return; }
		this.prefix = prefix;
		this.suffix = suffix;
		this.choices = choices;
	}

	/** Returns the current choices if the request context matches.  */
	getCompletionsForUserTyping(prefix: string, suffix: string): APIChoice[] | undefined {
		const remainingPrefix = this.getRemainingPrefix(prefix, suffix);
		if (remainingPrefix === undefined) { return; }
		// If the first choice text does not match return empty to fall through
		// to either the cache or network.
		if (!startsWithAndExceeds(this.choices[0].completionText, remainingPrefix)) { return; }
		return adjustChoicesStart(this.choices, remainingPrefix);
	}

	/** Returns whether the current completion is fully completed, and covers a full line. */
	hasAcceptedCurrentCompletion(prefix: string, suffix: string): boolean {
		const remainingPrefix = this.getRemainingPrefix(prefix, suffix);
		if (remainingPrefix === undefined) { return false; }

		// Check if the completion text matches exactly
		const exactMatch = remainingPrefix === this.choices?.[0].completionText;

		// Check finishReason - return false if it indicates that the server cut off a part of it (thus it might not complete a full line), due to RAI or snippy
		const finishReason = this.choices?.[0].finishReason;
		return exactMatch && finishReason === 'stop';
	}

	/** If the given document prefix and prompt suffix match the current
	 * completion returns the remaining prefix of the document after the stored
	 * prefix. Returns undefined if the completion does not match. */
	private getRemainingPrefix(prefix: string, suffix: string): string | undefined {
		// Check that there is a current completion.
		if (this.prefix === undefined || this.suffix === undefined || this.choices.length === 0) { return; }
		// Check that the prompt suffixes are an exact match.
		if (this.suffix !== suffix) { return; }
		// Check that the document prefix is a prefix of the new prefix.
		// This doesn't use the prompt prefix since the ellision means that
		// subsequent prefixes will not be a prefix of earlier ones.
		if (!prefix.startsWith(this.prefix)) { return; }
		// Return the remaining new document prefix after the prefix stored for
		// the current completion.
		return prefix.substring(this.prefix.length);
	}
}

/** Returns choices adjusted to remove the remainingPrefix from the start of the
 * completionText if it matches. */
function adjustChoicesStart(choices: APIChoice[], remainingPrefix: string): APIChoice[] {
	return choices
		.filter(choice => startsWithAndExceeds(choice.completionText, remainingPrefix))
		.map(choice => ({
			...choice,
			completionText: choice.completionText.substring(remainingPrefix.length),
		}));
}

/** Returns true if `prefix` is a prefix of `text` and `text` is longer. */
function startsWithAndExceeds(text: string, prefix: string) {
	return text.startsWith(prefix) && text.length > prefix.length;
}
