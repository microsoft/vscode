/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import type * as vscode from 'vscode';

import { ExtHostSecretState } from 'vs/workbench/api/common/extHostSecretState';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class ExtensionSecrets implements vscode.SecretStorage {

	protected readonly _id: string;
	readonly #secretState: ExtHostSecretState;

	readonly onDidChange: Event<vscode.SecretStorageChangeEvent>;
	readonly disposables = new DisposableStore();

	constructor(extensionDescription: IExtensionDescription, secretState: ExtHostSecretState) {
		this._id = ExtensionIdentifier.toKey(extensionDescription.identifier);
		this.#secretState = secretState;

		this.onDidChange = Event.map(
			Event.filter(this.#secretState.onDidChangePassword, e => e.extensionId === this._id),
			e => ({ key: e.key }),
			this.disposables
		);
	}

	dispose() {
		this.disposables.dispose();
	}

	get(key: string): Promise<string | undefined> {
		return this.#secretState.get(this._id, key);
	}

	store(key: string, value: string): Promise<void> {
		return this.#secretState.store(this._id, key, value);
	}

	delete(key: string): Promise<void> {
		return this.#secretState.delete(this._id, key);
	}
}
