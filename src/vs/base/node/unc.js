/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

(function () {
	function factory() {

		/**
		 * @returns {Set<string> | undefined}
		 */
		function processUNCHostAllowlist() {

			// The property `process.uncHostAllowlist` is not available in official node.js
			// releases, only in our own builds, so we have to probe for availability

			return process.uncHostAllowlist;
		}

		/**
		 * @param {unknown} arg0
		 * @returns {string[]}
		 */
		function toSafeStringArray(arg0) {
			const allowedUNCHosts = new Set();

			if (Array.isArray(arg0)) {
				for (const host of arg0) {
					if (typeof host === 'string') {
						allowedUNCHosts.add(host);
					}
				}
			}

			return Array.from(allowedUNCHosts);
		}

		/**
		 * @returns {string[]}
		 */
		function getUNCHostAllowlist() {
			const allowlist = processUNCHostAllowlist();
			if (allowlist) {
				return Array.from(allowlist);
			}

			return [];
		}

		/**
		 * @param {string | string[]} allowedHost
		 */
		function addUNCHostToAllowlist(allowedHost) {
			if (process.platform !== 'win32') {
				return;
			}

			const allowlist = processUNCHostAllowlist();
			if (allowlist) {
				if (typeof allowedHost === 'string') {
					allowlist.add(allowedHost.toLowerCase()); // UNC hosts are case-insensitive
				} else {
					for (const host of toSafeStringArray(allowedHost)) {
						addUNCHostToAllowlist(host);
					}
				}
			}
		}

		/**
		 * @param {string | undefined | null} maybeUNCPath
		 * @returns {string | undefined}
		 */
		function getUNCHost(maybeUNCPath) {
			if (typeof maybeUNCPath !== 'string') {
				return undefined; // require a valid string
			}

			const uncRoots = [
				'\\\\.\\UNC\\',	// DOS Device paths (https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats)
				'\\\\?\\UNC\\',
				'\\\\'			// standard UNC path
			];

			let host = undefined;

			for (const uncRoot of uncRoots) {
				const indexOfUNCRoot = maybeUNCPath.indexOf(uncRoot);
				if (indexOfUNCRoot !== 0) {
					continue; // not matching any of our expected UNC roots
				}

				const indexOfUNCPath = maybeUNCPath.indexOf('\\', uncRoot.length);
				if (indexOfUNCPath === -1) {
					continue; // no path component found
				}

				const hostCandidate = maybeUNCPath.substring(uncRoot.length, indexOfUNCPath);
				if (hostCandidate) {
					host = hostCandidate;
					break;
				}
			}

			return host;
		}

		function disableUNCAccessRestrictions() {
			if (process.platform !== 'win32') {
				return;
			}

			process.restrictUNCAccess = false;
		}

		function isUNCAccessRestrictionsDisabled() {
			if (process.platform !== 'win32') {
				return true;
			}

			return process.restrictUNCAccess === false;
		}

		return {
			getUNCHostAllowlist,
			addUNCHostToAllowlist,
			getUNCHost,
			disableUNCAccessRestrictions,
			isUNCAccessRestrictionsDisabled
		};
	}

	if (typeof define === 'function') {
		// amd
		define([], function () { return factory(); });
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		// commonjs
		module.exports = factory();
	} else {
		console.trace('vs/base/node/unc defined in UNKNOWN context (neither requirejs or commonjs)');
	}
})();
