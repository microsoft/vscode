/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IErdosConsoleInstance } from '../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';

export class MainThreadConsole {
	constructor(
		private readonly _console: IErdosConsoleInstance
	) {
	}

	getLanguageId(): string {
		return this._console.runtimeMetadata.languageId;
	}

	pasteText(text: string): void {
		this._console.pasteText(text);
	}
}

