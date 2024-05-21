/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBufferLine, IBufferRange, Terminal } from '@xterm/xterm';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { IParsedLink } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ITerminalExternalLinkProvider } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Event } from 'vs/base/common/event';
import { ITerminalBackend } from 'vs/platform/terminal/common/terminal';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import type { IHoverAction } from 'vs/base/browser/ui/hover/hover';

export const ITerminalLinkProviderService = createDecorator<ITerminalLinkProviderService>('terminalLinkProviderService');
export interface ITerminalLinkProviderService {
	readonly _serviceBrand: undefined;

	readonly linkProviders: ReadonlySet<ITerminalExternalLinkProvider>;

	readonly onDidAddLinkProvider: Event<ITerminalExternalLinkProvider>;
	readonly onDidRemoveLinkProvider: Event<ITerminalExternalLinkProvider>;

	// TODO: Currently only a single link provider is supported; the one registered by the ext host
	registerLinkProvider(provider: ITerminalExternalLinkProvider): IDisposable;
}

export interface ITerminalLinkResolver {
	resolveLink(processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> }, link: string, uri?: URI): Promise<ResolvedLink>;
}

/**
 * A link detector can search for and return links within the xterm.js buffer. A single link
 * detector can return multiple links of differing types.
 */
export interface ITerminalLinkDetector {
	/**
	 * The xterm.js instance this detector belongs to.
	 */
	readonly xterm: Terminal;

	/**
	 * The maximum link length possible for this detector, this puts a cap on how much of a wrapped
	 * line to consider to prevent performance problems.
	 */
	readonly maxLinkLength: number;

	/**
	 * Detects links within the _wrapped_ line range provided and returns them as an array.
	 *
	 * @param lines The individual buffer lines that make up the wrapped line.
	 * @param startLine The start of the wrapped line. This _will not_ be validated that it is
	 * indeed the start of a wrapped line.
	 * @param endLine The end of the wrapped line.  This _will not_ be validated that it is indeed
	 * the end of a wrapped line.
	 */
	detect(lines: IBufferLine[], startLine: number, endLine: number): ITerminalSimpleLink[] | Promise<ITerminalSimpleLink[]>;
}

export interface ITerminalSimpleLink {
	/**
	 * The text of the link.
	 */
	text: string;

	parsedLink?: IParsedLink;

	/**
	 * The buffer range of the link.
	 */
	readonly bufferRange: IBufferRange;

	/**
	 * The type of link, which determines how it is handled when activated.
	 */
	readonly type: TerminalLinkType;

	/**
	 * The URI of the link if it has been resolved.
	 */
	uri?: URI;

	/**
	 * An optional full line to be used for context when resolving.
	 */
	contextLine?: string;

	/**
	 * The location or selection range of the link.
	 */
	selection?: ITextEditorSelection;

	/**
	 * Whether to trim a trailing colon at the end of a path.
	 */
	disableTrimColon?: boolean;

	/**
	 * A hover label to override the default for the type.
	 */
	label?: string;

	/**
	 * An optional set of actions to show in the hover's status bar.
	 */
	actions?: IHoverAction[];

	/**
	 * An optional method to call when the link is activated. This should be used when there is are
	 * no registered opener for this link type.
	 */
	activate?(text: string): void;
}

export type TerminalLinkType = TerminalBuiltinLinkType | ITerminalExternalLinkType;

export const enum TerminalBuiltinLinkType {
	/**
	 * The link is validated to be a file on the file system and will open an editor.
	 */
	LocalFile = 'LocalFile',

	/**
	 * The link is validated to be a folder on the file system and is outside the workspace. It will
	 * reveal the folder within the explorer.
	 */
	LocalFolderOutsideWorkspace = 'LocalFolderOutsideWorkspace',

	/**
	 * The link is validated to be a folder on the file system and is within the workspace and will
	 * reveal the folder within the explorer.
	 */
	LocalFolderInWorkspace = 'LocalFolderInWorkspace',

	/**
	 * A low confidence link which will search for the file in the workspace. If there is a single
	 * match, it will open the file; otherwise, it will present the matches in a quick pick.
	 */
	Search = 'Search',

	/**
	 * A link whose text is a valid URI.
	 */
	Url = 'Url'
}

export interface ITerminalExternalLinkType {
	id: string;
}

export interface ITerminalLinkOpener {
	open(link: ITerminalSimpleLink): Promise<void>;
}

export type ResolvedLink = IResolvedValidLink | null;

export interface IResolvedValidLink {
	uri: URI;
	link: string;
	isDirectory: boolean;
}

export type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
