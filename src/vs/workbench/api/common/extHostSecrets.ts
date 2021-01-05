/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

import { ExtHostSecretState } from 'vs/workbench/api/common/exHostSecretState';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';

export class ExtensionSecrets implements vscode.SecretStorage {

	protected readonly _id: string;
	protected readonly _secretState: ExtHostSecretState;

	private _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;


	constructor(extensionDescription: IExtensionDescription, secretState: ExtHostSecretState) {
		this._id = ExtensionIdentifier.toKey(extensionDescription.identifier);
		this._secretState = secretState;

		this._secretState.onDidChangePassword(_ => this._onDidChange.fire());
	}

	get(key: string): Promise<string | undefined> {
		return this._secretState.get(this._id, key);
	}

	set(key: string, value: string): Promise<void> {
		return this._secretState.set(this._id, key, value);
	}

	delete(key: string): Promise<void> {
		return this._secretState.delete(this._id, key);
	}
}
