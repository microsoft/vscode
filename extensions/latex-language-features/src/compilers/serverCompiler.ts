/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { OutputChannelLogger } from '../utils/logger';
import { CompilationResult } from '../latexService';
import { RecipeManager } from './recipe';

// Conditionally import child_process only in Node.js context
// Use dynamic require to avoid webpack bundling it in browser builds
type ExecFunction = (command: string, options?: { cwd?: string; maxBuffer?: number; timeout?: number }) => Promise<{ stdout: string; stderr: string }>;

// Lazy initialization - only get exec function when needed and in Node.js context
let execFunction: ExecFunction | undefined | null = null;

function getExecFunction(): ExecFunction | undefined {
	// Return cached value if already initialized
	if (execFunction !== null) {
		return execFunction;
	}

	// Check if we're in browser context first (before trying to require)
	// In browser, typeof process is 'undefined' or process.versions.node is undefined
	if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
		execFunction = undefined;
		return undefined;
	}

	try {
		// Use Function constructor to prevent webpack from processing this require
		// This is only executed in Node.js context, not in browser

		const requireFunc = new Function('moduleName', 'return require(moduleName)');
		const cp = requireFunc('child_process');
		const util = requireFunc('util');
		const { promisify } = util;
		execFunction = promisify(cp.exec) as ExecFunction;
		return execFunction;
	} catch {
		// Not available in browser context
		execFunction = undefined;
		return undefined;
	}
}

/**
 * Server-side LaTeX compiler
 * Uses system LaTeX installation (pdflatex, xelatex, lualatex, latexmk)
 */
export class ServerLatexCompiler {
	constructor(private readonly logger: OutputChannelLogger) { }

