/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { IDocumentManager } from '../common/documentManager.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IDocumentServiceIntegration } from '../common/documentServiceIntegration.js';

export class DocumentServiceIntegration extends Disposable implements IDocumentServiceIntegration {
	readonly _serviceBrand: undefined;
	
	constructor(
		@IDocumentManager private readonly documentManager: IDocumentManager
	) {
		super();
	}

	async getAllOpenDocuments(includeContent: boolean = true): Promise<any[]> {
		return this.documentManager.getAllOpenDocuments(includeContent);
	}

	async getActiveDocument(): Promise<any> {
		return this.documentManager.getActiveDocument();
	}

	async matchTextInOpenDocuments(searchText: string, options?: any): Promise<any[]> {
		return this.documentManager.matchTextInOpenDocuments(searchText, options);
	}

	async updateOpenDocumentContent(documentIdOrPath: string, newContent: string, markClean: boolean = true): Promise<boolean> {
		return this.documentManager.updateOpenDocumentContent(documentIdOrPath, newContent, markClean);
	}

	async getEffectiveFileContent(filePath: string, startLine?: number, endLine?: number): Promise<string | null> {
		const content = await this.documentManager.getEffectiveFileContent(filePath, startLine, endLine);
		return content;
	}

	async getOpenDocumentContent(filePath: string): Promise<string | null> {
		return this.documentManager.getOpenDocumentContent(filePath);
	}

	async checkPastedTextInOpenDocuments(pastedText: string): Promise<{filePath: string; startLine: number; endLine: number} | null> {
		
		if (!pastedText || pastedText.trim().length === 0) {
			return null;
		}

		let searchText = pastedText.trim();
		searchText = searchText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const hasLineBreak = searchText.includes('\n');
		let isCompleteLine = false;

		if (!hasLineBreak) {
			const documents = await this.documentManager.getAllOpenDocuments(true);
			
			for (const doc of documents) {
				if (!doc.content || doc.content.length === 0) {
					continue;
				}

				let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
				
				const lines = content.split('\n');
				
				for (const line of lines) {
					const trimmedLine = line.trim();
					const trimmedSearch = searchText.trim();
					if (trimmedLine.length > 0 && trimmedLine === trimmedSearch) {
						isCompleteLine = true;
						break;
					}
				}
				
				if (isCompleteLine) {
					break;
				}
			}
		}

		const hasLine = hasLineBreak || isCompleteLine;

		if (!hasLine) {
			return null;
		}

		const documents = await this.documentManager.getAllOpenDocuments(true);

		for (const doc of documents) {
			if (!doc.content || doc.content.length === 0) {
				continue;
			}

			let content = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			
			const pos = content.indexOf(searchText);
			if (pos !== -1) {
				
				const lines = content.split('\n');
				
				let currentPos = 0;
				let startLine = 1;
				let endLine = 1;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1;
					
					if (currentPos <= pos && pos < currentPos + lineLength) {
						startLine = lineNum + 1;
						break;
					}
					currentPos += lineLength;
				}
				
				const matchEnd = pos + searchText.length;
				currentPos = 0;
				
				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const lineLength = lines[lineNum].length + 1;
					
					if (currentPos <= matchEnd && matchEnd <= currentPos + lineLength) {
						endLine = lineNum + 1;
						break;
					}
					currentPos += lineLength;
				}

				
				return {
					filePath: doc.path,
					startLine: startLine,
					endLine: endLine
				};
			}
		}

		return null;
	}
}
