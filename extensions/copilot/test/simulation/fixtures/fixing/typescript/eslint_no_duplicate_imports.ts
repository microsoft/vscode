/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-duplicate-imports: "error" */
import { isDeepLooseEqual } from './eslint_no_dupe_else_if';
import { sillyQuote } from './eslint_no_duplicate_case';
// TODO: Need to exempt this file from the no-duplicate-imports formatting rule in the repo itself
import { Character } from './eslint_no_duplicate_case';

export function testQuotes() {
    const hamlet = sillyQuote(Character.Hamlet);
    const guildenstern = sillyQuote(Character.Guildenstern);
    if (isDeepLooseEqual(hamlet, guildenstern)) {
        throw new Error('duplicated quotes');
    }
}
