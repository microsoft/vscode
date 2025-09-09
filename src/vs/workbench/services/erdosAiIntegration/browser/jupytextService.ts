/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export const IJupytextService = createDecorator<IJupytextService>('jupytextService');

export interface JupytextOptions {
	extension: string;
	format_name: string;
}

export interface NotebookPreservationData {
	originalNotebook: any;
	cellData: CellData[];
	nbformat?: number;
	nbformat_minor?: number;
	metadata?: any;
	filePath: string;
}

export interface CellData {
	index: number;
	cell_type: string;
	source: string;
	metadata: any;
	id: string;
	outputs?: any[];
	execution_count?: number | null;
	attachments?: any;
}

export interface NotebookConversionResult {
	pythonText: string;
	preservationData: NotebookPreservationData;
}

export interface IJupytextService {
	readonly _serviceBrand: undefined;
	
	convertNotebookToText(input: { content: string } | { filePath: string }, options: JupytextOptions): Promise<NotebookConversionResult>;
	convertTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string>;
	convertTextToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string>;
}

export class JupytextService extends Disposable implements IJupytextService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	private async performInMemoryConversion(operation: string, params: any): Promise<any> {
		if (!CommandsRegistry.getCommand('python.jupytextConverter')) {
			throw new Error(`CRITICAL: python.jupytextConverter command not registered`);
		}
		
		const result = await this.commandService.executeCommand('python.jupytextConverter', operation, params);
		
		if (!result) {
			throw new Error(`JUPYTEXT EXECUTION FAILED: Command returned null/undefined for operation: ${operation}`);
		}
		
		if (typeof result !== 'string') {
			throw new Error(`JUPYTEXT EXECUTION FAILED: Command returned invalid type ${typeof result}, expected string for operation: ${operation}`);
		}
		
		const jsonResult = JSON.parse(result);
		
		if (!jsonResult.success) {
			throw new Error(`JUPYTEXT OPERATION FAILED: ${operation} - ${jsonResult.error || 'Unknown error'}`);
		}
		
		return jsonResult;
	}

	async convertNotebookToText(input: { content: string } | { filePath: string }, options: JupytextOptions): Promise<NotebookConversionResult> {
		let notebookContent: string;
		let filePath = '';
		
		if ('content' in input) {
			notebookContent = input.content;
		} else {
			filePath = input.filePath;
			const fileUri = URI.file(filePath);
			const fileContent = await this.fileService.readFile(fileUri);
			notebookContent = fileContent.value.toString();
		}
		
		const result = await this.performInMemoryConversion('notebook-content-to-text-with-preservation', {
			notebookContent,
			format: options.format_name
		});

		const conversionResult = {
			pythonText: result.text,
			preservationData: {
				originalNotebook: result.preservation_data.originalNotebook,
				cellData: result.preservation_data.cellData,
				nbformat: result.preservation_data.nbformat,
				nbformat_minor: result.preservation_data.nbformat_minor,
				metadata: result.preservation_data.metadata,
				filePath: filePath
			}
		};
		
		return conversionResult;
	}

	async convertTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string> {
		const result = await this.performInMemoryConversion('text-to-notebook', {
			textContent: pythonText,
			format: options.format_name
		});

		return result.notebook_json;
	}

	async convertTextToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string> {
		const result = await this.performInMemoryConversion('text-to-notebook-with-preservation', {
			textContent: pythonText,
			preservationData: preservationData,
			format: options.format_name
		});

		return result.notebook_json;
	}
}
