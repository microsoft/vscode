/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';

/**
 * See [Web app manifest on MDN](https://developer.mozilla.org/en-US/docs/Web/Manifest) for additional information.
 */
export interface WebManifest {
	name: string;
	short_name: string;
	start_url: string;
	display: string;
	'background-color': string;
	description: string;
	icons: Array<{ src: string; type: string; sizes: string }>;
}

export interface ClientTheme {
	backgroundColor: string;
	foregroundColor: string;
}

export const ICON_SIZES = [192, 512];

class HTTPError extends Error {
	constructor (message: string, public readonly code: number) {
		super(message);
	}
}

export class HTTPNotFoundError extends HTTPError {
	constructor (message: string) {
		super(message, 404);
	}
}

/**
 * Remove extra slashes in a URL.
 *
 * This is meant to fill the job of `path.join` so you can concatenate paths and
 * then normalize out any extra slashes.
 *
 * If you are using `path.join` you do not need this but note that `path` is for
 * file system paths, not URLs.
 *
 * @author coder
 */
export const normalize = (url: string, keepTrailing = false): string => {
	return url.replace(/\/\/+/g, "/").replace(/\/+$/, keepTrailing ? "/" : "")
}

/**
 * Get the relative path that will get us to the root of the page. For each
 * slash we need to go up a directory.  Will not have a trailing slash.
 *
 * For example:
 *
 * / => .
 * /foo => .
 * /foo/ => ./..
 * /foo/bar => ./..
 * /foo/bar/ => ./../..
 *
 * All paths must be relative in order to work behind a reverse proxy since we
 * we do not know the base path.  Anything that needs to be absolute (for
 * example cookies) must get the base path from the frontend.
 *
 * All relative paths must be prefixed with the relative root to ensure they
 * work no matter the depth at which they happen to appear.
 *
 * For Express `req.originalUrl` should be used as they remove the base from the
 * standard `url` property making it impossible to get the true depth.
 *
 * @author coder
 */
export const relativeRoot = (originalUrl: string): string => {
	const depth = (originalUrl.split("?", 1)[0].match(/\//g) || []).length
	return normalize("./" + (depth > 1 ? "../".repeat(depth - 1) : ""))
}

/**
 * Get the relative path to the current resource.
 *
 * For example:
 *
 * / => .
 * /foo => ./foo
 * /foo/ => ./
 * /foo/bar => ./bar
 * /foo/bar/ => ./bar/
 */
export const relativePath = (originalUrl: string): string => {
	const parts = originalUrl.split("?", 1)[0].split("/")
	return normalize("./" + parts[parts.length - 1])
}

/**
 * code-server serves VS Code using Express.  Express removes the base from
 * the url and puts the original in `originalUrl` so we must use this to get
 * the correct depth.  VS Code is not aware it is behind Express so the
 * types do not match.  We may want to continue moving code into VS Code and
 * eventually remove the Express wrapper.
 *
 * @author coder
 */
export const getOriginalUrl = (req: http.IncomingMessage): string => {
	return (req as any).originalUrl || req.url
}
