/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from 'vs/workbench/workbench.web.main';
import { URI, UriComponents } from 'vs/base/common/uri';
import {
	IWorkbenchConstructionOptions,
	IWorkspace,
	IWorkspaceProvider,
} from 'vs/workbench/browser/web.api';
import { ISecretStorageProvider } from 'vs/platform/secrets/common/secrets';
declare const window: any;
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

class SecretStorageProvider implements ISecretStorageProvider {
	public type: 'persisted';
	constructor() {
		this.type = 'persisted';
	}
	async get(key: any): Promise<string | undefined> {
		const secret = JSON.parse(key);
		if (
			secret.extensionId === 'membrane.membrane' &&
			secret.key === 'membraneApiToken'
		) {
			const allKeys = Object.keys(localStorage);
			// Find the first key that matches the pattern of auth0 React
			const filteredKeys = allKeys.filter((key) =>
				key.includes('::default::openid')
			);
			if (filteredKeys.length > 0) {
				const firstMatchingKey = filteredKeys[0];
				const values = localStorage.getItem(firstMatchingKey);
				const value = JSON.parse(values!);
				return value.body.access_token;
			} else {
				throw new Error('No matching keys found');
			}
		}
		const value = localStorage.getItem(secret.key);
		if (!value) {
			throw new Error('Secret not found');
		}
		return value;
	}
	async set(key: string, value: string): Promise<void> {
		localStorage.setItem(key, value);
	}
	async delete(key: string): Promise<void> {
		localStorage.removeItem(key);
	}
}

(async function () {
	// create workbench
	let config: Writeable<IWorkbenchConstructionOptions> & {
		folderUri?: UriComponents;
		workspaceUri?: UriComponents;
		domElementId?: string;
	} = {};

	if (window.product) {
		config = window.product;
	} else {
		const result = await fetch('/product.json');
		config = await result.json();
	}

	const isHttps = window.location.protocol === 'https:';
	const extUrl = {
		scheme: isHttps ? 'https' : 'http',
		path: '/membrane',
	};

	config.additionalBuiltinExtensions = [URI.revive(extUrl)];

	let workspace;
	if (config.folderUri) {
		workspace = { folderUri: URI.revive(config.folderUri) };
	} else if (config.workspaceUri) {
		workspace = { workspaceUri: URI.revive(config.workspaceUri) };
	} else {
		workspace = undefined;
	}

	if (workspace) {
		const workspaceProvider: IWorkspaceProvider = {
			workspace,
			open: async (
				workspace: IWorkspace,
				options?: { reuse?: boolean; payload?: object }
			) => true,
			trusted: true,
		};
		config = { ...config, workspaceProvider };
	}

	const domElement =
		(!!config.domElementId && document.getElementById(config.domElementId)) ||
		document.body;

	config = { ...config, secretStorageProvider: new SecretStorageProvider() };

	create(domElement, config);
})();
