/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Transport } from './transport';

export function createAuthApi(transport: Transport) {
	return {
		getAuthStatus: async (userId: string = 'default'): Promise<{ github_connected: boolean; vercel_connected: boolean }> => {
			try {
				const response = await transport.get(`/api/auth/status?user_id=${userId}`);
				return response || { github_connected: false, vercel_connected: false };
			} catch {
				return { github_connected: false, vercel_connected: false };
			}
		},

		getGitHubAuthUrl: async (userId: string = 'default'): Promise<{ authorization_url: string } | null> => {
			try {
				return await transport.get(`/api/auth/github/connect?user_id=${userId}`);
			} catch {
				return null;
			}
		},

		getVercelAuthUrl: async (userId: string = 'default'): Promise<{ authorization_url: string } | null> => {
			try {
				return await transport.get(`/api/auth/vercel/connect?user_id=${userId}`);
			} catch {
				return null;
			}
		},

		disconnectGitHub: async (userId: string = 'default'): Promise<{ status: string }> => {
			try {
				return await transport.post(`/api/auth/github/disconnect?user_id=${userId}`, {});
			} catch {
				return { status: 'error' };
			}
		},

		disconnectVercel: async (userId: string = 'default'): Promise<{ status: string }> => {
			try {
				return await transport.post(`/api/auth/vercel/disconnect?user_id=${userId}`, {});
			} catch {
				return { status: 'error' };
			}
		}
	};
}

