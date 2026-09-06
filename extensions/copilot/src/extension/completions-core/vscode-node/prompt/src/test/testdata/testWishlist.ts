// This is a test file for the sake of testing actual file reads
// We had silently failing tests in the past due to improper
// file spoofing

import { Tokenizer } from './testTokenizer';

export class PromptWishlist {
	/**
	 * An object to keep track of a list of desired prompt elements,
	 * and assemble the prompt text from them.
	 * @param lineEndingOption The line ending option to use
	 */
	constructor(_tokenizer: Tokenizer) { }
}