	async compile(uri: vscode.Uri, recipe: string): Promise<CompilationResult> {
		try {
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
			if (!workspaceFolder) {
				throw new Error('No workspace folder found');
			}

			// Get recipe definition
			const recipeDef = RecipeManager.getRecipe(recipe);
			if (!recipeDef) {
				this.logger.warn(`Unknown recipe: ${recipe}, falling back to pdflatex`);
				// Fallback to pdflatex if recipe not found
				const fallbackRecipe = RecipeManager.getRecipe('pdflatex');
				if (fallbackRecipe) {
					return await this.compileWithRecipe(uri, fallbackRecipe, workspaceFolder);
				}
				return {
					success: false,
					error: `Unknown recipe: ${recipe}`
				};
			}

			this.logger.info(`Compiling with server-side compiler: ${recipe} (${recipeDef.steps.length} step(s))`);
			return await this.compileWithRecipe(uri, recipeDef, workspaceFolder);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Server compilation error: ${message}`);
			return {
				success: false,
				error: message
			};
		}
	}

	private async compileWithRecipe(
		uri: vscode.Uri,
		recipe: { name: string; steps: Array<{ name: string; command: string; args: string[] }> },
		workspaceFolder: vscode.WorkspaceFolder
	): Promise<CompilationResult> {
		// Check if we're in web context
		const isWeb = vscode.env.uiKind === vscode.UIKind.Web;

		// In web context, we can't use system commands
		if (isWeb) {
			const errorMsg = 'LaTeX compilation not available in web context. ' +
				'System commands cannot be executed in browser. ' +
				'Please use WASM compiler (set latex.compilation.mode to "wasm") or use Electron/desktop version.';
			this.logger.error(errorMsg);
			return {
				success: false,
				error: errorMsg
			};
		}

		// Use system commands (Electron/desktop only)
		return await this.compileWithSystemCommand(uri, recipe, workspaceFolder);
	}

	private async compileWithSystemCommand(
		uri: vscode.Uri,
		recipe: { name: string; steps: Array<{ name: string; command: string; args: string[] }> },
		workspaceFolder: vscode.WorkspaceFolder
	): Promise<CompilationResult> {
		try {
			// Get file paths
			const uriPath = uri.fsPath || uri.path;
			const dirPath = path.dirname(uriPath);
			const fileName = path.basename(uriPath);
			const lastDot = fileName.lastIndexOf('.');
			const baseName = lastDot >= 0 ? fileName.substring(0, lastDot) : fileName;
			const docPath = path.join(dirPath, baseName);

			// Use workspace folder as working directory
			const workingDir = workspaceFolder.uri.fsPath || workspaceFolder.uri.path;

			this.logger.info(`Compiling with system commands in: ${dirPath}`);
			this.logger.info(`Document base name: ${baseName}`);

			// Execute recipe steps sequentially
			let lastError: string | undefined;
			let logContent: string = '';

			for (const step of recipe.steps) {
				this.logger.info(`Executing step: ${step.name} (${step.command})`);

				// Expand recipe placeholders
				const expandedArgs = RecipeManager.expandRecipeArgs(step.args, docPath, baseName);

				// Build command line
				const command = step.command;
				const args = expandedArgs;

				this.logger.info(`Running: ${command} ${args.join(' ')}`);

				try {
					// Get exec function (lazy initialization)
					const exec = getExecFunction();
					if (!exec) {
						throw new Error('child_process is not available in browser context');
					}

					// Execute command
					// Escape arguments properly for shell
					const escapedArgs = args.map(arg => {
						// Simple escaping - wrap in quotes if contains spaces
						if (arg.includes(' ') || arg.includes('"')) {
							return `"${arg.replace(/"/g, '\\"')}"`;
						}
						return arg;
					});
					const commandLine = `${command} ${escapedArgs.join(' ')}`;

					const { stdout, stderr } = await exec(commandLine, {
						cwd: workingDir,
						maxBuffer: 10 * 1024 * 1024, // 10MB buffer
						timeout: 60000 // 60 second timeout per step
					});

					// Collect output
					if (stdout) {
						logContent += stdout;
						this.logger.info(`Step ${step.name} stdout: ${stdout.substring(0, 200)}...`);
					}
					if (stderr) {
						logContent += stderr;
						this.logger.warn(`Step ${step.name} stderr: ${stderr.substring(0, 200)}...`);
					}

					// For bibtex, errors are expected if there are no citations
					// Continue even if bibtex returns non-zero exit code
					if (step.name === 'bibtex' && stderr) {
						this.logger.info('BibTeX step completed (warnings are normal if no citations)');
						continue;
					}
				} catch (error: any) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					const errorOutput = error.stdout || error.stderr || errorMessage;

					logContent += `\n=== Error in step ${step.name} ===\n${errorOutput}\n`;

					// For bibtex, continue even on error (might not have citations)
					if (step.name === 'bibtex') {
						this.logger.warn(`BibTeX step had errors (this is normal if there are no citations): ${errorMessage}`);
						continue;
					}

					// For other steps, log the error but continue (some recipes run multiple passes)
					this.logger.warn(`Step ${step.name} had errors: ${errorMessage}`);
					lastError = errorMessage;
				}
			}

			// Check if PDF was generated
			const pdfPath = path.join(dirPath, `${baseName}.pdf`);
			const logPath = path.join(dirPath, `${baseName}.log`);

			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(pdfPath));

				// Try to read log file if available
				let finalLogContent = logContent;
				try {
					const logBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(logPath));
					finalLogContent = new TextDecoder('utf-8').decode(logBytes);
				} catch {
					// Use collected log content if file doesn't exist
				}

				this.logger.info(`Compilation successful. PDF generated: ${pdfPath}`);
				return {
					success: true,
					pdfPath: pdfPath,
					logPath: logPath,
					logContent: finalLogContent
				};
			} catch {
				// PDF not generated - read log for diagnostics
				let finalLogContent = logContent;
				try {
					const logBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(logPath));
					finalLogContent = new TextDecoder('utf-8').decode(logBytes);
				} catch {
					// Log file might not exist
				}

				const errorMsg = lastError || 'PDF not generated after compilation';
				this.logger.error(`Compilation failed: ${errorMsg}`);
				return {
					success: false,
					error: errorMsg,
					logContent: finalLogContent
				};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`System command compilation failed: ${message}`);
			return {
				success: false,
				error: message
			};
		}
	}

	dispose(): void {
		// Nothing to dispose
	}
}

