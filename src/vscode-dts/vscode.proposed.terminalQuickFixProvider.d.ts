/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/162950

	/**
	 * Registers a provider that enables quick fix actions to be shown based on
	 * commands and their output
	 * @param provider The provider that provides the quick fixes.
	 * @return Disposable that unregisters the provider.
	 */
	export function registerTerminalQuickFixProvider(provider: TerminalQuickFixProvider): Disposable;

	/**
	 * A provider for terminal quick fixes.
	 */
	export interface TerminalQuickFixProvider {
		/**
		 * Provide terminal quick fixes
		 * @param options that specify when the fix should apply and the call back to run
		 * for matches
		 * @param token A cancellation token.
		 */
		provideTerminalQuickFixes(options: TerminalQuickFixOptions[], token: CancellationToken): void;
	}

	interface TerminalQuickFixOptions {
		commandLineMatcher: string | RegExp;
		outputMatcher?: TerminalOutputMatcher;
		getQuickFixes: TerminalQuickFixCallback;
		exitStatus?: boolean;
	}
	export type TerminalQuickFixMatchResult = { commandLineMatch: RegExpMatchArray; outputMatch?: RegExpMatchArray | null };
	export type TerminalQuickFixAction = Action | TerminalQuickFixCommandAction | TerminalQuickFixOpenerAction;
	export type TerminalQuickFixCallback = (matchResult: TerminalQuickFixMatchResult, command: string) => TerminalQuickFixAction[] | TerminalQuickFixAction | undefined;

	interface Action {
		readonly id: string;
		label: string;
		tooltip: string;
		class: string | undefined;
		enabled: boolean;
		checked?: boolean;
		run(event?: unknown): unknown;
	}
	export interface TerminalQuickFixCommandAction {
		type: 'command';
		command: string;
		addNewLine: boolean;
	}
	export interface TerminalQuickFixOpenerAction {
		type: 'opener';
		uri: Uri;
	}
	const enum TerminalOutputMatcherAnchor {
		Top = 'top',
		Bottom = 'bototm'
	}
	export interface TerminalOutputMatcher {
		/**
		 * A string or regex to match against the unwrapped line. If this is a regex with the multiline
		 * flag, it will scan an amount of lines equal to `\n` instances in the regex + 1.
		 */
		lineMatcher: string | RegExp;
		/**
		 * Which side of the output to anchor the {@link offset} and {@link length} against.
		 */
		anchor: TerminalOutputMatcherAnchor;
		/**
		 * How far from either the top or the bottom of the butter to start matching against.
		 */
		offset: number;
		/**
		 * The number of rows to match against, this should be as small as possible for performance
		 * reasons.
		 */
		length: number;
	}
}

