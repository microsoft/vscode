/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';

/**
 * The kind of question a pattern answers about the terminal's cursor line.
 *
 * - `prompt`: the line looks like a shell/REPL prompt, i.e. the command is done and the terminal
 *   is sitting idle at a prompt. Used by execute strategies to decide whether a command has
 *   finished.
 * - `inputRequired`: the line is a high-confidence request for user input (confirmation,
 *   password, interactive picker). Specific enough to avoid false positives on normal command
 *   output, so safe to check unconditionally.
 * - `likelyInputRequired`: broader input heuristics (bare `:` / `?` with trailing space) that
 *   are only safe when the caller has independent evidence the command is still consuming stdin.
 * - `nonInteractiveHelp`: the line is a passive hint (e.g. "press h to show help") from a
 *   long-running process, not a blocking request for input.
 * - `pressAnyKey`: a generic "press any key" prompt from a script.
 */
export type PromptPatternCategory = 'prompt' | 'inputRequired' | 'likelyInputRequired' | 'nonInteractiveHelp' | 'pressAnyKey';

interface IPromptPattern {
	readonly id: string;
	readonly regex: RegExp;
	readonly categories: readonly PromptPatternCategory[];
	/**
	 * Human-readable name used to build {@link IPromptDetectionResult.reason} for `prompt`
	 * patterns.
	 */
	readonly description: string;
}

/**
 * The single source of truth for prompt and input detection patterns. Execute strategies and the
 * output monitor both answer facets of the same question — "is this terminal sitting at a prompt,
 * and is it waiting for something?" — so their patterns live in one table to prevent the two
 * views from drifting apart. A pattern may belong to multiple categories.
 *
 * Order matters within the `prompt` category: the first matching pattern provides the reason
 * string, so more specific patterns come before generic ones.
 */
