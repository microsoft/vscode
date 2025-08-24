/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { DocumentSymbol } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { getWorkspaceSymbols } from '../../../search/common/search.js';
import { CountTokensCallback, IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource, ToolProgress } from '../languageModelToolsService.js';

export const ListCodeUsagesToolId = 'copilot_listCodeUsages';

export const ListCodeUsagesToolData: IToolData = {
	id: ListCodeUsagesToolId,
	displayName: 'List Code Usages',
	modelDescription: 'List definitions, references, and implementations for a symbol in code. Searches document symbols first, then falls back to workspace symbols if not found.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			symbol: {
				type: 'string',
				description: 'The symbol name to search for (e.g., function name, class name, variable name)'
			},
			filePath: {
				type: 'string',
				description: 'Optional file path to search in first. If not provided or symbol not found in file, searches entire workspace'
			}
		},
		required: ['symbol'],
		additionalProperties: false
	}
};

export interface ListCodeUsagesToolParams {
	symbol: string;
	filePath?: string;
}

export class ListCodeUsagesTool implements IToolImpl {
	
	constructor(
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILogService private readonly logService: ILogService,
	) { }

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const parameters = invocation.parameters as ListCodeUsagesToolParams;
		
		if (!parameters.symbol) {
			return {
				content: [{
					kind: 'text',
					value: 'Error: Symbol name is required'
				}]
			};
		}

		progress(({ kind: 'text', value: `Searching for symbol "${parameters.symbol}"...` }));

