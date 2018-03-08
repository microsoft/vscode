/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Model } from './model';
import { Uri } from 'vscode';

export interface InputBox {
	value: string;
}

export interface Repository {
	readonly rootUri: Uri;
	readonly inputBox: InputBox;
}

export interface API {
	getRepositories(): Promise<Repository[]>;
}

export function createApi(modelPromise: Promise<Model>) {
	return {
		async getRepositories(): Promise<Repository[]> {
			const model = await modelPromise;

			return model.repositories.map(repository => ({
				rootUri: Uri.file(repository.root),
				inputBox: {
					set value(value: string) {
						repository.inputBox.value = value;
					},
					get value(): string {
						return repository.inputBox.value;
					}
				}
			}));
		}
	};
}