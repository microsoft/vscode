/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface TerminalQuickFixProvider {
		/**
		 * Provides terminal quick fixes
		 * @param commandMatchResult The command match result for which to provide quick fixes
		 * @param token A cancellation token indicating the result is no longer needed
		 * @return Terminal quick fix(es) if any
		 */
		provideTerminalQuickFixes(commandMatchResult: TerminalCommandMatchResult, token: CancellationToken): TerminalQuickFix[] | TerminalQuickFix | undefined;
	}

	export interface TerminalCommandSelector {
		commandLineMatcher: string | RegExp;
		outputMatcher?: TerminalOutputMatcher;
		exitStatus?: boolean;
	}

	export interface TerminalCommandMatchResult {
		command: TerminalCommand;
		commandLineMatch: RegExpMatchArray;
		// full match and groups

		outputMatch?: RegExpMatchArray | null;
	}

	export namespace window {
		/**
			 * @param commandSelector A selector that defines the commands that this provider is applicable to.
			 * @param provider A terminal quick fix provider
			 * @return A {@link Disposable} that unregisters the provider when being disposed
			 */
		export function registerTerminalQuickFixProvider(id: string, commandSelector: TerminalCommandSelector, provider: TerminalQuickFixProvider): Disposable;
	}


	type TerminalQuickFix = TerminalQuickFixCommandAction | TerminalQuickFixOpenerAction;

	interface TerminalQuickFixCommandAction {
		type: 'command';
		command: string;
	}
	interface TerminalQuickFixOpenerAction {
		type: 'opener';
		// support line range/col? see elsewhere
		uri: Uri;
	}
	const enum OutputAnchor {
		top = 'top',
		bottom = 'bottom'
	}
	/**
	 * A matcher that runs on a sub-section of a terminal command's output
	 */
	interface TerminalOutputMatcher {
		/**
		 * A string or regex to match against the unwrapped line. If this is a regex with the multiline
		 * flag, it will scan an amount of lines equal to `\n` instances in the regex + 1.
		 */
		lineMatcher: string | RegExp;
		/**
		 * Which side of the output to anchor the {@link offset} and {@link length} against.
		 */
		anchor: OutputAnchor;
		/**
		 * How far from either the top or the bottom of the butter to start matching against.
		 */
		offset: number;
		/**
		 * The number of rows to match against, this should be as small as possible for performance
		 * reasons.
		 */
		length: number;

		// ensure we can support all git similar using multiple lines
	}

	export interface TerminalCommand {
		command: string;
		exitCode?: number;
	}
}
