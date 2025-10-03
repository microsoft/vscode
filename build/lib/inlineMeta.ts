/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import { basename } from 'path';
import File from 'vinyl';

export interface IInlineMetaContext {
	readonly targetPaths: string[];
	readonly packageJsonFn: () => string;
	readonly productJsonFn: () => string;
}

const packageJsonMarkerId = 'BUILD_INSERT_PACKAGE_CONFIGURATION';

// TODO in order to inline `product.json`, more work is
// needed to ensure that we cover all cases where modifications
// are done to the product configuration during build. There are
// at least 2 more changes that kick in very late:
// - a `darwinUniversalAssetId` is added in`create-universal-app.ts`
// - a `target` is added in `gulpfile.vscode.win32.js`
// const productJsonMarkerId = 'BUILD_INSERT_PRODUCT_CONFIGURATION';

export function inlineMeta(result: NodeJS.ReadWriteStream, ctx: IInlineMetaContext): NodeJS.ReadWriteStream {
	return result.pipe(es.through(function (file: File) {
		if (matchesFile(file, ctx)) {
			let content = file.contents!.toString();
			let markerFound = false;

			const packageMarker = `${packageJsonMarkerId}:"${packageJsonMarkerId}"`; // this needs to be the format after esbuild has processed the file (e.g. double quotes)
			if (content.includes(packageMarker)) {
				content = content.replace(packageMarker, JSON.stringify(JSON.parse(ctx.packageJsonFn())).slice(1, -1) /* trim braces */);
				markerFound = true;
			}

			// const productMarker = `${productJsonMarkerId}:"${productJsonMarkerId}"`; // this needs to be the format after esbuild has processed the file (e.g. double quotes)
			// if (content.includes(productMarker)) {
			// 	content = content.replace(productMarker, JSON.stringify(JSON.parse(ctx.productJsonFn())).slice(1, -1) /* trim braces */);
			// 	markerFound = true;
			// }

			if (markerFound) {
				file.contents = Buffer.from(content);
			}
		}

		this.emit('data', file);
	}));
}

function matchesFile(file: File, ctx: IInlineMetaContext): boolean {
	for (const targetPath of ctx.targetPaths) {
		if (file.basename === basename(targetPath)) { // TODO would be nicer to figure out root relative path to not match on false positives
			return true;
		}
	}
	return false;
}
