import * as fs from 'fs';
import { parentPort, workerData } from 'worker_threads';

// Define simplified versions of the needed types
interface Position {
	line: number;
	character: number;
}

interface Range {
	start: Position;
	end: Position;
}

interface Match {
	filePath: string;
	ranges: Range[];
	preview: {
		text: string;
		matches: { start: Position; end: Position }[];
	};
}

// Main worker code
const { files, query, options } = workerData;
const matches: Match[] = [];

const flags = options.caseSensitive ? 'g' : 'gi';
const regex = options.regex
	? new RegExp(query, flags)
	: new RegExp(options.wholeWord ? `\\b${escapeRegExp(query)}\\b` : escapeRegExp(query), flags);

for (const file of files) {
	try {
		const content = fs.readFileSync(file, 'utf8');
		if (content.length > 10_000_000) {
			continue; // Skip large files
		}
		const fileMatches = findMatchesInFile(file, content, regex);
		matches.push(...fileMatches);
	} catch (err) {
		// Ignore file errors
	}
}

parentPort?.postMessage(matches);

function findMatchesInFile(filePath: string, content: string, regex: RegExp): Match[] {
	const matches: Match[] = [];
	const lines = content.split('\n');

	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const line = lines[lineNumber];
		let match;
		regex.lastIndex = 0;
		while ((match = regex.exec(line)) !== null) {
			if (match[0] === '') {
				break;
			}
			const startChar = match.index;
			const endChar = startChar + match[0].length;
			const range = {
				start: { line: lineNumber, character: startChar },
				end: { line: lineNumber, character: endChar }
			};

			matches.push({
				filePath: filePath,
				ranges: [range],
				preview: {
					text: line,
					matches: [{
						start: { line: lineNumber, character: startChar },
						end: { line: lineNumber, character: endChar }
					}]
				}
			});
		}
	}
	return matches;
}

function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
