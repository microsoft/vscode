/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { ExtensionsRegistry } from '../../services/extensions/common/extensionsRegistry.js';
import { IUriHandlerContribution } from '../../../platform/extensions/common/extensions.js';
import { isBoolean, isObject, isString } from '../../../base/common/types.js';

/**
 * The `contributes.uriHandler` extension point. Declaring CSRF protection here (rather than only at
 * runtime via `registerUriHandler`) makes it statically auditable. See
 * docs/uri-handler-csrf-protection-proposal.md.
 */
export const uriHandlerExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IUriHandlerContribution>({
	extensionPoint: 'uriHandler',
	jsonSchema: {
		description: nls.localize('contributes.uriHandler', "Configures the extension's `vscode.UriHandler` (system-wide `vscode://` deeplinks)."),
		type: 'object',
		properties: {
			csrfProtection: {
				description: nls.localize('contributes.uriHandler.csrfProtection', "Require incoming URIs to carry a valid CSRF token (HMAC-signed by a local process) before they reach the handler. `true` protects every path; an object can override the secret file location and exempt paths that are legitimately web-initiated (e.g. OAuth callbacks)."),
				default: true,
				oneOf: [
					{ type: 'boolean' },
					{
						type: 'object',
						properties: {
							secretFile: {
								type: 'string',
								description: nls.localize('contributes.uriHandler.csrfProtection.secretFile', "Path to the shared secret file. Supports the `${globalStorage}` placeholder, or an absolute path. When omitted, a derivable default under the extension's global storage is used.")
							},
							unprotectedPaths: {
								type: 'array',
								description: nls.localize('contributes.uriHandler.csrfProtection.unprotectedPaths', "Uri paths exempt from CSRF protection — dispatched without a token. Required for web-initiated paths a browser cannot sign, such as OAuth callbacks (e.g. `/did-authenticate`)."),
								items: { type: 'string' }
							}
						}
					}
				]
			}
		}
	}
});

/**
 * Validates `contributes.uriHandler` declarations and surfaces problems in the extension's
 * diagnostics. The contribution is consumed in the extension host (see `ExtHostUrls`); this handler
 * exists to register the schema and report malformed config early.
 */
export class UriHandlerExtensionPoint {

	constructor() {
		uriHandlerExtensionPoint.setHandler((extensions) => {
			for (const extension of extensions) {
				const value = extension.value;
				const collector = extension.collector;

				if (!isObject(value)) {
					collector.error(nls.localize('invalid.uriHandler', "'contributes.uriHandler' must be an object."));
					continue;
				}

				const csrf = value.csrfProtection;
				if (csrf === undefined || isBoolean(csrf)) {
					continue;
				}
				if (!isObject(csrf)) {
					collector.error(nls.localize('invalid.uriHandler.csrfProtection', "'contributes.uriHandler.csrfProtection' must be a boolean or an object."));
					continue;
				}
				if (csrf.unprotectedPaths !== undefined && (!Array.isArray(csrf.unprotectedPaths) || !csrf.unprotectedPaths.every(isString))) {
					collector.error(nls.localize('invalid.uriHandler.unprotectedPaths', "'contributes.uriHandler.csrfProtection.unprotectedPaths' must be an array of strings."));
				}
			}
		});
	}
}
