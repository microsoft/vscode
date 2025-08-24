/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IRuntimeSessionService } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { ILanguageRuntimeMessageOutput, ILanguageRuntimeMessageResult, ILanguageRuntimeMessageError, ILanguageRuntimeMessageStream, RuntimeCodeExecutionMode, RuntimeErrorBehavior, LanguageRuntimeSessionMode } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { RuntimeStartMode } from '../../../../services/runtimeSession/common/runtimeSessionService.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IRuntimeStartupService } from '../../../../services/runtimeStartup/common/runtimeStartupService.js';


export const IJupytextService = createDecorator<IJupytextService>('jupytextService');

export interface JupytextOptions {
	extension: string;
	format_name: string;
}

export interface NotebookPreservationData {
	originalNotebook: any;  // Full original .ipynb JSON
	cellSources: string[];  // Array of original cell source code for comparison
	filePath: string;       // Original file path
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
	private _backgroundSession: any = null; // Store our background session

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRuntimeSessionService private readonly runtimeSessionService: IRuntimeSessionService,
		@ICommandService private readonly commandService: ICommandService,
		@IRuntimeStartupService private readonly runtimeStartupService: IRuntimeStartupService
	) {}

	/**
	 * Get or create a background Python session for jupytext operations
	 */
	private async getBackgroundPythonSession(): Promise<any> {
		// Return existing session if available
		if (this._backgroundSession) {
			return this._backgroundSession;
		}



		// Get the preferred Python runtime
		const pythonRuntime = this.runtimeStartupService.getPreferredRuntime('python');
		if (!pythonRuntime) {
			throw new Error('No Python interpreter is available');
		}

		// Start the background session
		const sessionId = await this.runtimeSessionService.startNewRuntimeSession(
			pythonRuntime.runtimeId,
			'Jupytext Background Session',
			LanguageRuntimeSessionMode.Background,
			undefined, // notebookUri
			'jupytext-service', // source
			RuntimeStartMode.Starting,
			false // activate
		);

		// Get the session object
		this._backgroundSession = this.runtimeSessionService.getSession(sessionId);
		if (!this._backgroundSession) {
			throw new Error('Failed to get background session after creation');
		}
		


		return this._backgroundSession;
	}

	/**
	 * Check if jupytext is installed by trying to import it
	 */
	async checkJupytextInstallation(): Promise<boolean> {
		const session = await this.getBackgroundPythonSession();

		const executionId = generateUuid();
		const command = `
try:
    import jupytext
    import json
    import nbformat
    print("JUPYTEXT_AVAILABLE")
except ImportError as e:
    print(f"JUPYTEXT_NOT_AVAILABLE: {e}")
`;

		this.logService.info(`[JUPYTEXT DEBUG] Starting availability check with session: ${session.sessionId}`);
		this.logService.info(`[JUPYTEXT DEBUG] Execution ID: ${executionId}`);

		return new Promise<boolean>((resolve) => {
			let outputBuffer = '';
			let errorBuffer = '';
			const disposables: IDisposable[] = [];

			const timeoutHandle = setTimeout(() => {
				cleanup();
				this._isJupytextAvailable = false;
				resolve(false);
			}, 10000);

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
				if (message.parent_id === executionId) {
					const data = message.data['text/plain'] || message.data || '';
					if (typeof data === 'string') {
						outputBuffer += data;
						this.logService.info(`[JUPYTEXT DEBUG] Received output: "${data}"`);
					}
				}
			}));

			// Add error message handling
			disposables.push(session.onDidReceiveRuntimeMessageError?.((message: any) => {
				if (message.parent_id === executionId) {
					const errorMsg = message.message || message.name || String(message);
					errorBuffer += errorMsg;
					this.logService.error(`[JUPYTEXT DEBUG] Received error: "${errorMsg}"`);
				}
			}));

			// Add stream message handling (stdout/stderr)
			disposables.push(session.onDidReceiveRuntimeMessageStream?.((message: any) => {
				if (message.parent_id === executionId) {
					const streamData = message.text || '';
					if (message.name === 'stdout') {
						outputBuffer += streamData;
						this.logService.info(`[JUPYTEXT DEBUG] Received stdout: "${streamData}"`);
					} else if (message.name === 'stderr') {
						errorBuffer += streamData;
						this.logService.error(`[JUPYTEXT DEBUG] Received stderr: "${streamData}"`);
					}
				}
			}));

			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {
				if (message.parent_id === executionId && message.state === 'idle') {
					cleanup();

					this.logService.info(`[JUPYTEXT DEBUG] Availability check output buffer: "${outputBuffer}"`);
					this.logService.info(`[JUPYTEXT DEBUG] Availability check error buffer: "${errorBuffer}"`);
					
					const isAvailable = outputBuffer.includes('JUPYTEXT_AVAILABLE');
					this._isJupytextAvailable = isAvailable;
					this.logService.info(`[JUPYTEXT DEBUG] Availability check result: ${isAvailable ? 'available' : 'not available'}`);
					
					if (!isAvailable) {
						if (outputBuffer.trim()) {
							this.logService.error(`[JUPYTEXT DEBUG] Availability check failed. Full output: "${outputBuffer.trim()}"`);
						}
						if (errorBuffer.trim()) {
							this.logService.error(`[JUPYTEXT DEBUG] Availability check had errors: "${errorBuffer.trim()}"`);
						}
						if (!outputBuffer.trim() && !errorBuffer.trim()) {
							this.logService.error(`[JUPYTEXT DEBUG] Availability check failed with no output or errors`);
						}
					}
					
					resolve(isAvailable);
				}
			}));

			session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
		});
	}

		/**
	 * Install jupytext using the Python extension's installer service
	 */
	async installJupytext(): Promise<boolean> {
		this.logService.info('[JUPYTEXT DEBUG] Starting jupytext installation...');
		
		try {
			// Get the current Python interpreter path
			this.logService.info('[JUPYTEXT DEBUG] Getting background Python session...');
			const session = await this.getBackgroundPythonSession();
			
			// Get the Python path from the session metadata
			const pythonPath = session.runtimeMetadata.runtimePath;
			this.logService.info(`[JUPYTEXT DEBUG] Python path: ${pythonPath}`);
			
			if (!pythonPath) {
				const error = 'Could not determine Python interpreter path';
				this.logService.error(`[JUPYTEXT DEBUG] ${error}`);
				throw new Error(error);
			}
			
			// Use the Python extension's installer command
			this.logService.info(`[JUPYTEXT DEBUG] Executing command: python.installJupytext with path: ${pythonPath}`);
			const installResult = await this.commandService.executeCommand('python.installJupytext', pythonPath);
			this.logService.info(`[JUPYTEXT DEBUG] Install command result: ${installResult} (type: ${typeof installResult})`);
			
			if (installResult === true) {
				this.logService.info('[JUPYTEXT DEBUG] Installation reported success, marking as available');
				this._isJupytextAvailable = true;
				
				// Verify installation by checking again with a fresh session
				this.logService.info('[JUPYTEXT DEBUG] Verifying installation by re-checking availability with fresh session...');
				
				// Clear the cached session to force getting a fresh one for verification
				this._backgroundSession = null;
				
				// Force a new availability check with fresh session
				const isNowAvailable = await this.checkJupytextInstallation();
				this.logService.info(`[JUPYTEXT DEBUG] Post-install availability check: ${isNowAvailable}`);
				
				if (isNowAvailable) {
					this._isJupytextAvailable = true;
					this.logService.info('[JUPYTEXT DEBUG] Installation verified successfully');
					return true;
				} else {
					const error = 'Installation reported success but verification failed';
					this.logService.error(`[JUPYTEXT DEBUG] ${error}`);
					this._isJupytextAvailable = false;
					return false;
				}
			} else {
				const error = `Python extension installer returned: ${installResult} (expected: true)`;
				this.logService.error(`[JUPYTEXT DEBUG] ${error}`);
				return false;
			}
			
		} catch (error) {
			const errorMsg = `Failed to install jupytext via Python extension: ${error instanceof Error ? error.message : error}`;
			this.logService.error(`[JUPYTEXT DEBUG] ${errorMsg}`);
			return false;
		}
	}

	/**
	 * Ensure jupytext is available, installing if needed
	 */
	private async ensureJupytextAvailable(): Promise<boolean> {
		this.logService.info('[JUPYTEXT DEBUG] ensureJupytextAvailable called');
		
		if (this._isJupytextAvailable === null) {
			this.logService.info('[JUPYTEXT DEBUG] Initial availability check...');
			this._isJupytextAvailable = await this.checkJupytextInstallation();
			this.logService.info(`[JUPYTEXT DEBUG] Initial check result: ${this._isJupytextAvailable}`);
		}
		
		if (!this._isJupytextAvailable) {
			this.logService.info('[JUPYTEXT DEBUG] Jupytext not available, attempting to install...');
			const installSuccess = await this.installJupytext();
			this.logService.info(`[JUPYTEXT DEBUG] Installation result: ${installSuccess}`);
			
			// Update availability state based on installation result
			this._isJupytextAvailable = installSuccess;
		}

		if (!this._isJupytextAvailable) {
			const error = 'CRITICAL: Jupytext is not available and installation failed. Cannot create notebook files without jupytext.';
			this.logService.error(`[JUPYTEXT DEBUG] ${error}`);
			throw new Error(error);
		}

		this.logService.info('[JUPYTEXT DEBUG] Jupytext is confirmed available');
		return this._isJupytextAvailable;
	}

	/**
	 * Convert notebook content (from string) to text format with preservation data for output preservation
	 */
	async notebookContentToTextWithPreservation(notebookContent: string, options: JupytextOptions): Promise<NotebookConversionResult> {
		await this.ensureJupytextAvailable();

		const executionId = generateUuid();
		const session = await this.getBackgroundPythonSession();

		// Validate the notebook content
		try {
			JSON.parse(notebookContent);
		} catch (error) {
			throw new Error(`Invalid notebook JSON: ${error instanceof Error ? error.message : error}`);
		}

		// Escape the JSON string for Python command (notebookContent is already a JSON string)
		const escapedNotebookJson = notebookContent.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

		const command = `
import jupytext
import json
import nbformat

# Parse the notebook from the provided content
notebook_content = """${escapedNotebookJson}"""

# Convert JSON string to proper NotebookNode using nbformat
original_notebook = nbformat.reads(notebook_content, as_version=nbformat.NO_CONVERT)

# Convert to Python text using jupytext (now with proper NotebookNode)
converted_text = jupytext.writes(original_notebook, "py:percent")

# Extract cell sources for comparison
cell_sources = []
for cell in original_notebook.get('cells', []):
    if cell.get('cell_type') == 'code':
        source = cell.get('source', [])
        if isinstance(source, list):
            source = ''.join(source)
        cell_sources.append(source)

print("JUPYTEXT_SUCCESS")
print("PRESERVATION_DATA_START")
print(json.dumps({
    "originalNotebook": dict(original_notebook),  # Convert NotebookNode to dict for JSON
    "cellSources": cell_sources,
    "format": {"extension": ".py", "format_name": "percent"}
}))
print("PRESERVATION_DATA_END")
print("CONVERTED_TEXT_START")
print(converted_text)
print("CONVERTED_TEXT_END")
`;

		return new Promise<NotebookConversionResult>((resolve, reject) => {
			let outputBuffer = '';
			let errorBuffer = '';
			const disposables: IDisposable[] = [];

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			const timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('Conversion timed out'));
			}, 30000);

			// Handle output messages
			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';
					const messageText = typeof messageData === 'string' ? messageData : String(messageData);
					outputBuffer += messageText;
				}
			}));

			// Handle state messages for execution completion
			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {
				if (message.parent_id === executionId && message.state === 'idle') {
					cleanup();
					
					try {
						const output = outputBuffer.trim();
						
						if (!output.includes('JUPYTEXT_SUCCESS')) {
							reject(new Error(`Conversion failed: ${errorBuffer || 'No success marker found'}`));
							return;
						}

						// Extract preservation data
						const preservationMatch = output.match(/PRESERVATION_DATA_START\n(.*?)\nPRESERVATION_DATA_END/s);
						const textMatch = output.match(/CONVERTED_TEXT_START\n(.*?)\nCONVERTED_TEXT_END/s);

						if (!preservationMatch || !textMatch) {
							reject(new Error('Failed to extract conversion data'));
							return;
						}

						const preservationData = JSON.parse(preservationMatch[1]);
						const pythonText = textMatch[1];

						resolve({
							pythonText,
							preservationData: {
								originalNotebook: preservationData.originalNotebook,
								cellSources: preservationData.cellSources,
								filePath: '' // Will be set by the document manager
							}
						});
					} catch (error) {
						reject(new Error(`Failed to parse conversion result: ${error instanceof Error ? error.message : error}`));
					}
				}
			}));

			// Handle result messages (execution results)
			disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';
					const messageText = typeof messageData === 'string' ? messageData : String(messageData);
					outputBuffer += messageText;
				}
			}));

			// Handle error messages
			disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
				if (message.parent_id === executionId) {
					errorBuffer += message.name + ': ' + message.message + '\n';
					if (message.traceback) {
						errorBuffer += message.traceback.join('\n') + '\n';
					}
				}
			}));

			// Handle stream messages (stdout/stderr in real-time)
			disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
				if (message.parent_id === executionId) {
					if (message.name === 'stdout') {
						outputBuffer += message.text;
					} else if (message.name === 'stderr') {
						errorBuffer += message.text;
					}
				}
			}));

			// Execute the command
			session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
		});
	}

		/**
	 * Convert notebook file to text format with preservation data for output preservation
	 */
	async notebookToTextWithPreservation(filePath: string, options: JupytextOptions): Promise<NotebookConversionResult> {
		await this.ensureJupytextAvailable();


		const executionId = generateUuid();
		const session = await this.getBackgroundPythonSession();

		const escapedPath = filePath.replace(/\\/g, '\\\\');

		const command = `
import jupytext
import json

# Read the original notebook to preserve structure
with open("${escapedPath}", 'r') as f:
    original_notebook = json.load(f)

# Convert to Python text
notebook = jupytext.read("${escapedPath}")
converted_text = jupytext.writes(notebook, "py:percent")

# Extract cell sources for comparison
cell_sources = []
for cell in original_notebook.get('cells', []):
    if cell.get('cell_type') == 'code':
        source = cell.get('source', [])
        if isinstance(source, list):
            cell_sources.append(''.join(source))
        else:
            cell_sources.append(str(source))
    elif cell.get('cell_type') == 'markdown':
        source = cell.get('source', [])
        if isinstance(source, list):
            cell_sources.append(''.join(source))
        else:
            cell_sources.append(str(source))

# Output results with markers
print("=== ORIGINAL_NOTEBOOK_START ===")
print(json.dumps(original_notebook))
print("=== ORIGINAL_NOTEBOOK_END ===")
print("=== CELL_SOURCES_START ===")
print(json.dumps(cell_sources))
print("=== CELL_SOURCES_END ===")
print("=== PYTHON_TEXT_START ===")
print(converted_text)
print("=== PYTHON_TEXT_END ===")
`;

		return new Promise<NotebookConversionResult>((resolve, reject) => {
			let outputBuffer = '';
			let errorBuffer = '';
			let resultBuffer = '';
			const disposables: IDisposable[] = [];

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			const timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('Conversion timed out'));
			}, 30000);

			// Handle output messages (stdout)
			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {

				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					outputBuffer += messageData;
				}
			}));

			// Handle state messages for execution completion
			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {

				if (message.parent_id === executionId && message.state === 'idle') {

					cleanup();
					try {
						const fullOutput = (outputBuffer + resultBuffer).trim();
						
						// Parse the structured output
						const originalNotebookMatch = fullOutput.match(/=== ORIGINAL_NOTEBOOK_START ===\n(.*?)\n=== ORIGINAL_NOTEBOOK_END ===/s);
						const cellSourcesMatch = fullOutput.match(/=== CELL_SOURCES_START ===\n(.*?)\n=== CELL_SOURCES_END ===/s);
						const pythonTextMatch = fullOutput.match(/=== PYTHON_TEXT_START ===\n(.*?)\n=== PYTHON_TEXT_END ===/s);
						
						if (!originalNotebookMatch || !cellSourcesMatch || !pythonTextMatch) {
							reject(new Error('Failed to parse conversion output'));
							return;
						}

						const originalNotebook = JSON.parse(originalNotebookMatch[1]);
						const cellSources = JSON.parse(cellSourcesMatch[1]);
						const pythonText = pythonTextMatch[1];

						resolve({
							pythonText,
							preservationData: {
								originalNotebook,
								cellSources,
								filePath
							}
						});
					} catch (error) {
						reject(new Error(`Failed to parse conversion result: ${error instanceof Error ? error.message : error}`));
					}
				}
			}));

			// Handle result messages (execution results)
			disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					resultBuffer += messageData;
					// Don't resolve here - wait for state message indicating idle
				}
			}));

			// Handle error messages
			disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
				if (message.parent_id === executionId) {
					errorBuffer += message.name + ': ' + message.message + '\n';
					if (message.traceback) {
						errorBuffer += message.traceback.join('\n') + '\n';
					}
					cleanup();
					reject(new Error(`Conversion failed: ${errorBuffer.trim()}`));
				}
			}));

			// Handle stream messages (stdout/stderr in real-time)
			disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
				if (message.parent_id === executionId) {
					if (message.name === 'stdout') {
						outputBuffer += message.text;
					} else if (message.name === 'stderr') {
						errorBuffer += message.text;
					}
				}
			}));

			// Execute the command

			session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
		});
	}

	/**
	 * Convert notebook file to text format using jupytext
	 */
		async notebookToText(filePath: string, options: JupytextOptions): Promise<string> {
		await this.ensureJupytextAvailable();



		const executionId = generateUuid();
		const session = await this.getBackgroundPythonSession();

		const escapedPath = filePath.replace(/\\/g, '\\\\');

		const command = `
import jupytext

# Read notebook file and convert to text
notebook = jupytext.read("${escapedPath}")
converted_text = jupytext.writes(notebook, "py:percent")

print(converted_text)
`;

		return new Promise<string>((resolve, reject) => {
			let outputBuffer = '';
			let errorBuffer = '';
			let resultBuffer = '';
			const disposables: IDisposable[] = [];

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			const timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('Conversion timed out'));
			}, 30000);

			// Handle output messages (stdout)
			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {

				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					outputBuffer += messageData;
				}
			}));

			// Handle state messages for execution completion
			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {

				if (message.parent_id === executionId && message.state === 'idle') {

					cleanup();
					// Return both output and result buffers combined
					const finalOutput = (outputBuffer + resultBuffer).trim();
					if (finalOutput) {
						resolve(finalOutput);
					} else if (errorBuffer) {
						reject(new Error(`Conversion failed: ${errorBuffer}`));
					} else {
						reject(new Error('Conversion failed: No output received'));
					}
				}
			}));

			// Handle result messages (execution results)
			disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					resultBuffer += messageData;
					// Don't resolve here - wait for state message indicating idle
				}
			}));

			// Handle error messages
			disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
				if (message.parent_id === executionId) {
					errorBuffer += message.name + ': ' + message.message + '\n';
					if (message.traceback) {
						errorBuffer += message.traceback.join('\n') + '\n';
					}
					cleanup();
					reject(new Error(`Conversion failed: ${errorBuffer.trim()}`));
				}
			}));

			// Handle stream messages (stdout/stderr in real-time)
			disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
				if (message.parent_id === executionId) {
					if (message.name === 'stdout') {
						outputBuffer += message.text;
					} else if (message.name === 'stderr') {
						errorBuffer += message.text;
					}
				}
			}));

			// Execute the command
	
	
			session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
		});
	}

	/**
	 * Convert text to notebook format using jupytext with output capture
	 */
	async textToNotebook(filePath: string, options: JupytextOptions): Promise<string> {
		await this.ensureJupytextAvailable();



		const executionId = generateUuid();
		const session = await this.getBackgroundPythonSession();

		const escapedPath = filePath.replace(/\\/g, '\\\\');

		const command = `
import jupytext
import json

# Read and convert the text file directly to notebook
notebook = jupytext.read("${escapedPath}", fmt="py:percent")

print(json.dumps(notebook, indent=2))
`;

		return new Promise<string>((resolve, reject) => {
			let outputBuffer = '';
			let errorBuffer = '';
			let resultBuffer = '';
			const disposables: IDisposable[] = [];

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			const timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('Conversion timed out'));
			}, 30000);

			// Handle output messages (stdout)
			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {

				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					outputBuffer += messageData;
				}
			}));

			// Handle state messages for execution completion
			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {

				if (message.parent_id === executionId && message.state === 'idle') {

					cleanup();
					// Return both output and result buffers combined
					const finalOutput = (outputBuffer + resultBuffer).trim();
					if (finalOutput) {
						resolve(finalOutput);
					} else if (errorBuffer) {
						reject(new Error(`Conversion failed: ${errorBuffer}`));
					} else {
						reject(new Error('Conversion failed: No output received'));
					}
				}
			}));

			// Handle result messages (execution results)
			disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					resultBuffer += messageData;
					// Don't resolve here - wait for state message indicating idle
				}
			}));

			// Handle error messages
			disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
				if (message.parent_id === executionId) {
					errorBuffer += message.name + ': ' + message.message + '\n';
					if (message.traceback) {
						errorBuffer += message.traceback.join('\n') + '\n';
					}
					cleanup();
					reject(new Error(`Conversion failed: ${errorBuffer.trim()}`));
				}
			}));

			// Handle stream messages (stdout/stderr in real-time)
			disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
				if (message.parent_id === executionId) {
					if (message.name === 'stdout') {
						outputBuffer += message.text;
					} else if (message.name === 'stderr') {
						errorBuffer += message.text;
					}
				}
			}));

					// Execute the command
		session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
	});
}

