/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Base options included on every page.
 */
export interface Options {
	base: string
	csStaticBase: string
	logLevel: number
}

/**
 * Remove extra slashes in a URL.
 */
export const normalize = (url: string, keepTrailing = false): string => {
	return url.replace(/\/\/+/g, "/").replace(/\/+$/, keepTrailing ? "/" : "")
}

/**
 * Resolve a relative base against the window location. This is used for
 * anything that doesn't work with a relative path.
 */
export const resolveBase = (base?: string): string => {
	// After resolving the base will either start with / or be an empty string.
	if (!base || base.startsWith("/")) {
		return base ?? ""
	}
	const parts = location.pathname.split("/")
	parts[parts.length - 1] = base
	const url = new URL(location.origin + "/" + parts.join("/"))
	return normalize(url.pathname)
}

/**
 * Get options embedded in the HTML or query params.
 */
export const getOptions = <T extends Options>(): T => {
	let options: T
	try {
		options = JSON.parse(document.getElementById("coder-options")!.getAttribute("data-settings")!)
	} catch (error) {
		options = {} as T
	}

	// You can also pass options in stringified form to the options query
	// variable. Options provided here will override the ones in the options
	// element.
	const params = new URLSearchParams(location.search)
	const queryOpts = params.get("options")
	if (queryOpts) {
		options = {
			...options,
			...JSON.parse(queryOpts),
		}
	}

	options.base = resolveBase(options.base)
	options.csStaticBase = resolveBase(options.csStaticBase)

	return options
}
