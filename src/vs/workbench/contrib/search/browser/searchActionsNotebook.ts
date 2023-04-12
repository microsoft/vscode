/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from 'vs/base/common/buffer';
import { Schemas } from 'vs/base/common/network';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { NotebookData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IFileQuery, ISearchService, QueryType } from 'vs/workbench/services/search/common/search';
import { CancellationToken } from 'vs/base/common/cancellation';
import { category } from 'vs/workbench/contrib/search/browser/searchActionsBase';
import { URI } from 'vs/base/common/uri';
import { CellSearchModel } from 'vs/workbench/contrib/search/browser/searchNotebookHelpers';

registerAction2(class NotebookDeserializeTest extends Action2 {

	constructor(
	) {
		super({
			id: 'NotebookDeserializeTest',
			title: {
				value: localize('notebookDeserializeTest', 'Test Deserialize Perf'),
				original: 'Test Deserialize Perf'
			},
			f1: true,
			category,
		});
	}
	async run(accessor: ServicesAccessor) {
		const fileService = accessor.get(IFileService);
		const notebookService = accessor.get(INotebookService);
		const workspacesService = accessor.get(IWorkspaceContextService);
		const logService = accessor.get(ILogService);
		const searchService = accessor.get(ISearchService);

		const currWorkspace = workspacesService.getWorkspace();
		const uri = currWorkspace.folders[0].uri;

		const query: IFileQuery = {
			type: QueryType.File,
			filePattern: '**/*.ipynb',
			folderQueries: [{ folder: uri }]
		};
		const searchComplete = await searchService.fileSearch(
			query,
			CancellationToken.None
		);
		logService.info('notebook deserialize START');
		let processedFiles = 0;
		let processedBytes = 0;
		let processedCells = 0;
		let matchCount = 0;
		const start = Date.now();
		const pattern = 'start_index';
		let i = 0;
		for (const fileMatch of searchComplete.results) {
			if (i > Number.MAX_SAFE_INTEGER) {
				break;
			}
			i++;
			const uri = fileMatch.resource;
			const content = await fileService.readFileStream(uri);
			try {
				const info = await notebookService.withNotebookDataProvider('jupyter-notebook');
				if (!(info instanceof SimpleNotebookProviderInfo)) {
					throw new Error('CANNOT open file notebook with this provider');
				}

				let _data: NotebookData = {
					metadata: {},
					cells: []
				};
				if (uri.scheme !== Schemas.vscodeInteractive) {
					const bytes = await streamToBuffer(content.value);
					processedBytes += bytes.byteLength;
					_data = await info.serializer.dataToNotebook(bytes);
				}


				_data.cells.forEach((cell, index) => {
					const input = cell.source;
					const matches = this.getMatches(input, uri, index, pattern);
					matchCount += matches.length;
				});

				processedFiles += 1;
				processedCells += _data.cells.length;

			} catch (e) {
				logService.info('error: ' + e);
				continue;
			}
		}
		const end = Date.now();
		logService.info(`${matchCount} matches found`);
		logService.info(`notebook deserialize END | ${end - start}ms | ${((processedBytes / 1024) / 1024).toFixed(2)}MB | Number of Files: ${processedFiles} | Number of Cells: ${processedCells}`);

	}

	getMatches(source: string, uri: URI, cellIndex: number, target: string) {
		const cellModel = new CellSearchModel(source, uri, cellIndex);
		return cellModel.find(target);
	}
});

