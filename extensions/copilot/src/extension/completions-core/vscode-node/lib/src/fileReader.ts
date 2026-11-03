/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../../../util/common/services';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsFileSystemService } from './fileSystem';
import { CopilotTextDocument, ITextDocument, TextDocumentIdentifier, TextDocumentResult } from './textDocument';
import { ICompletionsTextDocumentManagerService } from './textDocumentManager';
import { isDocumentValid } from './util/documentEvaluation';
import { basename } from './util/uri';

export const ICompletionsFileReaderService = createServiceIdentifier<ICompletionsFileReaderService>('ICompletionsFileReaderService');
export interface ICompletionsFileReaderService {
	readonly _serviceBrand: undefined;

	getRelativePath(doc: TextDocumentIdentifier): string | undefined;

	getOrReadTextDocument(doc: TextDocumentIdentifier): Promise<TextDocumentResult>;

	getOrReadTextDocumentWithFakeClientProperties(
		doc: TextDocumentIdentifier
	): Promise<TextDocumentResult<ITextDocument>>;
}

export class FileReader implements ICompletionsFileReaderService {
	declare _serviceBrand: undefined;
	constructor(
		@ICompletionsTextDocumentManagerService private readonly documentManagerService: ICompletionsTextDocumentManagerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsFileSystemService private readonly fileSystemService: ICompletionsFileSystemService,
	) { }

	getRelativePath(doc: TextDocumentIdentifier) {
		return this.documentManagerService.getRelativePath(doc) ?? basename(doc.uri);
	}

	getOrReadTextDocument(doc: TextDocumentIdentifier): Promise<TextDocumentResult> {
		return this.readFile(doc.uri);
	}

	getOrReadTextDocumentWithFakeClientProperties(
		doc: TextDocumentIdentifier
	): Promise<TextDocumentResult<ITextDocument>> {
		return this.readFile(doc.uri);
	}

	/**
	 * @deprecated use `getOrReadTextDocument` instead
	 */
	protected async readFile(uri: string): Promise<TextDocumentResult<ITextDocument>> {
		const documentResult = await this.documentManagerService.getTextDocumentWithValidation({ uri });
		if (documentResult.status !== 'notfound') {
			return documentResult;
		}
		try {
			const fileSizeMB = await this.getFileSizeMB(uri);
			// Note: the real production behavior actually blocks files larger than 5MB
			if (fileSizeMB > 1) {
				// Using notfound instead of invalid because of the mapping in statusFromTextDocumentResult
				return { status: 'notfound' as const, message: 'File too large' };
			}
			const text = await this.doReadFile(uri);

			// Note, that we check for blocked files even for empty files!
			const rcmResult = await this.instantiationService.invokeFunction(isDocumentValid, { uri });
			if (rcmResult.status === 'valid') {
				const doc = CopilotTextDocument.create(uri, 'UNKNOWN', -1, text);
				return { status: 'valid' as const, document: doc };
			}

			return rcmResult;
		} catch (e) {
			return { status: 'notfound' as const, message: 'File not found' };
		}
	}

	private async doReadFile(uri: string) {
		return await this.fileSystemService.readFileString(uri);
	}

	private async getFileSizeMB(uri: string) {
		const stat = await this.fileSystemService.stat(uri);
		return stat.size / 1024 / 1024;
	}
}