const promptPatterns: readonly IPromptPattern[] = [
	// #region prompt — shell/REPL prompts (is the terminal idle at a prompt?)

	{
		id: 'powershell',
		description: 'PowerShell prompt',
		// PowerShell prompt: PS C:\> or similar patterns
		regex: /PS\s+[A-Z]:\\.*>\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'commandPrompt',
		description: 'Command Prompt',
		// Command Prompt: C:\path>
		regex: /^[A-Z]:\\.*>\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'bash',
		description: 'Bash-style prompt',
		// Bash-style prompts ending with $
		regex: /\$\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'root',
		description: 'Root prompt',
		// Root prompts ending with #
		regex: /#\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'pythonRepl',
		description: 'Python REPL prompt',
		// Python REPL prompt
		regex: /^>>>\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'starship',
		description: 'Starship prompt',
		// Custom prompts ending with the starship character (\u276f)
		regex: /\u276f\s*$/,
		categories: ['prompt'],
	},
	{
		id: 'debuggerRepl',
		description: 'Debugger REPL prompt',
		// Debugger REPLs: (Pdb), (gdb), (lldb). These are both a prompt (the command has
		// stopped producing output) and a request for input (the debugger is blocked waiting
		// for a command), so they participate in both categories. Anchored to the whole line
		// to stay specific.
		regex: /^\((?:Pdb|gdb|lldb)\)\s*$/,
		categories: ['prompt', 'inputRequired'],
	},
	{
		id: 'generic',
		description: 'Generic prompt',
		// Generic prompts ending with common prompt characters
		regex: /[>%]\s*$/,
		categories: ['prompt'],
	},

	// #endregion

	// #region inputRequired — high-confidence requests for user input
	//
	// These are safe to use as a fast-path to skip normal idle detection, because they are
	// specific enough to avoid false positives on normal command output (build logs, headers,
	// etc.).

	{
		id: 'multiOptionLine',
		description: 'PowerShell-style multi-option line',
		// PowerShell-style multi-option line (supports [?] Help and optional default suffix) ending
		// in whitespace.  Uses [^\[]* to match each label (everything up to the next bracket),
		// ensuring linear-time matching with no nested quantifiers that could cause ReDoS.
		regex: /\s*(?:\[[^\]]\][^\[]*)+(?:\(default is\s+"[^"]+"\):)?\s+$/,
		categories: ['inputRequired'],
	},
	{
		id: 'yesNoBracketed',
		description: 'Bracketed yes/no confirmation',
		// Bracketed/parenthesized yes/no pairs at end of line: (y/n), [Y/n], (yes/no), [no/yes]
		regex: /(?:\(|\[)\s*(?:y(?:es)?\s*\/\s*n(?:o)?|n(?:o)?\s*\/\s*y(?:es)?)\s*(?:\]|\))\s+$/i,
		categories: ['inputRequired'],
	},
	{
		id: 'yesNoQuestion',
		description: 'yes/no question',
		// Same as above but allows a preceding '?' or ':' and optional wrappers e.g.
		// "Continue? (y/n)" or "Overwrite: [yes/no]"
		regex: /[?:]\s*(?:\(|\[)?\s*y(?:es)?\s*\/\s*n(?:o)?\s*(?:\]|\))?\s+$/i,
		categories: ['inputRequired'],
	},
	{
		id: 'confirmationY',
		description: 'Confirmation prompt',
		// Confirmation prompts ending with (y) followed by trailing space, e.g. "Ok to proceed? (y) "
		// The trailing space indicates the cursor is positioned after the prompt awaiting input, as
		// opposed to normal command output that happens to contain "(y)" followed by a newline.
		regex: /\(y\) +$/i,
		categories: ['inputRequired'],
	},
	{
		id: 'parenthesizedDefault',
		description: 'Prompt with parenthesized default value',
		// Prompt with parenthesized default value e.g. "package name: (test) " or "version: (1.0.0) ".
		// REQUIRES at least one space between the colon and the opening paren (`\s+`, not `\s*`)
		// so this rule does not match git-aware shell prompts like
		// allow-any-unicode-next-line
		//   "➜  myrepo git:(main) "                    (oh-my-zsh / robbyrussell)
		//   "[user@host ~/myrepo (main)]$ "
		// where the colon abuts the paren with no separator. npm-init / yarn-init style
		// prompts always render at least one space after the colon, so this stays specific
		// without dropping the intended matches.
		regex: /:\s+\([^)]*\) +$/,
		categories: ['inputRequired'],
	},
	{
		id: 'pagerEnd',
		description: 'Pager end marker',
		// Line contains (END) which is common in pagers
		regex: /\(END\)$/,
		categories: ['inputRequired'],
	},
	{
		id: 'password',
		description: 'Password prompt',
		// Password prompt. Requires a trailing colon (e.g. "Password:", "[sudo] password for user:")
		// and tolerates zero or more trailing spaces — xterm's `translateToString(trimRight=true)`
		// strips trailing whitespace from non-wrapped buffer lines, so a real `Password: ` prompt
		// is captured from the buffer as `Password:` with no trailing space.
		regex: /password(?: for [^:]+)?:\s*$/i,
		categories: ['inputRequired'],
	},
	{
		id: 'pressAnyKey',
		description: 'Press any key prompt',
		// "Press a key" or "Press any key". This is both a high-confidence input request and the
		// generic press-any-key pattern (see detectsGenericPressAnyKeyPattern, which additionally
		// excludes VS Code's own task finish messages).
		regex: /press a(?:ny)? key/i,
		categories: ['inputRequired', 'pressAnyKey'],
	},
	{
		id: 'interactivePromptLibrary',
		description: 'Interactive prompt library',
		// Interactive prompt libraries (prompts, enquirer, inquirer) prefix the prompt with
		// '? ' at the start of the line and end with a distinctive chevron character
		// followed by optional trailing whitespace where the cursor is awaiting input.
		// Anchoring the '?' to the start of the line (after optional whitespace/ANSI
		// escapes) avoids false positives from normal output that contains both a '?'
		// allow-any-unicode-next-line
		// and a chevron (e.g. "What happened? ›").
		// Examples:
		//   "? Do you want to install jsdom? <chevron>"  (prompts)
		//   "? Pick a color <chevron> "                  (enquirer)
		// allow-any-unicode-next-line
		regex: /^(?:\s|\x1b\[[0-9;]*m)*\?.*[›❯▸▶]\s*$/,
		categories: ['inputRequired'],
	},

	// #endregion

	// #region likelyInputRequired — broad heuristics, only safe behind an isActive gate
	//
	// These broad patterns may produce false positives on normal command output that happens to
	// end with those characters (e.g. `Last Command: `, `[INFO] Starting: `). They are
	// syntactically indistinguishable from real prompts like `Enter your name: ` on a single
	// cursor line, so they must only be consulted when the caller has independent evidence that
	// the terminal is currently consuming stdin. See detectsLikelyInputRequiredPattern.

	{
		id: 'trailingColon',
		description: 'Trailing colon',
		// Line ends with ':' followed by at least one space. The trailing space indicates a
		// waiting prompt (cursor positioned after the colon). A bare ':\n' at end of buffer is
		// usually non-prompt output (e.g. a header or log line) and must not match.
		regex: /: +$/,
		categories: ['likelyInputRequired'],
	},
	{
		id: 'trailingQuestion',
		description: 'Trailing question mark',
		// Line ends with '?' followed by at least one space (optionally followed by a
		// parenthesized hint like "Continue? (yes/no) "). Requiring trailing space avoids
		// matching arbitrary command output where a line happens to end with '?'.
		regex: /\? *(?:\([a-z\s]+\))? +$/i,
		categories: ['likelyInputRequired'],
	},

	// #endregion

	// #region nonInteractiveHelp — passive hints from long-running processes

	{
		id: 'pressHelpToShow',
		description: 'Help hint',
		regex: /press [h?]\s*(?:\+\s*enter)?\s*to (?:show|open|display|get|see)\s*(?:available )?(?:help|commands|options)/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressHForHelp',
		description: 'Help hint',
		regex: /press h\s*(?:or\s*\?)?\s*(?:\+\s*enter)?\s*for (?:help|commands|options)/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressQuestionForHelp',
		description: 'Help hint',
		regex: /press \?\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:help|commands|options|list)/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'typeHelp',
		description: 'Help hint',
		regex: /type\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'hitHelp',
		description: 'Help hint',
		regex: /hit\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressOToOpen',
		description: 'Open hint',
		regex: /press o\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:open|launch)(?:\s*(?:the )?(?:app|application|browser)|\s+in\s+(?:the\s+)?browser)?/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressRToRestart',
		description: 'Restart hint',
		regex: /press r\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:restart|reload|refresh)(?:\s*(?:the )?(?:server|dev server|service))?/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressQToQuit',
		description: 'Quit hint',
		regex: /press q\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:quit|exit|stop)(?:\s*(?:the )?(?:server|app|process))?/i,
		categories: ['nonInteractiveHelp'],
	},
	{
		id: 'pressUForUrls',
		description: 'Show URLs hint',
		regex: /press u\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:show|print|display)\s*(?:the )?(?:server )?urls?/i,
		categories: ['nonInteractiveHelp'],
	},

	// #endregion
];

