/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { Event, EventEmitter, Memento, Uri } from 'vscode';

export const contextKeyPrefix = 'github.context|';

export class ContextStore<T> {
	private _onDidChange = new EventEmitter<Uri>();
	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	constructor(private readonly memento: Memento, private readonly scheme: string) { }

	delete(uri: Uri) {
		return this.set(uri, undefined);
	}

	get(uri: Uri): T | undefined {
		return this.memento.get<T>(`${contextKeyPrefix}${uri.toString()}`);
	}


	async set(uri: Uri, context: T | undefined) {
		if (uri.scheme !== this.scheme) {
			throw new Error(`Invalid context scheme: ${uri.scheme}`);
		}

		await this.memento.update(`${contextKeyPrefix}${uri.toString()}`, context);
		this._onDidChange.fire(uri);
	}
}
