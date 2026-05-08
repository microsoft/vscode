/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared utilities for the CLI's headless / scriptable surface (Phase CLI11).
 *
 * Exit code conventions are centralised here so every command exits with the
 * same code for the same class of failure — important for callers driving
 * `sota` from CI scripts who pattern-match on `$?`.
 */

export const SOTA_EXIT_CODES = {
	OK: 0,
	HARD_FAIL: 1,
	DECLINED: 2,
	CANCELLED: 3,
	TIMEOUT: 4,
} as const;

export type SotaExitCode = typeof SOTA_EXIT_CODES[keyof typeof SOTA_EXIT_CODES];

/**
 * Read piped stdin (if any) so callers can do
 * `cat file.ts | sota run @anton-code "review this"`. Returns an empty string
 * when stdin is a TTY (interactive invocation) or when the pipe is empty so
 * callers can unconditionally concatenate the result onto the prompt.
 */
export async function readPipedStdin(): Promise<string> {
	if (process.stdin.isTTY) {
		return '';
	}
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * Merge piped stdin onto the user-supplied prompt. The piped content is
 * separated from the prompt by a labelled fence so the LLM understands the
 * distinction between the user's instruction and the attached payload.
 */
export function mergeStdinIntoPrompt(prompt: string, stdin: string): string {
	const trimmed = stdin.trim();
	if (!trimmed) {
		return prompt;
	}
	return `${prompt}\n\n--- piped input ---\n${trimmed}\n--- end piped input ---`;
}

/**
 * Map any thrown value to the right `SotaExitCode`. Cancellation is recognised
 * by name (the `CliCancellation` flow throws an `AbortError`-shaped error) so
 * a Ctrl-C exits as `CANCELLED`, not `HARD_FAIL`.
 */
export function classifyError(err: unknown): SotaExitCode {
	if (err instanceof Error) {
		if (err.name === 'AbortError' || /cancell?ed/i.test(err.message)) {
			return SOTA_EXIT_CODES.CANCELLED;
		}
		if (/timed? ?out/i.test(err.message)) {
			return SOTA_EXIT_CODES.TIMEOUT;
		}
		if (/(declined|refused|safety)/i.test(err.message)) {
			return SOTA_EXIT_CODES.DECLINED;
		}
	}
	return SOTA_EXIT_CODES.HARD_FAIL;
}
