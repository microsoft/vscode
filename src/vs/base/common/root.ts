/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const getRoot = () => {
	if (typeof window !== "undefined") {
		const urlParams = new URLSearchParams(window.location.search);
		const baseUrl = urlParams.get("baseUrl");
		if (baseUrl) {
			return baseUrl;
		}
	}
	return new URL("../../../../", import.meta.url).toString();
};

const getRelativeRoot = () => {
	return new URL("../../../../", import.meta.url).toString();
}


/**
 * absolute path of the root folder, used in node
 */
export const root = getRoot();

/**
 * relative path to the root folder, used in browser
 */
export const relativeRoot = getRelativeRoot()
