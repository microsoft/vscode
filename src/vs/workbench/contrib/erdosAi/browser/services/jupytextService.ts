/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';

export const IJupytextService = createDecorator<IJupytextService>('jupytextService');

export interface JupytextOptions {
	extension: string;
	format_name: string;
}

export interface NotebookPreservationData {
	originalNotebook: any;  // Full original .ipynb JSON
	cellData: CellData[];   // Comprehensive cell data with outputs, metadata, etc.
	nbformat?: number;
	nbformat_minor?: number;
	metadata?: any;
	filePath: string;       // Original file path
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
	
	/**
	 * Convert notebook file to text format using jupytext
	 */
	notebookToText(filePath: string, options: JupytextOptions): Promise<string>;
	
	/**
	 * Convert notebook content (JSON string) to text format using jupytext
	 */
	notebookContentToText(notebookContent: string, options: JupytextOptions): Promise<string>;
	
	/**
	 * Convert notebook content (from string) to text format with preservation data for output preservation
	 */
	notebookContentToTextWithPreservation(notebookContent: string, options: JupytextOptions): Promise<NotebookConversionResult>;

	/**
	 * Convert notebook file to text format with preservation data for output preservation
	 */
	notebookToTextWithPreservation(filePath: string, options: JupytextOptions): Promise<NotebookConversionResult>;
	
	/**
	 * Convert text file to notebook format using jupytext
	 */
	textToNotebook(filePath: string, options: JupytextOptions): Promise<string>;
	
	/**
	 * Convert text to notebook format with smart merging to preserve unchanged cell outputs
	 */
	textToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string>;
	/**
	 * Convert Python text content directly to notebook format using jupytext
	 */
	pythonTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string>;
}

export class JupytextService implements IJupytextService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService
	) {}

	/**
	 * Execute a jupytext script
	 */
	private async executeJupytextScript(operation: string, args: any): Promise<any> {
		const result = await this.commandService.executeCommand('python.jupytextConverter', operation, args);
		
		if (!result) {
			throw new Error(`JUPYTEXT EXECUTION FAILED: Command returned null/undefined for operation: ${operation}`);
		}
		
		if (typeof result !== 'string') {
			throw new Error(`JUPYTEXT EXECUTION FAILED: Command returned invalid type ${typeof result}, expected string for operation: ${operation}`);
		}
		
		// Parse JSON response - let any JSON errors bubble up
		const jsonResult = JSON.parse(result);
		
		if (!jsonResult.success) {
			throw new Error(`JUPYTEXT OPERATION FAILED: ${operation} - ${jsonResult.error || 'Unknown error'}`);
		}
		
		return jsonResult;
	}

	/**
	 * Execute jupytext conversion entirely in-memory
	 */
	private async performInMemoryConversion(operation: string, params: any): Promise<any> {
		// Check for the specific command we need
		if (!CommandsRegistry.getCommand('python.jupytextConverter')) {
			throw new Error(`CRITICAL: python.jupytextConverter command not registered`);
		}
		
		const result = await this.executeJupytextScript(operation, params);
		return result;
	}

	/**
	 * Convert notebook content (from string) to text format with preservation data for output preservation
	 */
	async notebookContentToTextWithPreservation(notebookContent: string, options: JupytextOptions): Promise<NotebookConversionResult> {
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
				filePath: result.preservation_data.filePath || ''
			}
		};
		
		return conversionResult;
	}

	/**
	 * Convert notebook file to text format with preservation data for output preservation  
	 */
	async notebookToTextWithPreservation(filePath: string, options: JupytextOptions): Promise<NotebookConversionResult> {
		// Read the file content using VSCode's file service
		const fileUri = URI.file(filePath);
		const fileContent = await this.fileService.readFile(fileUri);
		const notebookContent = fileContent.value.toString();
		
		const result = await this.notebookContentToTextWithPreservation(notebookContent, options);
		
		// Update the file path in the preservation data
		result.preservationData.filePath = filePath;
		
		return result;
	}

	/**
	 * Convert notebook file to text format using jupytext
	 */
	async notebookToText(filePath: string, options: JupytextOptions): Promise<string> {
		// Read the file content using VSCode's file service
		const fileUri = URI.file(filePath);
		const fileContent = await this.fileService.readFile(fileUri);
		const notebookContent = fileContent.value.toString();
		const result = await this.notebookContentToText(notebookContent, options);
		return result;
	}

	/**
	 * Convert notebook content (JSON object) to text format using jupytext
	 */
	async notebookContentToText(notebookContent: string, options: JupytextOptions): Promise<string> {
		const result = await this.performInMemoryConversion('notebook-content-to-text', {
			notebookContent,
			format: options.format_name
		});

		return result.text;
	}

	/**
	 * Convert text file to notebook format using jupytext
	 */
	async textToNotebook(filePath: string, options: JupytextOptions): Promise<string> {
		// Read the file content using VSCode's file service
		const fileUri = URI.file(filePath);
		const fileContent = await this.fileService.readFile(fileUri);
		const textContent = fileContent.value.toString();
		const result = await this.pythonTextToNotebook(textContent, options);
		return result;
	}

	/**
	 * Convert Python text content directly to notebook format using jupytext
	 */
	async pythonTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string> {
		const result = await this.performInMemoryConversion('text-to-notebook', {
			textContent: pythonText,
			format: options.format_name
		});

		return result.notebook_json;
	}

	/**
	 * Convert text to notebook format with smart merging to preserve unchanged cell outputs
	 */
	async textToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string> {
		const result = await this.performInMemoryConversion('text-to-notebook-with-preservation', {
			textContent: pythonText,
			preservationData: preservationData,
			format: options.format_name
		});

		return result.notebook_json;
	}
}