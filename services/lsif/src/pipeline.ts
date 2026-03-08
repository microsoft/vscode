// Son of Anton — LSIF/SCIP Pipeline
// Orchestrates running LSIF/SCIP indexers and writing results to the graph.

import { LsifConfig } from './config';
import { FalkorDBClient } from './clients/falkordb';
import { LsifRunner, RunResult } from './runners/lsifRunner';
import { LsifParser, LsifParseResult } from './parsers/lsifParser';
import { LsifGraphWriter, WriteStats } from './writers/graphWriter';

export interface PipelineStats {
	lastRunTime: number | null;
	isRunning: boolean;
	languages: LanguageResult[];
	totalReferences: number;
	totalCalls: number;
	totalTypeRelations: number;
	totalErrors: number;
}

export interface LanguageResult {
	language: string;
	format: 'lsif' | 'scip';
	success: boolean;
	durationMs: number;
	error?: string;
}

export class LsifPipeline {
	private readonly config: LsifConfig;
	private readonly falkordb: FalkorDBClient;
	private readonly runner: LsifRunner;
	private readonly parser: LsifParser;
	private readonly writer: LsifGraphWriter;

	private stats: PipelineStats = {
		lastRunTime: null,
		isRunning: false,
		languages: [],
		totalReferences: 0,
		totalCalls: 0,
		totalTypeRelations: 0,
		totalErrors: 0,
	};

	constructor(config: LsifConfig) {
		this.config = config;
		this.falkordb = new FalkorDBClient(
			config.falkordb.host,
			config.falkordb.port,
			config.falkordb.graphName
		);
		this.runner = new LsifRunner(config);
		this.parser = new LsifParser();
		this.writer = new LsifGraphWriter(this.falkordb);
	}

	/**
	 * Initialize the pipeline (connect to FalkorDB).
	 */
	async initialize(): Promise<void> {
		await this.falkordb.connect();
		console.log('[pipeline] Initialized');
	}

	/**
	 * Run the full LSIF/SCIP pipeline for all configured languages.
	 */
	async runFull(): Promise<PipelineStats> {
		if (this.stats.isRunning) {
			console.warn('[pipeline] Pipeline is already running');
			return this.stats;
		}

		this.stats.isRunning = true;
		const startTime = Date.now();

		try {
			console.log('[pipeline] Starting full LSIF/SCIP pipeline...');

			// Step 1: Run all indexers
			const runResults = await this.runner.runAll();

			// Step 2: Parse and write results for each successful run
			this.stats.languages = [];
			let totalWriteStats: WriteStats = {
				referencesWritten: 0,
				callsWritten: 0,
				typeRelationsWritten: 0,
				errors: 0,
			};

			for (const runResult of runResults) {
				this.stats.languages.push({
					language: runResult.language,
					format: runResult.format,
					success: runResult.success,
					durationMs: runResult.durationMs,
					error: runResult.error,
				});

				if (runResult.success) {
					const writeStats = await this.processRunResult(runResult);
					totalWriteStats.referencesWritten += writeStats.referencesWritten;
					totalWriteStats.callsWritten += writeStats.callsWritten;
					totalWriteStats.typeRelationsWritten += writeStats.typeRelationsWritten;
					totalWriteStats.errors += writeStats.errors;
				}
			}

			this.stats.totalReferences = totalWriteStats.referencesWritten;
			this.stats.totalCalls = totalWriteStats.callsWritten;
			this.stats.totalTypeRelations = totalWriteStats.typeRelationsWritten;
			this.stats.totalErrors = totalWriteStats.errors;
			this.stats.lastRunTime = Date.now();

			const elapsed = Date.now() - startTime;
			console.log(`[pipeline] Full pipeline completed in ${elapsed}ms`);
		} finally {
			this.stats.isRunning = false;
		}

		return this.stats;
	}

	/**
	 * Run the pipeline for a single language.
	 */
	async runForLanguage(language: string): Promise<LanguageResult | null> {
		const runResult = await this.runner.runForLanguage(language);
		if (!runResult) {
			return null;
		}

		const langResult: LanguageResult = {
			language: runResult.language,
			format: runResult.format,
			success: runResult.success,
			durationMs: runResult.durationMs,
			error: runResult.error,
		};

		if (runResult.success) {
			await this.processRunResult(runResult);
		}

		return langResult;
	}

	/**
	 * Get current pipeline stats.
	 */
	getStats(): PipelineStats {
		return { ...this.stats };
	}

	/**
	 * Shut down the pipeline.
	 */
	async shutdown(): Promise<void> {
		await this.falkordb.disconnect();
		console.log('[pipeline] Shut down complete');
	}

	private async processRunResult(runResult: RunResult): Promise<WriteStats> {
		console.log(`[pipeline] Processing ${runResult.format} output for ${runResult.language}...`);

		let parseResult: LsifParseResult;
		if (runResult.format === 'scip') {
			parseResult = await this.parser.parseScip(runResult.outputFile);
		} else {
			parseResult = await this.parser.parseLsif(runResult.outputFile);
		}

		return this.writer.writeParseResult(parseResult);
	}
}
