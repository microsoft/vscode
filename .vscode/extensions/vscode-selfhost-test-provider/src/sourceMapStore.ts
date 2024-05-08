/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	GREATEST_LOWER_BOUND,
	LEAST_UPPER_BOUND,
	originalPositionFor,
	TraceMap
} from '@jridgewell/trace-mapping';
import * as vscode from 'vscode';
import { getContentFromFilesystem } from './testTree';

const inlineSourcemapRe = /^\/\/# sourceMappingURL=data:application\/json;base64,(.+)/m;
const sourceMapBiases = [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const;

export class SourceMapStore {
	private readonly cache = new Map</* file uri */ string, Promise<TraceMap | undefined>>();

	async getSourceLocation(fileUri: string, line: number, col = 1) {
		const sourceMap = await this.loadSourceMap(fileUri);
		if (!sourceMap) {
			return undefined;
		}

		for (const bias of sourceMapBiases) {
			const position = originalPositionFor(sourceMap, { column: col, line: line + 1, bias });
			if (position.line !== null && position.column !== null && position.source !== null) {
				return new vscode.Location(
					this.completeSourceMapUrl(sourceMap, position.source),
					new vscode.Position(position.line - 1, position.column)
				);
			}
		}

		return undefined;
	}

	async getSourceFile(compiledUri: string) {
		const sourceMap = await this.loadSourceMap(compiledUri);
		if (!sourceMap) {
			return undefined;
		}

		if (sourceMap.sources[0]) {
			return this.completeSourceMapUrl(sourceMap, sourceMap.sources[0]);
		}

		for (const bias of sourceMapBiases) {
			const position = originalPositionFor(sourceMap, { column: 0, line: 1, bias });
			if (position.source !== null) {
				return this.completeSourceMapUrl(sourceMap, position.source);
			}
		}

		return undefined;
	}

	async getSourceFileContents(compiledUri: string) {
		const sourceUri = await this.getSourceFile(compiledUri);
		return sourceUri ? getContentFromFilesystem(sourceUri) : undefined;
	}

	private completeSourceMapUrl(sm: TraceMap, source: string) {
		if (sm.sourceRoot) {
			try {
				return vscode.Uri.parse(new URL(source, sm.sourceRoot).toString());
			} catch {
				// ignored
			}
		}

		return vscode.Uri.parse(source);
	}

	public loadSourceMap(fileUri: string) {
		const existing = this.cache.get(fileUri);
		if (existing) {
			return existing;
		}

		const promise = (async () => {
			try {
				const contents = await getContentFromFilesystem(vscode.Uri.parse(fileUri));
				const sourcemapMatch = inlineSourcemapRe.exec(contents);
				if (!sourcemapMatch) {
					return;
				}

				const decoded = Buffer.from(sourcemapMatch[1], 'base64').toString();
				return new TraceMap(decoded, fileUri);
			} catch (e) {
				console.warn(`Error parsing sourcemap for ${fileUri}: ${(e as Error).stack}`);
				return;
			}
		})();

		this.cache.set(fileUri, promise);
		return promise;
	}
}
