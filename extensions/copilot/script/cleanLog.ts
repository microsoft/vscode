/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

function showHelp(): void {
	console.log(`
cleanLog.ts - A utility script to filter log files by topic.

This script reads a log file, filters entries to only include those matching
a specified topic, strips timestamps from the output, and writes the filtered
content back to the file.

Usage:
  npx ts-node script/cleanLog.ts --log=<topic> <log-file-path>

Options:
  --log=<topic>   The topic to filter by (case-insensitive). Required.
  --help          Show this help message.

Example:
  npx ts-node script/cleanLog.ts --log=InlineChat /path/to/extension.log

This will filter the log file to only include entries containing [InlineChat]
and overwrite the original file with the filtered content.
`);
}

function parseArgs(args: string[]): { logTopic: string; filePath: string } | 'help' {
	if (args.includes('--help') || args.includes('-h')) {
		return 'help';
	}
	let logTopic: string | undefined;
	let filePath: string | undefined;

	for (const arg of args) {
		if (arg.startsWith('--log=')) {
			logTopic = arg.slice('--log='.length);
		} else if (!arg.startsWith('-')) {
			filePath = arg;
		}
	}

	if (!logTopic) {
		throw new Error('Missing required argument: --log=<topic>');
	}
	if (!filePath) {
		throw new Error('Missing required positional argument: <log-file-path>');
	}

	return { logTopic, filePath };
}

// Matches the start of a log line: timestamp [level] [TOPIC]...
const LOG_LINE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[/;
// Matches the timestamp prefix to strip it
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} /;

function stripTimestamp(line: string): string {
	return line.replace(TIMESTAMP_PATTERN, '');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filterLogByTopic(content: string, topic: string): string {
	const lines = content.split('\n');
	const result: string[] = [];
	const topicPattern = new RegExp(`\\[${escapeRegExp(topic)}\\]`, 'i');

	let currentLogEntry: string[] = [];
	let keepCurrentEntry = false;

	function flushEntry() {
		if (keepCurrentEntry && currentLogEntry.length > 0) {
			// Strip timestamp from the first line of the entry
			currentLogEntry[0] = stripTimestamp(currentLogEntry[0]);
			result.push(...currentLogEntry);
		}
		currentLogEntry = [];
		keepCurrentEntry = false;
	}

	for (const line of lines) {
		if (LOG_LINE_PATTERN.test(line)) {
			// New log entry starts - flush the previous one
			flushEntry();
			currentLogEntry.push(line);
			keepCurrentEntry = topicPattern.test(line);
		} else {
			// Continuation line (like "- `ERROR: ...`")
			currentLogEntry.push(line);
		}
	}

	// Flush the last entry
	flushEntry();

	return result.join('\n');
}

function main() {
	const args = process.argv.slice(2);
	const parsed = parseArgs(args);

	if (parsed === 'help') {
		showHelp();
		return;
	}

	const { logTopic, filePath } = parsed;

	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath);

	try {
		const content = fs.readFileSync(absolutePath, 'utf-8');
		const filtered = filterLogByTopic(content, logTopic);

		fs.writeFileSync(absolutePath, filtered, 'utf-8');
		console.log(`Filtered log file to only include [${logTopic}] entries: ${absolutePath}`);
	} catch (error) {
		const err = error as NodeJS.ErrnoException;
		if (err.code === 'ENOENT') {
			console.error(`Failed to read log file "${absolutePath}": file does not exist.`);
		} else if (err.code === 'EACCES' || err.code === 'EPERM') {
			console.error(`Permission denied while accessing log file "${absolutePath}".`);
		} else {
			console.error(`Failed to process log file "${absolutePath}": ${err.message ?? err}`);
		}
		process.exitCode = 1;
	}
}

main();
