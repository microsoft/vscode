import * as vscode from 'vscode';
import { IRecorder } from '../types';
import { Tracer } from './tracer';
import * as path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
const initSqlJs = require('sql.js');
import { SqlJsStatic, Database } from 'sql.js';
import { promises as fs } from 'fs';
import { ThoughtsTracker } from './thoughtsTracker';

/**
 * StateTracer class is responsible for recording state related events.
 * It listens for changes in state.vscdb and records the following events:
 * - searchHistoryChanged
 * - findHistoryChanged
 * - replaceHistoryChanged
 * It does this by reading the state.vscdb file and extracting the search and find history keys.
 * This is a VERY hacky way to do this, but currently there is no other way to access the search and find records.
 * This also means that this tracer is very fragile and will break if the state.vscdb file format changes or keys are renamed.
 *
 * Ideally once the following api is available, this tracer can be replaced: https://github.com/microsoft/vscode/issues/59921
 */
export class StateTracer extends Tracer {
	private watcher: FSWatcher;

	private findHistoryLength: number = 0;
	private searchHistoryLength: number = 0;
	private replaceHistoryLength: number = 0;

	// these are used to keep track of the last recorded history only when the previous length is the same as the current length
	// otherwise, the last entry is recorded every time the db changes
	private lastSearchHistory: string = '';
	private lastFindHistory: string = '';
	private lastReplaceHistory: string = '';

