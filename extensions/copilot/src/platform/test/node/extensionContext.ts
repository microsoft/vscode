/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { Memento, Uri } from 'vscode';
import { ExtensionMode } from '../../../util/common/test/shims/enums';
import { dirname } from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { BrandedService } from '../../../util/vs/platform/instantiation/common/instantiation';

export function constructGlobalStateMemento(globalStatePath: string): Memento {
	// Check if the JSON file at globalStatePath exists, if not create it
	if (!existsSync(globalStatePath)) {
		mkdirSync(dirname(globalStatePath), { recursive: true });
		writeFileSync(globalStatePath, '{}', 'utf8');
	}

	return {
		get: (key: string, defaultValue?: any) => {
			const globalState = JSON.parse(readFileSync(globalStatePath, 'utf8'));
			return globalState[key] ?? defaultValue;
		},
		keys: () => {
			const globalState = JSON.parse(readFileSync(globalStatePath, 'utf8'));
			return Object.keys(globalState);
		},
		update: (key: string, value: any) => {
			const globalState = JSON.parse(readFileSync(globalStatePath, 'utf8'));
			globalState[key] = value;
			writeFileSync(globalStatePath, JSON.stringify(globalState), 'utf8');
			return Promise.resolve();
		}
	};
}

function createInMemoryMemento(): Memento {
	const state = new Map<string, any>();

	return {
		get: (key: string, defaultValue?: any) => {
			return state.get(key) ?? defaultValue;
		},
		keys: () => {
			return Object.keys(state);
		},
		update: (key: string, value: any) => {
			state.set(key, value);
			return Promise.resolve();
		}
	};
}

function constructGlobalStoragePath(globalStoragePath: string): URI {

	if (!existsSync(globalStoragePath)) {
		// Create the folder if it doesn't exist
		mkdirSync(globalStoragePath, { recursive: true });
	}
	return URI.file(globalStoragePath);
}

export class MockExtensionContext implements BrandedService {
	_serviceBrand = undefined;
	extension = { id: 'GitHub.copilot-chat' } as any;
	extensionUri = URI.from({ scheme: 'file', path: '/mock-extension' });
	extensionMode = ExtensionMode.Test;
	subscriptions = [];
	globalStorageUri: Uri | undefined;
	storageUri: Uri | undefined;
	workspaceState = createInMemoryMemento();

	constructor(
		globalStoragePath?: string,
		readonly globalState: Memento = createInMemoryMemento() as any,
		storagePath?: string,
	) {
		this.globalStorageUri = globalStoragePath ? constructGlobalStoragePath(globalStoragePath) : undefined as any;
		this.storageUri = storagePath ? URI.file(storagePath) : globalStoragePath ? constructGlobalStoragePath(globalStoragePath) : undefined;
	}
}
