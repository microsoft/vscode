/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';

export interface ITerminalCommandSelector {
	id: string;
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	exitStatus: boolean;
}


export interface ITerminalQuickFixOptions {
	type: 'internal' | 'resolved' | 'unresolved';
	id: string;
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	commandExitResult: 'success' | 'error';
}

export interface ITerminalQuickFix {
	type: 'command' | 'opener';
	id: string;
	source: string;
}

export interface ITerminalQuickFixCommandAction extends ITerminalQuickFix {
	type: 'command';
	terminalCommand: string;
	// TODO: Should this depend on whether alt is held?
	addNewLine?: boolean;
}
export interface ITerminalQuickFixOpenerAction extends ITerminalQuickFix {
	type: 'opener';
	uri: URI;
}

export interface ITerminalCommandSelector {
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	commandExitResult: 'success' | 'error';
}

export type TerminalQuickFixActionInternal = IAction | ITerminalQuickFixCommandAction | ITerminalQuickFixOpenerAction;
export type TerminalQuickFixCallback = (matchResult: ITerminalCommandMatchResult) => TerminalQuickFixActionInternal[] | TerminalQuickFixActionInternal | undefined;
export type TerminalQuickFixCallbackExtension = (terminalCommand: ITerminalCommand, lines: string[] | undefined, option: ITerminalQuickFixOptions, token: CancellationToken) => Promise<ITerminalQuickFix[] | ITerminalQuickFix | undefined>;

export interface ITerminalQuickFixProvider {
	/**
	 * Provides terminal quick fixes
	 * @param commandMatchResult The command match result for which to provide quick fixes
	 * @param token A cancellation token indicating the result is no longer needed
	 * @return Terminal quick fix(es) if any
	 */
	provideTerminalQuickFixes(terminalCommand: ITerminalCommand, lines: string[] | undefined, option: ITerminalQuickFixOptions, token: CancellationToken): Promise<ITerminalQuickFix[] | ITerminalQuickFix | undefined>;
}
export interface ITerminalCommandMatchResult {
	commandLine: string;
	commandLineMatch: RegExpMatchArray;
	outputMatch?: ITerminalOutputMatch;
}

export interface ITerminalOutputMatch {
	regexMatch: RegExpMatchArray;
	outputLines?: string[];
}

export interface IInternalOptions extends ITerminalQuickFixOptions {
	type: 'internal';
	getQuickFixes: TerminalQuickFixCallback;
}

export interface IResolvedExtensionOptions extends ITerminalQuickFixOptions {
	type: 'resolved';
	getQuickFixes: TerminalQuickFixCallbackExtension;
}

export interface IUnresolvedExtensionOptions extends ITerminalQuickFixOptions {
	type: 'unresolved';
}


/**
 * A matcher that runs on a sub-section of a terminal command's output
 */
export interface ITerminalOutputMatcher {
	/**
	 * A string or regex to match against the unwrapped line. If this is a regex with the multiline
	 * flag, it will scan an amount of lines equal to `\n` instances in the regex + 1.
	 */
	lineMatcher: string | RegExp;
	/**
	 * Which side of the output to anchor the {@link offset} and {@link length} against.
	 */
	anchor: 'top' | 'bottom';
	/**
	 * The number of rows above or below the {@link anchor} to start matching against.
	 */
	offset: number;
	/**
	 * The number of rows to match against, this should be as small as possible for performance
	 * reasons. This is capped at 40.
	 */
	length: number;

	/**
	 * If multiple matches are expected - this will result in {@link outputLines} being returned
	 * when there's a {@link regexMatch} from {@link offset} to {@link length}
	 */
	multipleMatches?: boolean;
}
