/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose } from 'vs/base/common/lifecycle';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import type { ILinkProvider } from 'xterm';

export abstract class TerminalBaseLinkProvider implements ILinkProvider {
	private _activeLinks: TerminalLink[] | undefined;

	async provideLinks(bufferLineNumber: number, callback: (links: TerminalLink[] | undefined) => void): Promise<void> {
		if (this._activeLinks) {
			dispose(this._activeLinks);
		}
		this._activeLinks = await this._provideLinks(bufferLineNumber);
		callback(this._activeLinks);
	}

	protected abstract _provideLinks(bufferLineNumber: number): Promise<TerminalLink[]> | TerminalLink[];
}
