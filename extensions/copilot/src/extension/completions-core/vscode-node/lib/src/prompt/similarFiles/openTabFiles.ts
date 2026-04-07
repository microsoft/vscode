/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sortByAccessTimes } from '../../documentTracker';
import { TextDocumentContents } from '../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	INeighborSource,
	NeighborSource,
	NeighboringFileType,
	NeighborsCollection,
	considerNeighborFile,
} from './neighborFiles';

export class OpenTabFiles implements INeighborSource {
	constructor(@ICompletionsTextDocumentManagerService readonly docManager: ICompletionsTextDocumentManagerService) { }

	private truncateDocs(
		docs: readonly TextDocumentContents[],
		uri: string,
		languageId: string,
		maxNumNeighborFiles: number
	): NeighborsCollection {
		const openFiles: NeighborsCollection = new Map();
		let totalLen = 0;
		for (const doc of docs) {
			if (totalLen + doc.getText().length > NeighborSource.MAX_NEIGHBOR_AGGREGATE_LENGTH) {
				continue;
			}

			if (
				doc.uri.startsWith('file:') &&
				uri.startsWith('file:') &&
				doc.uri !== uri &&
				considerNeighborFile(languageId, doc.detectedLanguageId)
			) {
				openFiles.set(doc.uri.toString(), {
					uri: doc.uri.toString(),
					relativePath: this.docManager.getRelativePath(doc),
					source: doc.getText(),
				});
				totalLen += doc.getText().length;
			}

			if (openFiles.size >= maxNumNeighborFiles) {
				break;
			}
		}
		return openFiles;
	}

	/**
	 * Get the neighbor files. Current it supports open editors.
	 * @param uri The uri of the current open file.
	 * @param languageId The language id of the current open file.
	 * @param maxNumNeighborFiles The max number of neighbor files to return.
	 * @returns Include 2 items.
	 *          1. The merged unique documents, which is not exceeding MAX_NEIGHBOR_FILES.
	 *          2. For each neighbor type, the files that are included in the merged unique documents.
	 */
	async getNeighborFiles(
		uri: string,
		languageId: string,
		maxNumNeighborFiles: number
	): Promise<{ docs: NeighborsCollection; neighborSource: Map<NeighboringFileType, string[]> }> {
		let neighborFiles: NeighborsCollection = new Map();
		const neighborSource = new Map<NeighboringFileType, string[]>();
		neighborFiles = this.truncateDocs(
			sortByAccessTimes(await this.docManager.textDocuments()),
			uri,
			languageId,
			maxNumNeighborFiles
		);
		neighborSource.set(
			NeighboringFileType.OpenTabs,
			Array.from(neighborFiles.keys()).map(uri => uri.toString())
		);
		return {
			docs: neighborFiles,
			neighborSource: neighborSource,
		};
	}
}
