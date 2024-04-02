/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WindowIdleValue } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { Schemas, matchesScheme } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService, OpenOptions } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { configureOpenerTrustedDomainsHandler, readAuthenticationTrustedDomains, readStaticTrustedDomains, readWorkspaceTrustedDomains } from 'vs/workbench/contrib/url/browser/trustedDomains';
import { testUrlMatchesGlob } from 'vs/workbench/contrib/url/common/urlGlob';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class OpenerValidatorContributions implements IWorkbenchContribution {

	private _readWorkspaceTrustedDomainsResult: WindowIdleValue<Promise<string[]>>;
	private _readAuthenticationTrustedDomainsResult: WindowIdleValue<Promise<string[]>>;

	constructor(
		@IOpenerService private readonly _openerService: IOpenerService,
		@IStorageService private readonly _storageService: IStorageService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IProductService private readonly _productService: IProductService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IEditorService private readonly _editorService: IEditorService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		this._openerService.registerValidator({ shouldOpen: (uri, options) => this.validateLink(uri, options) });

		this._readAuthenticationTrustedDomainsResult = new WindowIdleValue(mainWindow, () =>
			this._instantiationService.invokeFunction(readAuthenticationTrustedDomains));
		this._authenticationService.onDidRegisterAuthenticationProvider(() => {
			this._readAuthenticationTrustedDomainsResult?.dispose();
			this._readAuthenticationTrustedDomainsResult = new WindowIdleValue(mainWindow, () =>
				this._instantiationService.invokeFunction(readAuthenticationTrustedDomains));
		});

		this._readWorkspaceTrustedDomainsResult = new WindowIdleValue(mainWindow, () =>
			this._instantiationService.invokeFunction(readWorkspaceTrustedDomains));
		this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			this._readWorkspaceTrustedDomainsResult?.dispose();
			this._readWorkspaceTrustedDomainsResult = new WindowIdleValue(mainWindow, () =>
				this._instantiationService.invokeFunction(readWorkspaceTrustedDomains));
		});
	}

	async validateLink(resource: URI | string, openOptions?: OpenOptions): Promise<boolean> {
		if (!matchesScheme(resource, Schemas.http) && !matchesScheme(resource, Schemas.https)) {
			return true;
		}

		if (openOptions?.fromWorkspace && this._workspaceTrustService.isWorkspaceTrusted() && !this._configurationService.getValue('workbench.trustedDomains.promptInTrustedWorkspace')) {
			return true;
		}

		const originalResource = resource;
		let resourceUri: URI;
		if (typeof resource === 'string') {
			resourceUri = URI.parse(resource);
		} else {
			resourceUri = resource;
		}
		const { scheme, authority, path, query, fragment } = resourceUri;

		const domainToOpen = `${scheme}://${authority}`;
		const [workspaceDomains, userDomains] = await Promise.all([this._readWorkspaceTrustedDomainsResult.value, this._readAuthenticationTrustedDomainsResult.value]);
		const { defaultTrustedDomains, trustedDomains, } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
		const allTrustedDomains = [...defaultTrustedDomains, ...trustedDomains, ...userDomains, ...workspaceDomains];

		if (isURLDomainTrusted(resourceUri, allTrustedDomains)) {
			return true;
		} else {
			let formattedLink = `${scheme}://${authority}${path}`;

			const linkTail = `${query ? '?' + query : ''}${fragment ? '#' + fragment : ''}`;


			const remainingLength = Math.max(0, 60 - formattedLink.length);
			const linkTailLengthToKeep = Math.min(Math.max(5, remainingLength), linkTail.length);

			if (linkTailLengthToKeep === linkTail.length) {
				formattedLink += linkTail;
			} else {
				// keep the first char ? or #
				// add ... and keep the tail end as much as possible
				formattedLink += linkTail.charAt(0) + '...' + linkTail.substring(linkTail.length - linkTailLengthToKeep + 1);
			}

			const { result } = await this._dialogService.prompt<boolean>({
				type: Severity.Info,
				message: localize(
					'openExternalLinkAt',
					'Do you want {0} to open the external website?',
					this._productService.nameShort
				),
				detail: typeof originalResource === 'string' ? originalResource : formattedLink,
				buttons: [
					{
						label: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, '&&Open'),
						run: () => true
					},
					{
						label: localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, '&&Copy'),
						run: () => {
							this._clipboardService.writeText(typeof originalResource === 'string' ? originalResource : resourceUri.toString(true));
							return false;
						}
					},
					{
						label: localize({ key: 'configureTrustedDomains', comment: ['&& denotes a mnemonic'] }, 'Configure &&Trusted Domains'),
						run: async () => {
							const pickedDomains = await configureOpenerTrustedDomainsHandler(
								trustedDomains,
								domainToOpen,
								resourceUri,
								this._quickInputService,
								this._storageService,
								this._editorService,
								this._telemetryService,
							);
							// Trust all domains
							if (pickedDomains.indexOf('*') !== -1) {
								return true;
							}
							// Trust current domain
							if (isURLDomainTrusted(resourceUri, pickedDomains)) {
								return true;
							}
							return false;
						}
					}
				],
				cancelButton: {
					run: () => false
				}
			});

			return result;
		}
	}
}

const rLocalhost = /^localhost(:\d+)?$/i;
const r127 = /^127.0.0.1(:\d+)?$/;

function isLocalhostAuthority(authority: string) {
	return rLocalhost.test(authority) || r127.test(authority);
}

/**
 * Case-normalize some case-insensitive URLs, such as github.
 */
function normalizeURL(url: string | URI): string {
	const caseInsensitiveAuthorities = ['github.com'];
	try {
		const parsed = typeof url === 'string' ? URI.parse(url, true) : url;
		if (caseInsensitiveAuthorities.includes(parsed.authority)) {
			return parsed.with({ path: parsed.path.toLowerCase() }).toString(true);
		} else {
			return parsed.toString(true);
		}
	} catch { return url.toString(); }
}

/**
 * Check whether a domain like https://www.microsoft.com matches
 * the list of trusted domains.
 *
 * - Schemes must match
 * - There's no subdomain matching. For example https://microsoft.com doesn't match https://www.microsoft.com
 * - Star matches all subdomains. For example https://*.microsoft.com matches https://www.microsoft.com and https://foo.bar.microsoft.com
 */
export function isURLDomainTrusted(url: URI, trustedDomains: string[]) {
	url = URI.parse(normalizeURL(url));
	trustedDomains = trustedDomains.map(normalizeURL);

	if (isLocalhostAuthority(url.authority)) {
		return true;
	}

	for (let i = 0; i < trustedDomains.length; i++) {
		if (trustedDomains[i] === '*') {
			return true;
		}

		if (testUrlMatchesGlob(url, trustedDomains[i])) {
			return true;
		}
	}

	return false;
}
