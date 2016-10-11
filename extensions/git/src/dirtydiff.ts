/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, TextEditor, window } from 'vscode';
import { IDisposable, dispose, mapEvent } from './util';

type TextEditorsEvent = Event<TextEditor[]>;

export class DirtyDiffDecorator implements IDisposable {

	private disposables: IDisposable[] = [];

	constructor() {
		mapEvent(window.onDidChangeActiveTextEditor, () => window.visibleTextEditors)
			(this.onDidVisibleEditorsChange, this, this.disposables);
	}

	private onDidVisibleEditorsChange(textEditors: TextEditor[]) {
		// TODO
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}