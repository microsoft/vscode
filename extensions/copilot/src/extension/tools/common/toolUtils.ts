/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { Location } from '../../../vscodeTypes';

type FileUriMetadata = {
	vscodeLinkType: 'skill';
	linkText: string;
};

export function formatUriForFileWidget(uriOrLocation: URI | Location, metadata?: FileUriMetadata): string {
	const uri = URI.isUri(uriOrLocation) ? uriOrLocation : uriOrLocation.uri;
	const rangePart = URI.isUri(uriOrLocation) ?
		'' :
		`#${uriOrLocation.range.start.line + 1}-${uriOrLocation.range.end.line + 1}`;

	if (metadata) {
		const uriWithQuery = uri.with({ query: `vscodeLinkType=${metadata.vscodeLinkType}` });
		return `[${metadata.linkText}](${uriWithQuery.toString()}${rangePart})`;
	}

	return `[](${uri.toString()}${rangePart})`;
}

/**
 * Encodes the URL hostname using punycode for security purposes.
 * This helps prevent homograph attacks by converting internationalized domain names to ASCII.
 * @param url The URL to encode
 * @returns An object containing the encoded URL and whether it was different from the original
 */
export function encodeUrlHostname(url: string): { encoded: string; isDifferent: boolean } {
	if (!URL.canParse(url)) {
		return { encoded: url, isDifferent: false };
	}

	// The URL constructor automatically encodes Unicode hostnames to punycode
	const urlObj = new URL(url);
	let encodedUrl = urlObj.href;

	// URL constructor adds trailing slash or slash before query/hash when original doesn't have path
	// e.g., "https://example.com?foo" becomes "https://example.com/?foo"
	const hasNoPath = !url.includes('/', url.indexOf('://') + 3);
	if (hasNoPath) {
		// Remove slash before query or hash that was added by URL constructor
		encodedUrl = encodedUrl.replace(/\/(\?|#)/, '$1');
		// Remove trailing slash if added at end
		if (encodedUrl.endsWith('/') && !url.endsWith('/')) {
			encodedUrl = encodedUrl.slice(0, -1);
		}
	}

	// Check if the URL was changed (hostname was encoded)
	const isDifferent = url !== encodedUrl;

	return {
		encoded: encodedUrl,
		isDifferent
	};
}
