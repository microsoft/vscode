// This is a test file for the sake of testing actual file reads
// We had silently failing tests in the past due to improper
// file spoofing

export interface Tokenizer {
	/**
	 * Returns the tokenization of the input string as a list of integers
	 * representing tokens.
	 */
	tokenize(text: string): Array<number>;
}
