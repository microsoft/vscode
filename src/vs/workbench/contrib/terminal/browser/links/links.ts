/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBufferLine, IBufferRange, Terminal } from 'xterm';
import { URI } from 'vs/base/common/uri';

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

	/**
	 * The URI of the link if it has been resolved.
	 */
	uri?: URI

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
	 * The link is validated to be a file on the file system and will open an editor.
	 */
	LocalFile,

	/**
	 * The link is validated to be a folder on the file system and is outside the workspace. It will
	 * reveal the folder within the explorer.
	 */
	LocalFolderOutsideWorkspace,

	/**
	 * The link is validated to be a folder on the file system and is within the workspace and will
	 * reveal the folder within the explorer.
	 */
	LocalFolderInWorkspace,

	/**
	 * The link starts with a protocol like https://, file://, etc. and will be opened depending on
	 * the protocol.
	 */
	Protocol,

	/**
	 * A low confidence link which will search for the file in the workspace. If there is a single
	 * match, it will open the file; otherwise, it will present the matches in a quick pick.
	 */
	Search,

	/**
	 * A link whose text is a valid URI.
	 */
	Url
}

export interface ITerminalLinkOpener {
	open(link: ITerminalSimpleLink): Promise<void>;
}
