/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/162950

	export type SingleOrMany<T> = T[] | T;

	export interface TerminalQuickFixProvider {
		/**
		 * Provides terminal quick fixes
		 * @param commandMatchResult The command match result for which to provide quick fixes
		 * @param token A cancellation token indicating the result is no longer needed
		 * @return Terminal quick fix(es) if any
		 */
		provideTerminalQuickFixes(commandMatchResult: TerminalCommandMatchResult, token: CancellationToken): ProviderResult<SingleOrMany<TerminalQuickFixTerminalCommand | TerminalQuickFixOpener | Command>>;
	}


	export interface TerminalCommandMatchResult {
		commandLine: string;
		commandLineMatch: RegExpMatchArray;
		outputMatch?: {
			regexMatch: RegExpMatchArray;
			outputLines: string[];
		};
	}

	export namespace window {
		/**
		 * @param provider A terminal quick fix provider
		 * @return A {@link Disposable} that unregisters the provider when being disposed
		 */
		export function registerTerminalQuickFixProvider(id: string, provider: TerminalQuickFixProvider): Disposable;
	}

	export class TerminalQuickFixTerminalCommand {
		/**
		 * The terminal command to insert or run
		 */
		terminalCommand: string;
		/**
		 * Whether the command should be executed or just inserted (default)
		 */
		shouldExecute?: boolean;
		constructor(terminalCommand: string, shouldExecute?: boolean);
	}
	export class TerminalQuickFixOpener {
		/**
		 * The uri to open
		 */
		uri: Uri;
		constructor(uri: Uri);
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
		anchor: TerminalOutputAnchor;
		/**
			 * The number of rows above or below the {@link anchor} to start matching against.
			 */
		offset: number;
		/**
		 * The number of wrapped lines to match against, this should be as small as possible for performance
		 * reasons. This is capped at 40.
		 */
		length: number;
	}

	enum TerminalOutputAnchor {
		Top = 0,
		Bottom = 1
	}
}
