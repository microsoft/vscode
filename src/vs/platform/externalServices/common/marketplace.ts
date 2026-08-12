/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import { IHeaders } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { getServiceMachineId } from './serviceMachineId.js';
import { IFileService } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel, supportsTelemetry } from '../../telemetry/common/telemetryUtils.js';

export async function resolveMarketplaceHeaders(version: string,
	productService: IProductService,
	environmentService: IEnvironmentService,
	configurationService: IConfigurationService,
	fileService: IFileService,
	storageService: IStorageService | undefined,
	telemetryService: ITelemetryService): Promise<IHeaders> {

	const headers: IHeaders = {
		'X-Market-Client-Id': `VSCode ${version}`,
		'User-Agent': `VSCode ${version} (${productService.nameShort})`
	};

	if (supportsTelemetry(productService, environmentService) && getTelemetryLevel(configurationService) === TelemetryLevel.USAGE) {
		const serviceMachineId = await getServiceMachineId(environmentService, fileService, storageService);
		headers['X-Market-User-Id'] = serviceMachineId;
		// Send machineId as VSCode-SessionId so we can correlate telemetry events across different services
		// machineId can be undefined sometimes (eg: when launching from CLI), so send serviceMachineId instead otherwise
		// Marketplace will reject the request if there is no VSCode-SessionId header
		headers['VSCode-SessionId'] = telemetryService.machineId || serviceMachineId;
	}

	return headers;
}

/**
 * Returns an Authorization header value read from ~/.netrc for the given serviceUrl hostname,
 * or undefined if the setting is off, userHome is unavailable (web), or no entry exists.
 *
 * Intentionally NOT part of resolveMarketplaceHeaders so callers can invoke it per-request —
 * the .netrc token rotates daily and must not be cached for the lifetime of the process.
 */
export async function resolveNetrcAuthorizationHeader(
	serviceUrl: string,
	environmentService: IEnvironmentService,
	fileService: IFileService,
	configurationService: IConfigurationService,
): Promise<string | undefined> {
	if (!configurationService.getValue<boolean>('extensions.gallery.useNetrcAuth')) {
		return undefined;
	}
	// userHome is only present in native (desktop) environments; silently skip in web.
	const homeUri: URI | undefined = (environmentService as { userHome?: URI }).userHome;
	if (!homeUri) {
		return undefined;
	}
	return resolveNetrcAuthorization(serviceUrl, homeUri, fileService);
}

/**
 * Reads ~/.netrc and returns a Basic Authorization header value for the given
 * URL's hostname, or undefined if no matching entry exists.
 *
 * This lets enterprises point extensionsGallery.serviceUrl at a private registry
 * and rotate credentials via standard tooling (e.g. netrc-based credential helpers)
 * without touching product.json.
 */
async function resolveNetrcAuthorization(serviceUrl: string, homeUri: URI, fileService: IFileService): Promise<string | undefined> {
	let hostname: string;
	try {
		hostname = new URL(serviceUrl).hostname;
	} catch {
		return undefined;
	}

	const netrcUri = URI.joinPath(homeUri, '.netrc');
	let content: VSBuffer;
	try {
		const file = await fileService.readFile(netrcUri);
		content = file.value;
	} catch {
		return undefined; // no .netrc or unreadable
	}

	// Tokenise on whitespace; netrc entries are space- or newline-delimited.
	const tokens = content.toString().split(/\s+/).filter(t => t.length > 0);
	let login = '', password = '', inMachine = false;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t === 'machine') {
			if (inMachine) { break; } // past our entry
			if (tokens[i + 1] === hostname) { inMachine = true; i++; }
		} else if (inMachine) {
			if (t === 'login') { login = tokens[++i]; }
			else if (t === 'password') { password = tokens[++i]; }
			else if (t === 'macdef' || t === 'default') { break; }
		}
		// `default` entries (catch-all) are intentionally not matched: injecting credentials
		// into an unintended host (e.g. the Microsoft marketplace) would be a silent overshare.
	}

	if (!inMachine || !login || !password) {
		return undefined;
	}
	return 'Basic ' + encodeBase64(VSBuffer.fromString(`${login}:${password}`));
}
