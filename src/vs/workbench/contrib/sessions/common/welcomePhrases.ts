/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** Placeholder users put in custom welcome phrases to position the welcome name. */
export const NEW_SESSION_WELCOME_NAME_PLACEHOLDER = '${name}';

export interface INewSessionWelcomeMessagesConfiguration {
	readonly mode?: 'replace' | 'append';
	readonly phrases?: readonly string[];
}

const WELCOME_NAME_PLACEHOLDER = /\$?\{name\}/gu;
/** Matches `${name}` or legacy `{name}` together with an adjoining separator and whitespace. */
// allow-any-unicode-next-line
const WELCOME_NAME_PLACEHOLDER_SEGMENT = /\s*[,—–-]?\s*\$?\{name\}\s*[,—–-]?\s*/gu;
const SPACE_BEFORE_PUNCTUATION = /\s+([!?.,;:])/gu;

function getDefaultWelcomePhrases(accountName: string | undefined): string[] {
	return accountName
		? [
			localize('newSession.welcome.named.building', "What are we building, {0}?", accountName),
			// allow-any-unicode-next-line
			localize('newSession.welcome.named.move', "What’s the move, {0}?", accountName),
			// allow-any-unicode-next-line
			localize('newSession.welcome.named.cook', "Let’s cook, {0}", accountName),
			localize('newSession.welcome.named.lockIn', "Time to lock in, {0}", accountName),
			// allow-any-unicode-next-line
			localize('newSession.welcome.named.ship', "Let’s ship something, {0}", accountName),
		]
		: [
			localize('newSession.welcome.building', "What are we building?"),
			// allow-any-unicode-next-line
			localize('newSession.welcome.move', "What’s the move?"),
			// allow-any-unicode-next-line
			localize('newSession.welcome.cook', "Let’s cook"),
			localize('newSession.welcome.lockIn', "Time to lock in"),
			// allow-any-unicode-next-line
			localize('newSession.welcome.ship', "Let’s ship something"),
		];
}

/**
 * Resolves a custom welcome phrase template, including the legacy `{name}` syntax.
 */
export function resolveWelcomePhraseTemplate(phrase: string, accountName: string | undefined): string {
	if (accountName) {
		return phrase.replace(WELCOME_NAME_PLACEHOLDER, () => accountName).trim();
	}

	const startsWithPlaceholder = /^\s*\$?\{name\}/u.test(phrase);
	const stripped = phrase
		.replace(WELCOME_NAME_PLACEHOLDER_SEGMENT, (match, offset: number, source: string) =>
			offset === 0 || offset + match.length === source.length ? '' : ' ')
		.replace(SPACE_BEFORE_PUNCTUATION, '$1')
		.trim();
	return startsWithPlaceholder ? stripped.charAt(0).toLocaleUpperCase() + stripped.slice(1) : stripped;
}

/**
 * Builds the pool of welcome phrases. Custom phrases either replace the defaults
 * (`mode: 'replace'`) or extend them (`mode: 'append'`, the default). Phrases that
 * resolve to nothing are dropped.
 */
export function getNewSessionWelcomePhrases(configuration: INewSessionWelcomeMessagesConfiguration | undefined, accountName: string | undefined): string[] {
	const customPhrases = (configuration?.phrases ?? [])
		.filter(phrase => typeof phrase === 'string')
		.map(phrase => resolveWelcomePhraseTemplate(phrase, accountName))
		.filter(phrase => phrase.length > 0);
	if (configuration?.mode === 'replace') {
		return customPhrases;
	}
	return [...getDefaultWelcomePhrases(accountName), ...customPhrases];
}
