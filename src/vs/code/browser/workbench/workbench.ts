/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from 'vs/workbench/workbench.web.main';
import { URI } from 'vs/base/common/uri';
import {
	IWorkbenchConstructionOptions,
	IWorkspace,
} from 'vs/workbench/browser/web.api';
import { ISecretStorageProvider } from 'vs/platform/secrets/common/secrets';
declare const window: any;
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export class SecretStorageProvider implements ISecretStorageProvider {
	public type: 'persisted';
	private static instance: SecretStorageProvider;
	public getAuthToken: () => Promise<string>;

	constructor() {
		this.type = 'persisted';
		// Capture the window function
		this.getAuthToken = (window as any).globalIdeState.getAuthToken;
		(window as any).globalIdeState.getAuthToken = () => {
			throw new Error('This function is no longer available');
		};
	}

	public static getInstance(): SecretStorageProvider {
		if (!SecretStorageProvider.instance) {
			SecretStorageProvider.instance = new SecretStorageProvider();
		}
		return SecretStorageProvider.instance;
	}

	async get(key: string): Promise<string | undefined> {
		let extensionKey;
		try {
			// Check if the key is for an extension (it's a JSON string)
			extensionKey = JSON.parse(key);
		} catch (err) {
			// Only keys for extensions are stored as JSON so this must not be an extension secret.
		}
		if (
			extensionKey?.extensionId === 'membrane.membrane' &&
			extensionKey?.key === 'membraneApiToken'
		) {
			try {
				return await this.getAuthToken();
			} catch (error) {
				throw new Error(`Failed to read Membrane API token: ${error}`);
			}
		}
		return localStorage.getItem(key) ?? undefined;
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
	let config: Writeable<IWorkbenchConstructionOptions>;

	if (window.product) {
		config = window.product;
	} else {
		const result = await fetch('/product.json');
		config = await result.json();
	}

	const isHttps = window.location.protocol === 'https:';
	const isDev = window.location.hostname === 'localhost';
	const extensionUrl = {
		scheme: isHttps ? 'https' : 'http',
		path: isDev ? '/membrane-dev' : '/membrane',
	};

	config.additionalBuiltinExtensions = [URI.revive(extensionUrl)];

	config.workspaceProvider = {
		// IMPORTANT: this filename must match the filename used in `memfs.ts`.
		// TODO: Somehow use product.json to configure that globally
		workspace: { workspaceUri: URI.parse('memfs:/membrane.code-workspace') },
		payload: {
			'skipReleaseNotes': 'true',
			'skipWelcome': 'true',
		},
		trusted: true,
		open: async (
			_workspace: IWorkspace,
			_options?: { reuse?: boolean; payload?: object }
		) => {
			return true;
		},
	};

	config.secretStorageProvider = SecretStorageProvider.getInstance();

	config.commands = [
		// Used to refresh the page from the extension when a new version of the IDE is known to exist.
		{ id: 'membrane.refreshPage', handler: () => window.location.reload() },
		{
			id: 'membrane.getLaunchParams', handler: () => {
				// eslint-disable-next-line no-restricted-syntax
				const meta = document.querySelector('meta[name="membrane-launch-params"]') as HTMLMetaElement;
				return meta?.content ?? '';
			}
		}];

	config.homeIndicator = { href: window.location.origin, icon: 'home', title: 'Membrane Home' };
	// eslint-disable-next-line no-restricted-syntax
	const domElement = document.body;
	create(domElement, config);
})();

export async function membraneApi(
	method: 'GET' | 'POST',
	path: `/${string}`,
	body?: BodyInit
): Promise<Response> {
	const isDev = window.location.hostname === 'localhost';
	const baseUrl = isDev ? 'http://localhost:8091' : 'https://api.membrane.io';

	const secretProvider = SecretStorageProvider.getInstance();
	const token = await secretProvider.getAuthToken();

	if (!token) {
		throw new Error('Failed to retrieve Membrane API token');
	}

	return await fetch(`${baseUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body,
	});
}