	private dbPath: string;
	private static SQLInstance?: SqlJsStatic;

	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker,
	) {
		super(context, traceRecorder, thoughtsTracker);
		if (!context.storageUri) {
			throw new Error('Storage URI not found');
		}
		this.dbPath = path.join(
			path.dirname(context.storageUri.fsPath),
			'state.vscdb',
		);
		this.watcher = chokidar.watch(this.dbPath, { persistent: true });
		this.watcher.on('change', () => {
			this.handleDbChange();
		});
	}

	initializeDisposables() {
		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration((event) =>
				this.onDidChangeConfiguration(event),
			),
		);
	}

	private onDidChangeConfiguration(
		event: vscode.ConfigurationChangeEvent,
	): void {
		if (
			event.affectsConfiguration('workbench.search.history') ||
			event.affectsConfiguration('workbench.find.history')
		) {
			this.handleDbChange();
		}
	}

	private async handleDbChange(): Promise<void> {
		// Load the db file as text because vscode REALLY doesn't like it when you use any of the sqlite3 libraries
		// The other solutions are building a local version of the sqlite3 library, using the command line sqlite3 tool,
		// or making this tracer a part of a third party application.
		// examples https://github.com/Angels-Ray/fake-rosrus
		// https://github.com/gait-ai/gait/
		// https://github.com/evald24/vscode-extensions-profiles
		// locally benchmarked at ~0.2ms for the entire function to complete

		// I'm using the sql.js library for now and will switch if it's necessary.

		// Start timing
		const startTime = performance.now();

		// Read the file asynchronously
		const fileBuffer = await fs.readFile(this.dbPath);

		// Initialize SQL.js once and cache the result
		if (!StateTracer.SQLInstance) {
			StateTracer.SQLInstance = await initSqlJs();
		}
		const SQL = StateTracer.SQLInstance;

		// Open the database using the in-memory file buffer
		const db: Database = new SQL!.Database(fileBuffer);
		// Execute the query to get the two types of history
		const results = db.exec(`
						SELECT value FROM ItemTable
						WHERE key IN ('workbench.search.history', 'workbench.find.history')
						ORDER BY CASE key WHEN 'workbench.search.history' THEN 0 ELSE 1 END;
				`);
		db.close();

		// End timing
		const endTime = performance.now();
		const duration = endTime - startTime;
		console.log(`Query execution time: ${duration} milliseconds`);

		// Ensure that the result contains the expected data
		const values = results?.[0]?.values || [];

		if (
			values.length > 0 &&
			values[0] &&
			JSON.parse(values[0].toString()).search !== undefined &&
			JSON.parse(values[0].toString()).replace !== undefined
		) {
			this.recordSearchWindowHistoryChanges(values[0].toString());
		} else if (
			values.length > 0 &&
			values[0] &&
			JSON.parse(values[0].toString()).length > 0
		) {
			this.recordFindHistoryChanges(values[0].toString());
		}
		if (values.length > 1 && values[1]) {
			this.recordFindHistoryChanges(values[1].toString());
		}
	}

	private recordFindHistoryChanges(findHistory: string): void {
		const findHistoryObj = JSON.parse(findHistory) as string[];
		if (
			findHistoryObj.length === this.findHistoryLength &&
			findHistoryObj[this.findHistoryLength - 1] !== this.lastFindHistory
		) {
			const recentFinds = findHistoryObj[findHistoryObj.length - 1];
			this.traceRecorder.record({
				action_id: 'findHistoryChanged',
				event: [recentFinds],
			});
			this.lastFindHistory = recentFinds;
		} else if (findHistoryObj.length > this.findHistoryLength) {
			const recentFinds = findHistoryObj.slice(this.findHistoryLength);
			this.traceRecorder.record({
				action_id: 'stateFindHistoryChanged',
				event: recentFinds,
			});
			this.findHistoryLength = findHistoryObj.length;
		} else if (findHistoryObj.length < this.findHistoryLength) {
			// Assume that the user has cleared the find history and all finds are new
			this.traceRecorder.record({
				action_id: 'stateFindHistoryChanged',
				event: findHistoryObj,
			});
			this.findHistoryLength = findHistoryObj.length;
		}
	}

	private recordSearchWindowHistoryChanges(
		searchWindowHistory: string,
	): void {
		const searchWindowHistoryObj = JSON.parse(searchWindowHistory) as {
			search: string[];
			replace?: string[];
		};
		// Search history
		const searchHistory = searchWindowHistoryObj.search as string[];
		// if the length is the same, then the last search is the only new one
		// basically vscode seems to pop the last search from the array and push in the new search
		// I've only seen this happen at the threshold of 100 searches, but none of this is documented
		// or standardized so it's hard to say for sure.
		if (
			searchHistory.length === this.searchHistoryLength &&
			searchHistory[searchHistory.length - 1] !== this.lastSearchHistory
		) {
			const recentSearchs = searchHistory[searchHistory.length - 1];
			this.traceRecorder.record({
				action_id: 'stateSearchHistoryChanged',
				event: { pattern: [recentSearchs] },
			});
			this.lastSearchHistory = recentSearchs;
			// If the length is greater than the previous length, then the new searches are the recent ones
		} else if (searchHistory.length > this.searchHistoryLength) {
			const recentSearchs = searchHistory.slice(this.searchHistoryLength);
			this.traceRecorder.record({
				action_id: 'stateSearchHistoryChanged',
				event: recentSearchs,
			});
			this.searchHistoryLength = searchHistory.length;

			// If the length is less than the previous length, then the user has cleared the search history
		} else if (searchHistory.length < this.searchHistoryLength) {
			// Assume that the user has cleared the search history and all searches are new
			this.traceRecorder.record({
				action_id: 'stateSearchHistoryChanged',
				event: searchHistory,
			});
			this.searchHistoryLength = searchHistory.length;
		}

		// Replace history
		const replaceHistory = searchWindowHistoryObj?.replace as string[];
		if (
			replaceHistory?.length === this.replaceHistoryLength &&
			replaceHistory[replaceHistory.length - 1] !==
			this.lastReplaceHistory
		) {
			const recentReplaces = replaceHistory[replaceHistory.length - 1];
			this.traceRecorder.record({
				action_id: 'stateReplaceHistoryChanged',
				event: [recentReplaces],
			});
			this.lastReplaceHistory = recentReplaces;
			// If the length is greater than the previous length, then the new replaces are the recent ones
		} else if (replaceHistory?.length > this.replaceHistoryLength) {
			const recentReplaces = replaceHistory.slice(
				this.replaceHistoryLength,
			);
			this.traceRecorder.record({
				action_id: 'stateReplaceHistoryChanged',
				event: recentReplaces,
			});
			this.replaceHistoryLength = replaceHistory.length;
			// If the length is less than the previous length, then the user has cleared the search history
		} else if (replaceHistory?.length < this.replaceHistoryLength) {
			// Assume that the user has cleared the search history and all searches are new
			this.traceRecorder.record({
				action_id: 'stateReplaceHistoryChanged',
				event: replaceHistory,
			});
			this.replaceHistoryLength = replaceHistory.length;
		}
	}

	dispose(): void {
		delete StateTracer.SQLInstance;
		this.watcher.close();
		this.disposeDisposables();
		this.traceRecorder.dispose();
	}
}