		try {
			let symbolLocation: { uri: URI; position: Position } | undefined;

			// First try to find the symbol in document symbols if filePath is provided
			if (parameters.filePath) {
				try {
					const fileUri = URI.parse(parameters.filePath);
					symbolLocation = await this.findSymbolInDocument(parameters.symbol, fileUri, token);
					if (symbolLocation) {
						progress(({ kind: 'text', value: `Found symbol in document: ${parameters.filePath}` }));
					}
				} catch (error) {
					this.logService.warn('Error searching document symbols:', error);
				}
			}

			// If not found in document or no file specified, search workspace symbols
			if (!symbolLocation) {
				progress(({ kind: 'text', value: `Symbol not found in document, searching workspace...` }));
				symbolLocation = await this.findSymbolInWorkspace(parameters.symbol, token);
				if (symbolLocation) {
					progress(({ kind: 'text', value: `Found symbol in workspace: ${symbolLocation.uri.toString()}` }));
				}
			}

			if (!symbolLocation) {
				return {
					content: [{
						kind: 'text',
						value: `Symbol "${parameters.symbol}" cannot be found in the workspace.`
					}]
				};
			}

			// Now get usages using the found symbol location
			progress(({ kind: 'text', value: 'Getting references, definitions, and implementations...' }));
			
			const modelReference = await this.textModelService.createModelReference(symbolLocation.uri);
			try {
				const textModel = modelReference.object.textEditorModel;
				if (!textModel) {
					return {
						content: [{
							kind: 'text',
							value: `Could not access text model for ${symbolLocation.uri.toString()}`
						}]
					};
				}

				const [definitions, references, implementations] = await Promise.all([
					this.getDefinitions(symbolLocation.position, textModel, token),
					this.getReferences(symbolLocation.position, textModel, token),
					this.getImplementations(symbolLocation.position, textModel, token)
				]);

				// Format results
				let resultText = `## Code Usages for "${parameters.symbol}"\n\n`;
				
				resultText += `**Found at:** ${symbolLocation.uri.toString()}:${symbolLocation.position.lineNumber}:${symbolLocation.position.column}\n\n`;

				if (definitions.length > 0) {
					resultText += `### Definitions (${definitions.length})\n`;
					for (const def of definitions) {
						resultText += `- ${def.uri.toString()}:${def.range.startLineNumber}:${def.range.startColumn}\n`;
					}
					resultText += '\n';
				}

				if (references.length > 0) {
					resultText += `### References (${references.length})\n`;
					for (const ref of references) {
						resultText += `- ${ref.uri.toString()}:${ref.range.startLineNumber}:${ref.range.startColumn}\n`;
					}
					resultText += '\n';
				}

				if (implementations.length > 0) {
					resultText += `### Implementations (${implementations.length})\n`;
					for (const impl of implementations) {
						resultText += `- ${impl.uri.toString()}:${impl.range.startLineNumber}:${impl.range.startColumn}\n`;
					}
					resultText += '\n';
				}

				if (definitions.length === 0 && references.length === 0 && implementations.length === 0) {
					resultText += 'No definitions, references, or implementations found.\n';
				}

				return {
					content: [{
						kind: 'markdownContent',
						value: resultText
					}]
				};

			} finally {
				modelReference.dispose();
			}

		} catch (error) {
			this.logService.error('Error in ListCodeUsagesTool:', error);
			return {
				content: [{
					kind: 'text',
					value: `Error searching for symbol "${parameters.symbol}": ${error}`
				}]
			};
		}
	}

	private async findSymbolInDocument(symbolName: string, uri: URI, token: CancellationToken): Promise<{ uri: URI; position: Position } | undefined> {
		try {
			const modelReference = await this.textModelService.createModelReference(uri);
			try {
				const textModel = modelReference.object.textEditorModel;
				if (!textModel) {
					return undefined;
				}

				const documentSymbols = await this.getDocumentSymbols(textModel, token);
				const foundSymbol = this.findSymbolInHierarchy(documentSymbols, symbolName);
				
				if (foundSymbol) {
					return {
						uri,
						position: new Position(foundSymbol.range.startLineNumber, foundSymbol.range.startColumn)
					};
				}
			} finally {
				modelReference.dispose();
			}
		} catch (error) {
			this.logService.warn('Error getting document symbols:', error);
		}
		
		return undefined;
	}

	private async findSymbolInWorkspace(symbolName: string, token: CancellationToken): Promise<{ uri: URI; position: Position } | undefined> {
		try {
			const workspaceSymbols = await getWorkspaceSymbols(symbolName, token);
			
			// Find exact match (prioritize) or partial match
			const exactMatch = workspaceSymbols.find(item => item.symbol.name === symbolName);
			const symbol = exactMatch || workspaceSymbols.find(item => item.symbol.name.includes(symbolName));
			
			if (symbol) {
				return {
					uri: symbol.symbol.location.uri,
					position: new Position(symbol.symbol.location.range.startLineNumber, symbol.symbol.location.range.startColumn)
				};
			}
		} catch (error) {
			this.logService.warn('Error getting workspace symbols:', error);
		}
		
		return undefined;
	}

	private async getDocumentSymbols(textModel: ITextModel, token: CancellationToken): Promise<DocumentSymbol[]> {
		const providers = this.languageFeaturesService.documentSymbolProvider.all(textModel);
		const results = await Promise.all(providers.map(async provider => {
			try {
				return await provider.provideDocumentSymbols(textModel, token) || [];
			} catch (error) {
				this.logService.warn('Error from document symbol provider:', error);
				return [];
			}
		}));
		
		return results.flat();
	}

	private findSymbolInHierarchy(symbols: DocumentSymbol[], symbolName: string): DocumentSymbol | undefined {
		for (const symbol of symbols) {
			if (symbol.name === symbolName || symbol.name.includes(symbolName)) {
				return symbol;
			}
			
			if (symbol.children) {
				const found = this.findSymbolInHierarchy(symbol.children, symbolName);
				if (found) {
					return found;
				}
			}
		}
		return undefined;
	}

	private async getDefinitions(position: Position, textModel: ITextModel, token: CancellationToken) {
		const providers = this.languageFeaturesService.definitionProvider.all(textModel);
		const results = await Promise.all(providers.map(async provider => {
			try {
				return await provider.provideDefinition(textModel, position, token) || [];
			} catch (error) {
				this.logService.warn('Error from definition provider:', error);
				return [];
			}
		}));
		
		return results.flat();
	}

	private async getReferences(position: Position, textModel: ITextModel, token: CancellationToken) {
		const providers = this.languageFeaturesService.referenceProvider.all(textModel);
		const results = await Promise.all(providers.map(async provider => {
			try {
				return await provider.provideReferences(textModel, position, { includeDeclaration: true }, token) || [];
			} catch (error) {
				this.logService.warn('Error from reference provider:', error);
				return [];
			}
		}));
		
		return results.flat();
	}

	private async getImplementations(position: Position, textModel: ITextModel, token: CancellationToken) {
		const providers = this.languageFeaturesService.implementationProvider.all(textModel);
		const results = await Promise.all(providers.map(async provider => {
			try {
				return await provider.provideImplementation(textModel, position, token) || [];
			} catch (error) {
				this.logService.warn('Error from implementation provider:', error);
				return [];
			}
		}));
		
		return results.flat();
	}
}