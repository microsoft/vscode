/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBufferRange } from 'xterm';

export interface ITerminalLinkDetector {
	/**
	 * Detects links within the _wrapped_ line range provided and returns them as an array.
	 *
	 * @param startLine The start of the wrapped line. This _will not_ be validated that it is
	 * indeed the start of a wrapped line.
	 * @param endLine The end of the wrapped line.  This _will not_ be validated that it is indeed
	 * the end of a wrapped line.
	 */
	detect(startLine: number, endLine: number): ITerminalLink[] | Promise<ITerminalLink[]>;
}

export interface ITerminalLink {
	/**
	 * The text of the link.
	 */
	text: string;
	/**
	 * The buffer range of the link.
	 */
	bufferRange: IBufferRange;
}
