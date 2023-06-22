/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { streamToBuffer } from 'vs/base/common/buffer';
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
import { FindMatch, IReadonlyTextBuffer } from 'vs/editor/common/model';

registerAction2(class NotebookDeserializeTest extends Action2 {

	constructor(
	) {
		super({
			id: 'NotebookDeserializeTest',
			title: {
				value: localize('notebookDeserializeTest', 'Test Closed Notebook Perf - No Cache'),
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

		const info = await notebookService.withNotebookDataProvider('jupyter-notebook');
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}
		const currWorkspace = workspacesService.getWorkspace();
		const uri = currWorkspace.folders[0].uri;

		const query: IFileQuery = {
			type: QueryType.File,
			filePattern: '**/*.ipynb',
			folderQueries: [{ folder: uri }]
		};
		let processedFiles = 0;
		let processedBytes = 0;
		let processedCells = 0;
		let deserializeTime = 0;
		let parseTime = 0;
		let readTime = 0;
		const start = Date.now();
		logService.info('notebook search START');
		const searchComplete = await searchService.fileSearch(
			query,
			CancellationToken.None
		);
		const findFilesTime = Date.now() - start;
		const pattern = 'a';


		const promises: Promise<FindMatch[]>[] = searchComplete.results.map(async (fileMatch) => {
			const deserializeStart = Date.now();
			const uri = fileMatch.resource;
			const readTimeStart = Date.now();
			const content = await fileService.readFileStream(uri);
			try {
				let _data: NotebookData = {
					metadata: {},
					cells: []
				};

				const bytes = await streamToBuffer(content.value);
				processedBytes += bytes.byteLength;

				const readTimeEnd = Date.now();
				readTime += readTimeEnd - readTimeStart;
				const parseStart = Date.now();
				_data = await info.serializer.dataToNotebook(bytes);
				parseTime += Date.now() - parseStart;

				const deserializeEnd = Date.now();
				deserializeTime += deserializeEnd - deserializeStart;
				const allMatches: FindMatch[] = [];

				_data.cells.forEach((cell, index) => {
					const input = cell.source;
					const matches = this.getMatchesFromString(input, uri, index, pattern);
					allMatches.push(...matches);
				});

				processedFiles += 1;
				processedCells += _data.cells.length;
				return allMatches;
			} catch (e) {
				logService.info('error: ' + e);
				return [];
			}
		});

		const allMatches = await Promise.all(promises);

		const end = Date.now();
		logService.info(`${allMatches.length} matches found`);
		logService.info(`notebook search | ${end - start}ms | ${((processedBytes / 1024) / 1024).toFixed(2)}MB | Number of Files: ${processedFiles} | Number of Cells: ${processedCells}`);
		logService.info(`-> notebook find files time | ${findFilesTime}ms`);
		// logService.info(`-> notebook deserialize time | ${deserializeTime}ms | ${(deserializeTime / (end - start)) * 100}% of total time`);
		// logService.info(`---> notebook read time | ${readTime}ms | ${(readTime / deserializeTime) * 100}% of deserialize time`);
		// logService.info(`---> notebook parse time | ${parseTime}ms | ${(parseTime / deserializeTime) * 100}% of deserialize time`);
		logService.info(`-------`);
	}

	getMatchesFromBuffer(tb: IReadonlyTextBuffer, uri: URI, cellIndex: number, target: string) {
		const cellModel = new CellSearchModel('', tb, uri, cellIndex);
		return cellModel.find(target);
	}

	getMatchesFromString(source: string, uri: URI, cellIndex: number, target: string) {
		const cellModel = new CellSearchModel(source, undefined, uri, cellIndex);
		return cellModel.find(target);
	}
});