function matchesCategory(cursorLine: string, category: PromptPatternCategory): boolean {
	return promptPatterns.some(p => p.categories.includes(category) && p.regex.test(cursorLine));
}

export interface IPromptDetectionResult {
	/**
	 * Whether a prompt was detected.
	 */
	detected: boolean;
	/**
	 * The reason for logging.
	 */
	reason?: string;
}

/**
 * Detects if the given text content appears to end with a common prompt pattern.
 */
export function detectsCommonPromptPattern(cursorLine: string): IPromptDetectionResult {
	if (cursorLine.trim().length === 0) {
		return { detected: false, reason: 'Content is empty or contains only whitespace' };
	}

	for (const pattern of promptPatterns) {
		if (pattern.categories.includes('prompt') && pattern.regex.test(cursorLine)) {
			return { detected: true, reason: `${pattern.description} pattern detected: "${cursorLine}"` };
		}
	}

	return { detected: false, reason: `No common prompt pattern found in last line: "${cursorLine}"` };
}

/**
 * High-confidence patterns that reliably indicate the terminal is waiting for
 * input. These are safe to use as a fast-path in `_waitForIdle` to skip normal
 * idle detection, because they are specific enough to avoid false positives on
 * normal command output (build logs, headers, etc.).
 */
export function detectsHighConfidenceInputPattern(cursorLine: string): boolean {
	return matchesCategory(cursorLine, 'inputRequired');
}

