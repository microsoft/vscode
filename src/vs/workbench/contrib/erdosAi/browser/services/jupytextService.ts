/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';



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
	 * Automatically installs jupytext if needed using the Python extension's installer
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
	 * Automatically installs jupytext if needed using the Python extension's installer
	 */
	textToNotebook(filePath: string, options: JupytextOptions): Promise<string>;
	
	/**
	 * Convert text to notebook format with smart merging to preserve unchanged cell outputs
	 */
	textToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string>;
	
	/**
	 * Check if jupytext is installed by testing import
	 */
	checkJupytextInstallation(): Promise<boolean>;
	
	/**
	 * Install jupytext using the Python extension's installer service
	 */
	installJupytext(): Promise<boolean>;

	/**
	 * Convert Python text content directly to notebook format using jupytext
	 */
	pythonTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string>;
}

export class JupytextService implements IJupytextService {
	declare readonly _serviceBrand: undefined;

	private _isJupytextAvailable: boolean | null = null;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService
	) {}

	/**
	 * Get the Python interpreter path from the Python extension
	 */
	private async getPythonPath(): Promise<string> {
		// Get the Python path from the extension's command
		const pythonPath = await this.commandService.executeCommand('python.interpreterPath');
		if (!pythonPath || typeof pythonPath !== 'string') {
			throw new Error('No Python interpreter is available');
		}
		return pythonPath;
	}



	/**
	 * Execute a jupytext script with the given arguments using the erdos-python extension
	 */
	private async executeJupytextScript(operation: string, args: any): Promise<any> {
		this.logService.info(`[JUPYTEXT] Executing operation: ${operation}`);
		
		const result = await this.commandService.executeCommand('python.jupytextConverter', operation, args);
		
		if (!result || typeof result !== 'string') {
			throw new Error(`Jupytext operation failed: Invalid result`);
		}
		
		// Parse JSON response
		try {
			const jsonResult = JSON.parse(result);
			
			if (!jsonResult.success) {
				this.logService.error(`[JUPYTEXT] Script failed: ${jsonResult.error}`);
				throw new Error(`Jupytext script failed: ${jsonResult.error}`);
			}
			
			return jsonResult;
		} catch (parseError) {
			this.logService.error(`[JUPYTEXT] Failed to parse result: ${parseError}, raw result: ${result}`);
			throw new Error(`Failed to parse jupytext result: ${parseError}`);
		}
	}

	/**
	 * Check if jupytext is installed by trying to import it
	 */
	async checkJupytextInstallation(): Promise<boolean> {
		if (this._isJupytextAvailable !== null) {
			return this._isJupytextAvailable;
		}

		try {
			const result = await this.executeJupytextScript('check-installation', {});
			
			this._isJupytextAvailable = !!result.success;
			this.logService.info(`[JUPYTEXT] Installation check result: ${result.success ? 'available' : 'not available'}`);
			
			return this._isJupytextAvailable;
		} catch (error) {
			this.logService.error(`[JUPYTEXT] Installation check failed: ${error}`);
			this._isJupytextAvailable = false;
			return false;
		}
	}

	/**
	 * Install jupytext using the Python extension's installer service
	 */
	async installJupytext(): Promise<boolean> {
		this.logService.info('[JUPYTEXT] Starting jupytext installation...');
		
		try {
			const pythonPath = await this.getPythonPath();
			this.logService.info(`[JUPYTEXT] Installing jupytext for Python: ${pythonPath}`);
			
			const installResult = await this.commandService.executeCommand('python.installJupytext', pythonPath);
			this.logService.info(`[JUPYTEXT] Install command result: ${installResult}`);
			
			if (installResult === true) {
				// Clear cached availability and re-check
				this._isJupytextAvailable = null;
				const isNowAvailable = await this.checkJupytextInstallation();
				
				if (isNowAvailable) {
					this.logService.info('[JUPYTEXT] Installation verified successfully');
					return true;
				} else {
					this.logService.error('[JUPYTEXT] Installation verification failed');
					return false;
				}
			} else {
				this.logService.error(`[JUPYTEXT] Installation failed: ${installResult}`);
				return false;
			}
			
		} catch (error) {
			this.logService.error(`[JUPYTEXT] Installation error: ${error}`);
			return false;
		}
	}

	/**
	 * Ensure jupytext is available, installing if needed
	 */
	private async ensureJupytextAvailable(): Promise<boolean> {
		if (this._isJupytextAvailable === null) {
			this._isJupytextAvailable = await this.checkJupytextInstallation();
		}
		
		if (!this._isJupytextAvailable) {
			this.logService.info('[JUPYTEXT] Jupytext not available, attempting to install...');
			const installSuccess = await this.installJupytext();
			this._isJupytextAvailable = installSuccess;
		}

		if (!this._isJupytextAvailable) {
			throw new Error('Jupytext is not available and installation failed. Cannot perform notebook conversions without jupytext.');
		}

		return this._isJupytextAvailable;
	}

	/**
	 * Execute jupytext conversion entirely in-memory
	 */
	private async performInMemoryConversion(operation: string, params: any): Promise<any> {
		await this.ensureJupytextAvailable();
		return await this.executeJupytextScript(operation, params);
	}

	/**
	 * Convert notebook content (from string) to text format with preservation data for output preservation
	 */
	async notebookContentToTextWithPreservation(notebookContent: string, options: JupytextOptions): Promise<NotebookConversionResult> {
		const result = await this.performInMemoryConversion('notebook-content-to-text-with-preservation', {
			notebookContent,
			format: options.format_name
		});

		return {
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
	}

	/**
	 * Convert notebook file to text format with preservation data for output preservation  
	 */
	async notebookToTextWithPreservation(filePath: string, options: JupytextOptions): Promise<NotebookConversionResult> {
		// Read the file content and use the content-based method
		const fs = await import('fs');
		const notebookContent = await fs.promises.readFile(filePath, 'utf8');
		
		const result = await this.notebookContentToTextWithPreservation(notebookContent, options);
		
		// Update the file path in the preservation data
		result.preservationData.filePath = filePath;
		
		return result;
	}

	/**
	 * Convert notebook file to text format using jupytext
	 */
	async notebookToText(filePath: string, options: JupytextOptions): Promise<string> {
		// Read the file content and use the content-based method
		const fs = await import('fs');
		const notebookContent = await fs.promises.readFile(filePath, 'utf8');
		return await this.notebookContentToText(notebookContent, options);
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
		// Read the file content and use the content-based method
		const fs = await import('fs');
		const textContent = await fs.promises.readFile(filePath, 'utf8');
		return await this.pythonTextToNotebook(textContent, options);
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