/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';

/**
 * Helper for creating and parsing browser view URIs.
 */
export namespace BrowserViewUri {

	export const scheme = Schemas.vscodeBrowser;

	/**
	 * Creates a resource URI for a browser view with the given URL.
	 * Optionally accepts an ID; if not provided, a new UUID is generated.
	 */
	export function forUrl(url: string | undefined, id?: string): URI {
		const viewId = id ?? generateUuid();
		return URI.from({
			scheme,
			path: `/${viewId}`,
			query: url ? `url=${encodeURIComponent(url)}` : undefined
		});
	}

	/**
	 * Parses a browser view resource URI to extract the ID and URL.
	 */
	export function parse(resource: URI): { id: string; url: string } | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		// Remove leading slash if present
		const id = resource.path.startsWith('/') ? resource.path.substring(1) : resource.path;
		if (!id) {
			return undefined;
		}

		const url = resource.query ? new URLSearchParams(resource.query).get('url') ?? '' : '';

		return { id, url };
	}

	/**
	 * Extracts the ID from a browser view resource URI.
	 */
	export function getId(resource: URI): string | undefined {
		return parse(resource)?.id;
	}

	/**
	 * Extracts the URL from a browser view resource URI.
	 */
	export function getUrl(resource: URI): string | undefined {
		return parse(resource)?.url;
	}
}
