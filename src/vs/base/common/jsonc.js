/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../../typings/require.d.ts" />

//@ts-check
'use strict';

(function () {
	function factory(path, os, productName, cwd) {
		// First group matches a double quoted string
		// Second group matches a single quoted string
		// Third group matches a multi line comment
		// Forth group matches a single line comment
		// Fifth group matches a trailing comma
		const regexp = /("[^"\\]*(?:\\.[^"\\]*)*")|('[^'\\]*(?:\\.[^'\\]*)*')|(\/\*[^\/\*]*(?:(?:\*|\/)[^\/\*]*)*?\*\/)|(\/{2,}.*?(?:(?:\r?\n)|$))|(,\s*[}\]])/g;

		/**
		 * @param {string} content
		 * @returns {string}
		 */
		function stripComments(content) {
			return content.replace(regexp, function (match, _m1, _m2, m3, m4, m5) {
				// Only one of m1, m2, m3, m4, m5 matches
				if (m3) {
					// A block comment. Replace with nothing
					return '';
				} else if (m4) {
					// Since m4 is a single line comment is is at least of length 2 (e.g. //)
					// If it ends in \r?\n then keep it.
					const length = m4.length;
					if (m4[length - 1] === '\n') {
						return m4[length - 2] === '\r' ? '\r\n' : '\n';
					}
					else {
						return '';
					}
				} else if (m5) {
					// Remove the trailing comma
					return match.substring(1);
				} else {
					// We match a string
					return match;
				}
			});
		}

		/**
		 * @param {string} content
		 * @returns {any}
		 */
		function parse(content) {
			const commentsStripped = stripComments(content);

			try {
				return JSON.parse(commentsStripped);
			} catch (error) {
				const trailingCommasStriped = commentsStripped.replace(/,\s*([}\]])/g, '$1');
				return JSON.parse(trailingCommasStriped);
			}
		}
		return {
			stripComments,
			parse
		};
	}

	if (typeof define === 'function') {
		// amd
		define([], function () { return factory(); });
	} else if (typeof module === 'object' && typeof module.exports === 'object') {
		// commonjs
		module.exports = factory();
	} else {
		console.trace('jsonc defined in UNKNOWN context (neither requirejs or commonjs)');
	}
})();
