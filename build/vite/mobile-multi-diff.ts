/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-dangerous-type-assertions */

// Import the mobile diff view CSS
import '../../src/vs/sessions/browser/parts/mobile/contributions/media/mobileOverlayViews.css';
import '../../src/vs/sessions/browser/parts/mobile/contributions/media/mobileMultiDiffView.css';

import { URI } from '../../src/vs/base/common/uri.js';
import { MobileMultiDiffView, IMobileMultiDiffViewData } from '../../src/vs/sessions/browser/parts/mobile/contributions/mobileMultiDiffView.js';
import { IFileDiffViewData } from '../../src/vs/sessions/browser/parts/mobile/contributions/mobileDiffView.js';
import { ITextFileService } from '../../src/vs/workbench/services/textfile/common/textfiles.js';
import { ILanguageService } from '../../src/vs/editor/common/languages/language.js';
import { IFileService } from '../../src/vs/platform/files/common/files.js';
import { VSBuffer } from '../../src/vs/base/common/buffer.js';

// --- Sample file contents ---

const FILES: Record<string, string> = {
	'inmemory://original/src/greet.ts': `function greet(name: string): string {
	return 'Hello, ' + name;
}

function main() {
	console.log(greet('World'));
}`,

	'inmemory://modified/src/greet.ts': `function greet(name: string, greeting = 'Hello'): string {
	return \`\${greeting}, \${name}!\`;
}

function farewell(name: string): string {
	return \`Goodbye, \${name}!\`;
}

function main() {
	console.log(greet('World'));
	console.log(farewell('World'));
}`,

	'inmemory://original/src/config.ts': `export interface Config {
	host: string;
	port: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 3000,
};

export function validateConfig(config: Config): boolean {
	if (!config.host) {
		return false;
	}
	if (config.port < 0 || config.port > 65535) {
		return false;
	}
	return true;
}

export function mergeConfig(base: Config, overrides: Partial<Config>): Config {
	return { ...base, ...overrides };
}`,

	'inmemory://modified/src/config.ts': `export interface Config {
	host: string;
	port: number;
	secure: boolean;
	timeout: number;
}

export const defaultConfig: Config = {
	host: 'localhost',
	port: 8080,
	secure: true,
	timeout: 30000,
};

export function validateConfig(config: Config): boolean {
	if (!config.host) {
		throw new Error('Host is required');
	}
	if (config.port < 0 || config.port > 65535) {
		throw new Error(\`Invalid port: \${config.port}\`);
	}
	if (config.timeout < 0) {
		throw new Error('Timeout must be non-negative');
	}
	return true;
}

export function mergeConfig(base: Config, overrides: Partial<Config>): Config {
	const merged = { ...base, ...overrides };
	validateConfig(merged);
	return merged;
}`,

	'inmemory://original/src/server.ts': `import { Config } from './config';

export function createServer(config: Config) {
	return { config };
}`,

	'inmemory://modified/src/server.ts': `import { Config } from './config';

export function createServer(config: Config) {
	const { host, port, secure } = config;
	const protocol = secure ? 'https' : 'http';
	console.log(\`Starting server at \${protocol}://\${host}:\${port}\`);
	return { config, url: \`\${protocol}://\${host}:\${port}\` };
}`,

	'inmemory://original/src/middleware.ts': `import { Request, Response, NextFunction } from 'express';

export function logMiddleware(req: Request, res: Response, next: NextFunction) {
	console.log(\`\${req.method} \${req.url}\`);
	next();
}`,

	'inmemory://modified/src/middleware.ts': `import { Request, Response, NextFunction } from 'express';

export interface LogOptions {
	verbose: boolean;
	timestamp: boolean;
}

const defaultLogOptions: LogOptions = {
	verbose: false,
	timestamp: true,
};

export function logMiddleware(req: Request, res: Response, next: NextFunction, options: LogOptions = defaultLogOptions) {
	const timestamp = options.timestamp ? \`[\${new Date().toISOString()}] \` : '';
	const method = req.method;
	const url = req.url;

	if (options.verbose) {
		console.log(\`\${timestamp}\${method} \${url} - Headers: \${JSON.stringify(req.headers)}\`);
	} else {
		console.log(\`\${timestamp}\${method} \${url}\`);
	}

	const start = Date.now();
	res.on('finish', () => {
		const duration = Date.now() - start;
		console.log(\`\${timestamp}\${method} \${url} - \${res.statusCode} (\${duration}ms)\`);
	});

	next();
}

export function errorMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
	console.error(\`Error: \${err.message}\`);
	res.status(500).json({ error: err.message });
}`,

	'inmemory://original/src/utils.ts': `export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function retry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
	return fn().catch(err => {
		if (attempts <= 1) throw err;
		return retry(fn, attempts - 1);
	});
}`,

	'inmemory://modified/src/utils.ts': `export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export interface RetryOptions {
	attempts: number;
	delay: number;
	backoff: 'linear' | 'exponential';
}

const defaultRetryOptions: RetryOptions = {
	attempts: 3,
	delay: 1000,
	backoff: 'exponential',
};

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = defaultRetryOptions): Promise<T> {
	let lastError: Error | undefined;

	for (let i = 0; i < options.attempts; i++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));

			if (i < options.attempts - 1) {
				const delay = options.backoff === 'exponential'
					? options.delay * Math.pow(2, i)
					: options.delay * (i + 1);
				await sleep(delay);
			}
		}
	}

	throw lastError;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return ((...args: any[]) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}`,
};

