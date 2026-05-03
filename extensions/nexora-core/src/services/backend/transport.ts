/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { BackendConfig } from '../backendClient';

export type Transport = {
	get: (endpoint: string) => Promise<any>;
	post: (endpoint: string, data: any) => Promise<any>;
	put: (endpoint: string, data?: any) => Promise<any>;
	delete: (endpoint: string) => Promise<any>;
};

export function createTransport(
	config: BackendConfig,
	getMockResponse: (endpoint: string) => any
): Transport {
	return {
		get: async (endpoint: string) => {
			const url = `${config.baseUrl}${endpoint}`;
			try {
				const response = await fetch(url, {
					method: 'GET',
					headers: { 'Content-Type': 'application/json' }
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}

				return await response.json();
			} catch {
				return getMockResponse(endpoint);
			}
		},
		post: async (endpoint: string, data: any) => {
			const url = `${config.baseUrl}${endpoint}`;

			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return await response.json();
		},
		put: async (endpoint: string, data?: any) => {
			const url = `${config.baseUrl}${endpoint}`;

			const response = await fetch(url, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: data ? JSON.stringify(data) : undefined
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return await response.json();
		},
		delete: async (endpoint: string) => {
			const url = `${config.baseUrl}${endpoint}`;

			const response = await fetch(url, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			return await response.json();
		}
	};
}

