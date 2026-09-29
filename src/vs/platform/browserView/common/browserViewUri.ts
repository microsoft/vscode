/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Helper for creating and parsing browser view URIs.
 */
export namespace BrowserViewUri {

	export const scheme = Schemas.vscodeBrowser;

	/**
	 * Creates a resource URI for a browser view with the given ID.
	 */
	export function forId(id: string): URI {
		return URI.from({ scheme, path: `/${id}` });
	}

	/**
	 * Parses a browser view resource URI to extract the ID.
	 */
	export function parse(resource: URI): { id: string } | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		// Remove leading slash if present
		const id = resource.path.startsWith('/') ? resource.path.substring(1) : resource.path;
		if (!id) {
			return undefined;
		}

		return { id };
	}

	/**
	 * Extracts the ID from a browser view resource URI.
	 */
	export function getId(resource: URI): string | undefined {
		return parse(resource)?.id;
	}
}