/**
 * Strict input-required detection. Returns true only for patterns that are
 * specific enough to avoid false positives on normal command output (build
 * logs, status lines, error messages). Safe to call from any code path,
 * including unconditionally on the last line of a finished command.
 *
 * For the broader heuristics (bare `:` / `?` with trailing space), use
 * {@link detectsLikelyInputRequiredPattern} — but only from a call site that
 * has independent evidence the command is still running and consuming stdin
 * (e.g. `execution.isActive() === true`). Those broad patterns cannot
 * reliably distinguish a real prompt like `Enter your name: ` from log
 * output like `Last Command: ` on a single line.
 */
export function detectsInputRequiredPattern(cursorLine: string): boolean {
	return detectsHighConfidenceInputPattern(cursorLine);
}

/**
 * Strict patterns plus broader heuristics (bare `:` and `?` with trailing
 * space). These broad patterns may produce false positives on normal command
 * output that happens to end with those characters (e.g. `Last Command: `,
 * `[INFO] Starting: `, `find: /tmp/x: No such file: `). They are
 * syntactically indistinguishable from real prompts like `Enter your name: `
 * on a single cursor line.
 *
 * Therefore this function is only safe to call when the caller has
 * independent evidence that the terminal is currently consuming stdin —
 * specifically, `execution.isActive() === true` at a moment when the output
 * stream has been quiet (idle) for several poll intervals. `_waitForIdle`
 * applies that gate; new call sites should preserve it.
 *
 * For unconditional checks (e.g. on the last line of a finished command),
 * use {@link detectsInputRequiredPattern} instead.
 */
export function detectsLikelyInputRequiredPattern(cursorLine: string): boolean {
	if (detectsHighConfidenceInputPattern(cursorLine)) {
		return true;
	}
	return matchesCategory(cursorLine, 'likelyInputRequired');
}

export function detectsNonInteractiveHelpPattern(cursorLine: string): boolean {
	return matchesCategory(cursorLine, 'nonInteractiveHelp');
}

/**
 * Localized task finish messages from VS Code's terminalTaskSystem.
 * These are the same strings used when tasks complete.
 */
const taskFinishMessages = [
	// "Terminal will be reused by tasks, press any key to close it."
	localize('closeTerminal', "Terminal will be reused by tasks, press any key to close it."),
	localize('reuseTerminal', "Terminal will be reused by tasks, press any key to close it."),
	// "Press any key to close the terminal." (with exit code placeholder removed for matching)
	localize('exitCode.closeTerminal', "Press any key to close the terminal."),
	localize('exitCode.reuseTerminal', "Press any key to close the terminal."),
	// Punctuation variant: "The terminal will be reused by tasks. Press any key to close."
	localize('reuseTerminal.pressClose', "The terminal will be reused by tasks. Press any key to close."),
];

const normalizedTaskFinishMessages = taskFinishMessages.map(msg =>
	msg.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase()
);

/**
 * Detects VS Code's specific task completion messages like:
 * - "Press any key to close the terminal."
 * - "Terminal will be reused by tasks, press any key to close it."
 * These appear when a task finishes and should be ignored if the task is done.
 * Note: These messages may be prefixed with " * " by VS Code and may have line wrapping
 * that can split words across lines (e.g., "t\no" instead of "to").
 */
export function detectsVSCodeTaskFinishMessage(cursorLine: string): boolean {
	// Be tolerant to whitespace, punctuation, and line wrapping that can split words mid-word.
	const compact = cursorLine.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase();
	return normalizedTaskFinishMessages.some(msg => compact.includes(msg));
}

/**
 * Detects generic "press any key" prompts from scripts (not VS Code task messages).
 * These should prompt the user to interact with the terminal.
 */
export function detectsGenericPressAnyKeyPattern(cursorLine: string): boolean {
	// Match "press any key" but exclude VS Code task-specific messages
	if (detectsVSCodeTaskFinishMessage(cursorLine)) {
		return false;
	}
	return matchesCategory(cursorLine, 'pressAnyKey');
}
