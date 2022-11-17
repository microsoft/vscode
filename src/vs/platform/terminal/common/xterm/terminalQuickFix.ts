/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { IAction } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { UriComponents } from 'vs/base/common/uri';
import { ITerminalOutputMatcher, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ITerminalProfileContribution } from 'vs/platform/terminal/common/terminal';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import { Terminal } from 'xterm-headless';

export interface ITerminalCommandSelector {
	id: string;
	extensionId: string;
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	exitStatus: boolean;
}


export interface ITerminalQuickFixOptions {
	type: 'internal' | 'resolved' | 'unresolved';
	id: string;
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	exitStatus: boolean;
}

export interface ITerminalQuickFix {
	type: 'command' | 'opener';
	id?: string;
}

export interface ITerminalQuickFixCommandAction extends ITerminalQuickFix {
	type: 'command';
	terminalCommand: string;
	id: string;
	// TODO: Should this depend on whether alt is held?
	addNewLine?: boolean;
}
export interface ITerminalQuickFixOpenerAction extends ITerminalQuickFix {
	type: 'opener';
	id: string;
	uri: UriComponents;
}


export interface ITerminalCommandSelector {
	commandLineMatcher: string | RegExp;
	outputMatcher?: ITerminalOutputMatcher;
	exitStatus: boolean;
}

export type TerminalQuickFixActionInternal = IAction | ITerminalQuickFixCommandAction | ITerminalQuickFixOpenerAction;
export type TerminalQuickFixCallback = (matchResult: ITerminalCommandMatchResult) => TerminalQuickFixActionInternal[] | TerminalQuickFixActionInternal | undefined;
export type TerminalQuickFixCallbackExtension = (terminalCommand: ITerminalCommand, terminal: Terminal, option: ITerminalQuickFixOptions, token: CancellationToken) => Promise<ITerminalQuickFix[] | ITerminalQuickFix | undefined>;

export interface ITerminalQuickFixProvider {
	/**
	 * Provides terminal quick fixes
	 * @param commandMatchResult The command match result for which to provide quick fixes
	 * @param token A cancellation token indicating the result is no longer needed
	 * @return Terminal quick fix(es) if any
	 */
	provideTerminalQuickFixes(terminalCommand: ITerminalCommand, terminal: Terminal, option: ITerminalQuickFixOptions, token: CancellationToken): Promise<ITerminalQuickFix[] | ITerminalQuickFix | undefined>;
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

export interface ITerminalContributions {
	profiles?: ITerminalProfileContribution[];
	quickFixes?: ITerminalCommandSelector[];
}

export interface IExtensionTerminalQuickFix extends ITerminalQuickFixOptions {
	extensionIdentifier: string;
}