/**
 * Convert Python text content directly to notebook format using jupytext
 */
async pythonTextToNotebook(pythonText: string, options: JupytextOptions): Promise<string> {
	await this.ensureJupytextAvailable();

	const executionId = generateUuid();
	const session = await this.getBackgroundPythonSession();

	// Escape the Python text for embedding in Python code
	const escapedPythonText = pythonText.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

	const command = `
import jupytext
import json

# Convert the Python text directly to notebook using jupytext
python_text = """${escapedPythonText}"""
notebook = jupytext.reads(python_text, fmt="py:percent")

print(json.dumps(notebook, indent=2))
`;

	return new Promise<string>((resolve, reject) => {
		let outputBuffer = '';
		let errorBuffer = '';
		let resultBuffer = '';
		const disposables: IDisposable[] = [];

		const cleanup = () => {
			clearTimeout(timeoutHandle);
			disposables.forEach(d => d.dispose());
		};

		const timeoutHandle = setTimeout(() => {
			cleanup();
			reject(new Error('Conversion timed out'));
		}, 30000);

		// Handle output messages (stdout)
		disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {

			if (message.parent_id === executionId) {
				const messageData = message.data['text/plain'] || message.data || '';

				outputBuffer += messageData;
			}
		}));

		// Handle state messages for execution completion
		disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {

			if (message.parent_id === executionId && message.state === 'idle') {

				cleanup();
				// Return both output and result buffers combined
				const finalOutput = (outputBuffer + resultBuffer).trim();
				if (finalOutput) {
					resolve(finalOutput);
				} else if (errorBuffer) {
					reject(new Error(`Conversion failed: ${errorBuffer}`));
				} else {
					reject(new Error('Conversion failed: No output received'));
				}
			}
		}));

		// Handle result messages (execution results)
		disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
			if (message.parent_id === executionId) {
				const messageData = message.data['text/plain'] || message.data || '';

				resultBuffer += messageData;
				// Don't resolve here - wait for state message indicating idle
			}
		}));

		// Handle error messages
		disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
			if (message.parent_id === executionId) {
				errorBuffer += message.name + ': ' + message.message + '\n';
				if (message.traceback) {
					errorBuffer += message.traceback.join('\n') + '\n';
				}
				cleanup();
				reject(new Error(`Conversion failed: ${errorBuffer.trim()}`));
			}
		}));

		// Handle stream messages (stdout/stderr in real-time)
		disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
			if (message.parent_id === executionId) {
				if (message.name === 'stdout') {
					outputBuffer += message.text;
				} else if (message.name === 'stderr') {
					errorBuffer += message.text;
				}
			}
		}));

		// Execute the command
		session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
	});
}

	/**
	 * Convert text to notebook format with smart merging to preserve unchanged cell outputs
	 */
	async textToNotebookWithPreservation(pythonText: string, preservationData: NotebookPreservationData, options: JupytextOptions): Promise<string> {
		await this.ensureJupytextAvailable();



		const executionId = generateUuid();
		const session = await this.getBackgroundPythonSession();

		// Escape the Python text and preservation data for embedding in Python code
		const escapedPythonText = pythonText.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
		const escapedOriginalNotebook = JSON.stringify(preservationData.originalNotebook).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
		const escapedCellSources = JSON.stringify(preservationData.cellSources).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

		const command = `
import jupytext
import json
import re

# Parse the preservation data
python_text = """${escapedPythonText}"""
original_notebook = json.loads("""${escapedOriginalNotebook}""")
original_cell_sources = json.loads("""${escapedCellSources}""")

# Convert the new Python text to a notebook structure using jupytext
temp_notebook = jupytext.reads(python_text, fmt="py:percent")

# Extract the new cell sources from the converted notebook
new_cell_sources = []
for i, cell in enumerate(temp_notebook.get('cells', [])):
    cell_type = cell.get('cell_type', 'unknown')
    source = cell.get('source', [])
    if isinstance(source, list):
        source_text = ''.join(source)
    else:
        source_text = str(source)
        
    if cell_type == 'code':
        new_cell_sources.append(source_text)

# Create the merged notebook
merged_notebook = original_notebook.copy()
merged_cells = []

# Track which original cells have been used
original_cell_index = 0
original_code_index = 0

# Go through new cells and match them with original cells
for new_cell_index, new_cell in enumerate(temp_notebook.get('cells', [])):
    new_source = new_cell.get('source', [])
    if isinstance(new_source, list):
        new_source_text = ''.join(new_source)
    else:
        new_source_text = str(new_source)
    

    # For code cells, try to match with original code cells
    if new_cell.get('cell_type') == 'code' and original_code_index < len(original_cell_sources):
        original_source_text = original_cell_sources[original_code_index]

        if new_source_text.strip() == original_source_text.strip():
            # Find the corresponding original cell
            for orig_cell in original_notebook['cells']:
                if orig_cell.get('cell_type') == 'code':
                    orig_source = orig_cell.get('source', [])
                    if isinstance(orig_source, list):
                        orig_source_text = ''.join(orig_source)
                    else:
                        orig_source_text = str(orig_source)
                    
                    if orig_source_text.strip() == original_source_text.strip():

                        merged_cells.append(orig_cell)
                        break
            else:
                merged_cells.append(new_cell)
        else:
            merged_cells.append(new_cell)
        
        original_code_index += 1
    else:
        merged_cells.append(new_cell)


# Update the merged notebook with the new cells
merged_notebook['cells'] = merged_cells

# Output the final merged notebook
print("MERGE_SUCCESS")
print("NOTEBOOK_JSON_START")
print(json.dumps(merged_notebook, indent=2))
print("NOTEBOOK_JSON_END")
`;



		return new Promise<string>((resolve, reject) => {
			let outputBuffer = '';
			let errorBuffer = '';
			let resultBuffer = '';
			const disposables: IDisposable[] = [];

			const cleanup = () => {
				clearTimeout(timeoutHandle);
				disposables.forEach(d => d.dispose());
			};

			const timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error('Conversion timed out'));
			}, 30000);

			// Handle output messages (stdout)
			disposables.push(session.onDidReceiveRuntimeMessageOutput((message: ILanguageRuntimeMessageOutput) => {

				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';


					outputBuffer += messageData;
				}
			}));

			// Handle state messages for execution completion
			disposables.push(session.onDidReceiveRuntimeMessageState((message: any) => {

				if (message.parent_id === executionId && message.state === 'idle') {

					cleanup();
					// Parse the output to extract the JSON notebook
					const finalOutput = (outputBuffer + resultBuffer).trim();
					

					
					if (!finalOutput.includes('MERGE_SUCCESS')) {

						reject(new Error(`Conversion failed: ${errorBuffer || 'No success marker found'}`));
						return;
					}

					// Extract the JSON between markers
					const jsonStartMarker = 'NOTEBOOK_JSON_START';
					const jsonEndMarker = 'NOTEBOOK_JSON_END';
					const jsonStartIndex = finalOutput.indexOf(jsonStartMarker);
					const jsonEndIndex = finalOutput.indexOf(jsonEndMarker);
					

					
					if (jsonStartIndex === -1 || jsonEndIndex === -1) {

						reject(new Error('Conversion failed: Could not find JSON markers'));
						return;
					}
					
					const jsonString = finalOutput.substring(
						jsonStartIndex + jsonStartMarker.length,
						jsonEndIndex
					).trim();
					

					
					if (jsonString) {
						resolve(jsonString);
					} else {

						reject(new Error('Conversion failed: Empty JSON content'));
					}
				}
			}));

			// Handle result messages (execution results)
			disposables.push(session.onDidReceiveRuntimeMessageResult((message: ILanguageRuntimeMessageResult) => {
				if (message.parent_id === executionId) {
					const messageData = message.data['text/plain'] || message.data || '';

					resultBuffer += messageData;
					// Don't resolve here - wait for state message indicating idle
				}
			}));

			// Handle error messages
			disposables.push(session.onDidReceiveRuntimeMessageError((message: ILanguageRuntimeMessageError) => {
				if (message.parent_id === executionId) {
					errorBuffer += message.name + ': ' + message.message + '\n';
					if (message.traceback) {
						errorBuffer += message.traceback.join('\n') + '\n';
					}
					cleanup();
					reject(new Error(`Conversion failed: ${errorBuffer.trim()}`));
				}
			}));

			// Handle stream messages (stdout/stderr in real-time)
			disposables.push(session.onDidReceiveRuntimeMessageStream((message: ILanguageRuntimeMessageStream) => {
				if (message.parent_id === executionId) {
					if (message.name === 'stdout') {
						outputBuffer += message.text;
					} else if (message.name === 'stderr') {
						errorBuffer += message.text;
					}
				}
			}));

			// Execute the command

			session.execute(command, executionId, RuntimeCodeExecutionMode.Silent, RuntimeErrorBehavior.Continue);
		});
	}
}