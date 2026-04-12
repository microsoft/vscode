"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
// For easy access to mixin client ID and secret
//
// NOTE: GitHub client secrets cannot be secured when running in a native client so in other words, the client secret is
// not really a secret... so we allow the client secret in code. It is brought in before we publish VS Code. Reference:
// https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app#client-secrets
exports.Config = {
    gitHubClientId: '01ab8ac9400c4e429b23'
};
//# sourceMappingURL=config.js.map