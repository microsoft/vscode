/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WebviewInboundMessage =
	| { type: 'sendMessage'; message: string }
	| { type: 'checkBackend' }
	| { type: 'generateCode'; prompt: string; connector: string }
	| { type: 'connectGitHub' }
	| { type: 'connectVercel' }
	| { type: 'deployProject'; prompt: string; repoName: string; projectName: string }
	| { type: 'checkAuthStatus' };

export type WebviewOutboundMessage =
	| { type: 'addMessage'; role: 'user' | 'assistant'; content: string; isLoading: boolean }
	| { type: 'backendStatus'; connected: boolean }
	| { type: 'authStatus'; github: boolean; vercel: boolean };

export type ChatInitialState = {
	connected: boolean;
	auth: {
		github: boolean;
		vercel: boolean;
	};
};

