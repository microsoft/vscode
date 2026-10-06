/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function rewriteSourceMappingURL(content: string, relativePath: string, sourceMapBaseUrl?: string): string {
	if (!sourceMapBaseUrl) {
		return content;
	}

	const sourceMapUrl = `${sourceMapBaseUrl}/${relativePath.replaceAll('\\', '/')}.map`;
	return content.replace(
		/\/\/# sourceMappingURL=.+$/m,
		`//# sourceMappingURL=${sourceMapUrl}`
	).replace(
		/\/\*# sourceMappingURL=.+\*\/$/m,
		`/*# sourceMappingURL=${sourceMapUrl}*/`
	);
}
