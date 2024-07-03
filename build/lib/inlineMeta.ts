/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import { basename } from 'path';
import * as File from 'vinyl';

export interface IInlineMetaContext {
	readonly targets: { readonly base: string; readonly path: string }[];
	readonly packageJsonFn: () => string;
	readonly productJsonFn: () => string;
}

export function inlineMeta(result: NodeJS.ReadWriteStream, ctx: IInlineMetaContext): NodeJS.ReadWriteStream {
	return result.pipe(es.through(function (file: File) {
		if (matchesFile(file, ctx)) {
			let content = file.contents.toString();
			let changed = false;

			const packageMarker = 'BUILD_INSERT_PACKAGE_CONFIGURATION:"BUILD_INSERT_PACKAGE_CONFIGURATION"';
			if (content.includes(packageMarker)) {
				content = content.replace(packageMarker, JSON.stringify(JSON.parse(ctx.packageJsonFn())).slice(1, -1) /* trim braces */);
				changed = true;
			}

			const productMarker = 'BUILD_INSERT_PRODUCT_CONFIGURATION:"BUILD_INSERT_PRODUCT_CONFIGURATION"';
			if (content.includes(productMarker)) {
				content = content.replace(productMarker, JSON.stringify(JSON.parse(ctx.productJsonFn())).slice(1, -1) /* trim braces */);
				changed = true;
			}

			if (changed) {
				file.contents = Buffer.from(content);
			}
		}
		this.emit('data', file);
	}));
}

function matchesFile(file: File, ctx: IInlineMetaContext): boolean {
	for (const target of ctx.targets) {
		if (file.base === target.base && file.basename === basename(target.path)) {
			return true;
		}
	}
	return false;
}
