/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Static, Type } from '@sinclair/typebox';
import * as lsp from 'vscode-languageserver-protocol';

export const DidChangeAuthParams = Type.Object({
	accessToken: Type.Optional(Type.String({ minLength: 1 })),
	handle: Type.Optional(Type.String({ minLength: 1 })),
	login: Type.Optional(Type.String({ minLength: 1 })),
	githubAppId: Type.Optional(Type.String({ minLength: 1 })),
	apiUrl: Type.Optional(Type.String({})),
	serverUrl: Type.Optional(Type.String({})),
	tokenEndpoint: Type.Optional(Type.String({})),
});
export type DidChangeAuthParams = Static<typeof DidChangeAuthParams>;

export namespace DidChangeAuthNotification {
	export const method = 'github/didChangeAuth';
	export const type = new lsp.ProtocolNotificationType<DidChangeAuthParams, void>(method);
}