// --- Mock services ---

const readLog: string[] = [];

function recordRead(uri: URI): void {
	readLog.push(uri.toString());
	document.documentElement.dataset.mobileMultiDiffReadCount = String(readLog.length);
}

const mockTextFileService = {
	read(uri: URI) {
		recordRead(uri);
		const content = FILES[uri.toString()] ?? '';
		return Promise.resolve({ value: content });
	}
} as unknown as ITextFileService;

const mockFileService = {
	readFile(uri: URI) {
		const content = FILES[uri.toString()] ?? '';
		return Promise.resolve({ value: VSBuffer.fromString(content) });
	}
} as unknown as IFileService;

const mockLanguageService = {
	guessLanguageIdByFilepathOrFirstLine(uri: URI): string {
		const path = uri.path;
		if (path.endsWith('.ts') || path.endsWith('.tsx')) { return 'typescript'; }
		if (path.endsWith('.js') || path.endsWith('.jsx')) { return 'javascript'; }
		if (path.endsWith('.py')) { return 'python'; }
		if (path.endsWith('.css')) { return 'css'; }
		if (path.endsWith('.html')) { return 'html'; }
		if (path.endsWith('.json')) { return 'json'; }
		return 'unknown';
	}
} as unknown as ILanguageService;

Object.assign(globalThis, {
	__mobileMultiDiffDebug: {
		readLog,
		get readCount() { return readLog.length; },
	}
});

// --- Build diff data ---

const diffs: IFileDiffViewData[] = [
	{
		originalURI: URI.parse('inmemory://original/src/greet.ts'),
		modifiedURI: URI.parse('inmemory://modified/src/greet.ts'),
		identical: false,
		added: 6,
		removed: 2,
	},
	{
		originalURI: URI.parse('inmemory://original/src/config.ts'),
		modifiedURI: URI.parse('inmemory://modified/src/config.ts'),
		identical: false,
		added: 12,
		removed: 5,
	},
	{
		originalURI: URI.parse('inmemory://original/src/server.ts'),
		modifiedURI: URI.parse('inmemory://modified/src/server.ts'),
		identical: false,
		added: 4,
		removed: 1,
	},
	{
		originalURI: URI.parse('inmemory://original/src/middleware.ts'),
		modifiedURI: URI.parse('inmemory://modified/src/middleware.ts'),
		identical: false,
		added: 30,
		removed: 2,
	},
	{
		originalURI: URI.parse('inmemory://original/src/utils.ts'),
		modifiedURI: URI.parse('inmemory://modified/src/utils.ts'),
		identical: false,
		added: 32,
		removed: 5,
	},
];

function createLargeScenario(fileCount: number, lineCount: number): IFileDiffViewData[] {
	const result: IFileDiffViewData[] = [];
	for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
		const originalURI = URI.parse(`inmemory://original/large/file${fileIndex}.ts`);
		const modifiedURI = URI.parse(`inmemory://modified/large/file${fileIndex}.ts`);
		FILES[originalURI.toString()] = createLargeFileText(fileIndex, lineCount, false);
		FILES[modifiedURI.toString()] = createLargeFileText(fileIndex, lineCount, true);
		result.push({
			originalURI,
			modifiedURI,
			identical: false,
			added: lineCount,
			removed: lineCount,
		});
	}
	return result;
}

function createLargeFileText(fileIndex: number, lineCount: number, modified: boolean): string {
	const lines: string[] = [];
	for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
		const value = modified ? lineIndex + 1000 : lineIndex;
		lines.push(`export const file${fileIndex}Value${lineIndex} = ${value};`);
	}
	return lines.join('\n');
}

// --- Render ---

function init() {
	const container = document.getElementById('container')!;
	const params = new URLSearchParams(location.search);
	const useLargeScenario = params.has('large');
	const fileCount = Math.max(1, Number(params.get('files') ?? 50));
	const lineCount = Math.max(1, Number(params.get('lines') ?? 500));
	const scenarioDiffs = useLargeScenario ? createLargeScenario(fileCount, lineCount) : diffs;

	const data: IMobileMultiDiffViewData = {
		diffs: scenarioDiffs,
		initialIndex: 0,
	};

	const view = new MobileMultiDiffView(container, data, mockTextFileService, mockFileService, mockLanguageService);

	// Clean up on page unload
	window.addEventListener('beforeunload', () => view.dispose());
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
