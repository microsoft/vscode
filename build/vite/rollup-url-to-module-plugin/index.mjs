/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @type {() => import('rollup').Plugin}
*/
export function urlToEsmPlugin() {
	return {
		name: 'import-meta-url',
		async transform(code, id) {
			if (this.environment?.mode === 'dev') {
				return;
			}

			// Look for `new URL(..., import.meta.url)` patterns.
			const regex = /new\s+URL\s*\(\s*(['"`])(.*?)\1\s*,\s*import\.meta\.url\s*\)?/g;

			let match;
			let modified = false;
			let result = code;
			let offset = 0;

			while ((match = regex.exec(code)) !== null) {
				let path = match[2];

				if (!path.startsWith('.') && !path.startsWith('/')) {
					path = `./${path}`;
				}
				const resolved = await this.resolve(path, id);

				if (!resolved) {
					continue;
				}

				// Add the file as an entry point
				const refId = this.emitFile({
					type: 'chunk',
					id: resolved.id,
				});

				const start = match.index;
				const end = start + match[0].length;

				const replacement = `import.meta.ROLLUP_FILE_URL_OBJ_${refId}`;

				result = result.slice(0, start + offset) + replacement + result.slice(end + offset);
				offset += replacement.length - (end - start);
				modified = true;
			}

			if (!modified) {
				return null;
			}

			return {
				code: result,
				map: null
			};
		}
	};
}
