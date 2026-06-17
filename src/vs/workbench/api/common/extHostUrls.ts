/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { MainContext, ExtHostUrlsShape, MainThreadUrlsShape } from './extHost.protocol.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { ExtensionIdentifier, ExtensionIdentifierSet, IExtensionDescription, IUriHandlerCsrfProtection } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtensionStoragePaths } from './extHostStoragePaths.js';
import { IExtHostUriHandlerCsrfSecret } from './extHostUriHandlerCsrfSecret.js';
import { stripCsrfToken, verifyCsrfToken } from '../../services/extensions/common/uriHandlerCsrf.js';

const SECRET_FILE_NAME = 'uri-csrf.secret';

/** Resolved CSRF configuration for a registered handler, or `false` if protection is off. */
type ResolvedCsrf = false | { readonly secretFile?: URI; readonly unprotectedPaths: ReadonlySet<string> };

interface IRegisteredHandler {
	readonly handler: vscode.UriHandler;
	readonly extension: IExtensionDescription;
	readonly csrf: ResolvedCsrf;
}

function resolveCsrfOption(option: vscode.UriHandlerOptions['csrfProtection']): ResolvedCsrf {
	if (!option) {
		return false;
	}
	if (option === true) {
		return { unprotectedPaths: new Set() };
	}
	return {
		secretFile: option.secretFile ? URI.revive(option.secretFile) : undefined,
		unprotectedPaths: new Set(option.unprotectedPaths ?? []),
	};
}

export class ExtHostUrls implements ExtHostUrlsShape {

	declare _serviceBrand: undefined;

	private static HandlePool = 0;
	private readonly _proxy: MainThreadUrlsShape;

