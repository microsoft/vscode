/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBufferRange, Terminal } from 'xterm';

export interface ITerminalLinkDetector {
	/**
	 * The xterm.js instance this detector belongs to.
	 */
	readonly xterm: Terminal;

	/**
	 * Detects links within the _wrapped_ line range provided and returns them as an array.
	 *
	 * @param startLine The start of the wrapped line. This _will not_ be validated that it is
	 * indeed the start of a wrapped line.
	 * @param endLine The end of the wrapped line.  This _will not_ be validated that it is indeed
	 * the end of a wrapped line.
	 */
	detect(startLine: number, endLine: number): ITerminalSimpleLink[] | Promise<ITerminalSimpleLink[]>;
}

export interface ITerminalSimpleLink {
	/**
	 * The text of the link.
	 */
	text: string;

	/**
	 * The buffer range of the link.
	 */
	readonly bufferRange: IBufferRange;

	/**
	 * The type of link, which determines how it is handled when activated.
	 */
	readonly type: TerminalLinkType;
}

export const enum TerminalLinkType {
	/**
	 * The link is validated on the file system and will open an editor.
	 */
	Local,

	/**
	 * The link starts with a protocol like https://, file://, etc. and will be opened depending on
	 * the protocol.
	 */
	Protocol,

	/**
	 * A low confidence link which will search for the file in the workspace, if there is a single
	 * match it will open the file, otherwise it will present a quick pick searching the workspace.
	 */
	Search
}

export interface ITerminalLinkOpener {
	open(link: ITerminalSimpleLink): Promise<void>;
}
