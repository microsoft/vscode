// Son of Anton — LSIF/SCIP Index Runner
// Runs language-specific LSIF or SCIP indexers to generate cross-reference data.

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { LsifConfig } from '../config';

const execFileAsync = promisify(execFile);

export interface IndexerTool {
	language: string;
	command: string;
	args: string[];
	outputFile: string;
	format: 'lsif' | 'scip';
}

export interface RunResult {
	language: string;
	format: 'lsif' | 'scip';
	outputFile: string;
	success: boolean;
	durationMs: number;
	error?: string;
}

export class LsifRunner {
	private readonly config: LsifConfig;

	constructor(config: LsifConfig) {
		this.config = config;
	}

	/**
	 * Run all available indexers for the configured languages.
	 */
	async runAll(): Promise<RunResult[]> {
		const tools = this.discoverTools();
		const results: RunResult[] = [];

		for (const tool of tools) {
			const result = await this.runTool(tool);
			results.push(result);
		}

		return results;
	}

	/**
	 * Run the indexer for a specific language.
	 */
	async runForLanguage(language: string): Promise<RunResult | null> {
		const tools = this.discoverTools();
		const tool = tools.find(t => t.language === language);

		if (!tool) {
			console.warn(`[lsif-runner] No indexer available for ${language}`);
			return null;
		}

		return this.runTool(tool);
	}

	/**
	 * Discover which LSIF/SCIP indexer tools are available on the system.
	 */
	private discoverTools(): IndexerTool[] {
		const tools: IndexerTool[] = [];
		const outputDir = this.config.lsif.outputDir;
		const projectPath = this.config.project.path;

		for (const language of this.config.project.languages) {
			const tool = this.getToolForLanguage(language, projectPath, outputDir);
			if (tool) {
				tools.push(tool);
			}
		}

		return tools;
	}

	private getToolForLanguage(
		language: string,
		projectPath: string,
		outputDir: string
	): IndexerTool | null {
		const preferScip = this.config.lsif.preferScip;

		switch (language) {
			case 'typescript':
			case 'javascript':
				if (preferScip) {
					return {
						language,
						command: 'scip-typescript',
						args: ['index', '--cwd', projectPath, '--output', path.join(outputDir, 'typescript.scip')],
						outputFile: path.join(outputDir, 'typescript.scip'),
						format: 'scip',
					};
				}
				return {
					language,
					command: 'lsif-tsc',
					args: ['-p', projectPath, '--stdout'],
					outputFile: path.join(outputDir, 'typescript.lsif'),
					format: 'lsif',
				};

			case 'python':
				if (preferScip) {
					return {
						language,
						command: 'scip-python',
						args: ['index', projectPath, '--output', path.join(outputDir, 'python.scip')],
						outputFile: path.join(outputDir, 'python.scip'),
						format: 'scip',
					};
				}
				return {
					language,
					command: 'lsif-py',
					args: [projectPath],
					outputFile: path.join(outputDir, 'python.lsif'),
					format: 'lsif',
				};

			case 'rust':
				return {
					language,
					command: 'rust-analyzer',
					args: ['lsif', projectPath],
					outputFile: path.join(outputDir, 'rust.lsif'),
					format: 'lsif',
				};

			case 'csharp':
				if (preferScip) {
					return {
						language,
						command: 'scip-dotnet',
						args: ['index', projectPath, '--output', path.join(outputDir, 'csharp.scip')],
						outputFile: path.join(outputDir, 'csharp.scip'),
						format: 'scip',
					};
				}
				return null;

			case 'cpp':
			case 'c':
				return {
					language,
					command: 'lsif-clang',
					args: [projectPath],
					outputFile: path.join(outputDir, `${language}.lsif`),
					format: 'lsif',
				};

			default:
				return null;
		}
	}

	private async runTool(tool: IndexerTool): Promise<RunResult> {
		const startTime = Date.now();
		console.log(`[lsif-runner] Running ${tool.command} for ${tool.language}...`);

		try {
			// Ensure output directory exists
			await fs.promises.mkdir(path.dirname(tool.outputFile), { recursive: true });

			const { stdout, stderr } = await execFileAsync(tool.command, tool.args, {
				timeout: 120_000, // 2 minute timeout
				maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large LSIF outputs
				cwd: this.config.project.path,
			});

			// If the tool writes to stdout (like lsif-tsc --stdout), save to file
			if (stdout && !await this.fileExists(tool.outputFile)) {
				await fs.promises.writeFile(tool.outputFile, stdout);
			}

			if (stderr) {
				console.warn(`[lsif-runner] ${tool.command} stderr:`, stderr.substring(0, 500));
			}

			const durationMs = Date.now() - startTime;
			console.log(`[lsif-runner] ${tool.command} completed in ${durationMs}ms`);

			// Save snapshot
			await this.saveSnapshot(tool);

			return {
				language: tool.language,
				format: tool.format,
				outputFile: tool.outputFile,
				success: true,
				durationMs,
			};
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const message = err instanceof Error ? err.message : String(err);

			// Check if the tool is not installed
			if (message.includes('ENOENT') || message.includes('not found')) {
				console.warn(`[lsif-runner] ${tool.command} not installed, skipping ${tool.language}`);
			} else {
				console.error(`[lsif-runner] ${tool.command} failed:`, message);
			}

			return {
				language: tool.language,
				format: tool.format,
				outputFile: tool.outputFile,
				success: false,
				durationMs,
				error: message,
			};
		}
	}

	private async saveSnapshot(tool: IndexerTool): Promise<void> {
		try {
			const snapshotDir = this.config.lsif.snapshotDir;
			await fs.promises.mkdir(snapshotDir, { recursive: true });

			const snapshotFile = path.join(
				snapshotDir,
				`${tool.language}.${tool.format}`
			);

			await fs.promises.copyFile(tool.outputFile, snapshotFile);
			console.log(`[lsif-runner] Snapshot saved: ${snapshotFile}`);
		} catch (err) {
			console.warn('[lsif-runner] Failed to save snapshot:', err);
		}
	}

	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath, fs.constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}
}