	private handles = new ExtensionIdentifierSet();
	private handlers = new Map<number, IRegisteredHandler>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtensionStoragePaths private readonly storagePaths: IExtensionStoragePaths,
		@IExtHostUriHandlerCsrfSecret private readonly csrfSecret: IExtHostUriHandlerCsrfSecret,
		@ILogService private readonly logService: ILogService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadUrls);
	}

	registerUriHandler(extension: IExtensionDescription, handler: vscode.UriHandler, options?: vscode.UriHandlerOptions): vscode.Disposable {
		const extensionId = extension.identifier;
		if (this.handles.has(extensionId)) {
			throw new Error(`Protocol handler already registered for extension ${extensionId}`);
		}

		const handle = ExtHostUrls.HandlePool++;
		this.handles.add(extensionId);
		this.handlers.set(handle, { handler, extension, csrf: this.resolveCsrf(extension, options?.csrfProtection) });
		this._proxy.$registerUriHandler(handle, extensionId, extension.displayName || extension.name);

		return toDisposable(() => {
			this.handles.delete(extensionId);
			this.handlers.delete(handle);
			this._proxy.$unregisterUriHandler(handle);
		});
	}

	/** Manifest `contributes.uriHandler.csrfProtection` is authoritative; the runtime option is a fallback. */
	private resolveCsrf(extension: IExtensionDescription, runtimeOption: vscode.UriHandlerOptions['csrfProtection']): ResolvedCsrf {
		const manifest = extension.contributes?.uriHandler?.csrfProtection;
		if (manifest !== undefined) {
			return this.resolveManifestCsrf(extension, manifest);
		}
		return resolveCsrfOption(runtimeOption);
	}

	private resolveManifestCsrf(extension: IExtensionDescription, csrf: boolean | IUriHandlerCsrfProtection): ResolvedCsrf {
		if (!csrf) {
			return false;
		}
		if (csrf === true) {
			return { unprotectedPaths: new Set() };
		}
		return {
			secretFile: csrf.secretFile ? this.resolveSecretPath(this.storagePaths.globalValue(extension), csrf.secretFile) : undefined,
			unprotectedPaths: new Set(csrf.unprotectedPaths ?? []),
		};
	}

	private resolveSecretPath(globalStorage: URI, raw: string): URI {
		const placeholder = '${globalStorage}';
		if (raw.startsWith(placeholder)) {
			const rest = raw.slice(placeholder.length).replace(/^[\\/]+/, '');
			return rest ? URI.joinPath(globalStorage, rest) : globalStorage;
		}
		if (raw.includes('${')) {
			this.logService.warn(`[uri-csrf] secretFile '${raw}' contains an unsupported placeholder (only \${globalStorage} is recognized); treating it as a literal path.`);
		}
		return URI.file(raw);
	}

	async $handleExternalUri(handle: number, uri: UriComponents): Promise<void> {
		const entry = this.handlers.get(handle);
		if (!entry) {
			return;
		}

		const target = URI.revive(uri);

		if (entry.csrf) {
			// Exempt paths (e.g. OAuth callbacks) are dispatched without a token.
			if (entry.csrf.unprotectedPaths.has(target.path)) {
				this.invoke(entry.handler, target);
				return;
			}
			const accepted = await this.verifyCsrf(entry.extension, entry.csrf, target);
			if (!accepted) {
				return; // rejected — handler is never invoked
			}
			this.invoke(entry.handler, stripCsrfToken(target));
			return;
		}

		this.invoke(entry.handler, target);
	}

	/**
	 * Pre-activation CSRF check fanned out from the workbench. The owning host (where the secret file
	 * lives) returns a verdict; other hosts see no secret and return 'unhandled'. The manifest policy
	 * is passed in (the workbench has it), so this does not depend on the extension registry.
	 */
	async $verifyCsrf(extensionId: ExtensionIdentifier, uri: UriComponents, secretFile?: string): Promise<'verified' | 'rejected' | 'unhandled'> {
		const target = URI.revive(uri);
		// globalValue only reads `extension.identifier`, so a minimal stub suffices here.
		const globalStorage = this.storagePaths.globalValue({ identifier: extensionId } as IExtensionDescription);
		const file = secretFile ? this.resolveSecretPath(globalStorage, secretFile) : URI.joinPath(globalStorage, SECRET_FILE_NAME);

		// Read-only: never create the secret in the pre-check, so a host that does not own the
		// extension simply sees no file and returns 'unhandled'.
		const secret = await this.csrfSecret.getSecret(file, false);
		if (!secret) {
			return 'unhandled';
		}

		const result = await verifyCsrfToken(secret, target.path, target.query);
		if (result.ok) {
			return 'verified';
		}
		this.logService.warn(`[uri-csrf] rejected URI for ${extensionId.value} (path: ${target.path}, reason: ${result.reason})`);
		this._proxy.$notifyCsrfDeeplinkRejection(extensionId, extensionId.value);
		return 'rejected';
	}

	private async verifyCsrf(extension: IExtensionDescription, csrf: Exclude<ResolvedCsrf, false>, uri: URI): Promise<boolean> {
		const secretFile = csrf.secretFile
			?? URI.joinPath(this.storagePaths.globalValue(extension), SECRET_FILE_NAME);

		let secret: Uint8Array | undefined;
		try {
			secret = await this.csrfSecret.getSecret(secretFile);
		} catch (err) {
			onUnexpectedError(err);
			secret = undefined;
		}

		const result = await verifyCsrfToken(secret, uri.path, uri.query);
		if (result.ok) {
			return true;
		}

		// Always log (redacted: never the token or raw payload), and surface a notification by default.
		this.logService.warn(`[uri-csrf] rejected URI for ${extension.identifier.value} (path: ${uri.path}, reason: ${result.reason})`);
		this._proxy.$notifyCsrfDeeplinkRejection(extension.identifier, extension.displayName || extension.name);
		return false;
	}

	private invoke(handler: vscode.UriHandler, uri: URI): void {
		try {
			handler.handleUri(uri);
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	async createAppUri(uri: URI): Promise<vscode.Uri> {
		return URI.revive(await this._proxy.$createAppUri(uri));
	}
}

export interface IExtHostUrlsService extends ExtHostUrls { }
export const IExtHostUrlsService = createDecorator<IExtHostUrlsService>('IExtHostUrlsService');
