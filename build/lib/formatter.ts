/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import cp from 'child_process';
import fs from 'fs';
import module from 'module';
import path from 'path';
import type { Readable, Writable } from 'stream';
import url from 'url';

const root = path.join(import.meta.dirname, '..', '..');

/**
 * The formatting settings: these defaults, overridden by the root tsfmt.json.
 */
const defaults = {
	baseIndentSize: 0,
	indentSize: 4,
	tabSize: 4,
	indentStyle: 'smart',
	newLineCharacter: '\n',
	convertTabsToSpaces: false,
	insertSpaceAfterCommaDelimiter: true,
	insertSpaceAfterSemicolonInForStatements: true,
	insertSpaceBeforeAndAfterBinaryOperators: true,
	insertSpaceAfterConstructor: false,
	insertSpaceAfterKeywordsInControlFlowStatements: true,
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
	insertSpaceAfterTypeAssertion: false,
	insertSpaceBeforeFunctionParenthesis: false,
	placeOpenBraceOnNewLineForFunctions: false,
	placeOpenBraceOnNewLineForControlBlocks: false,
	insertSpaceBeforeTypeAnnotation: false,
};

/** More concurrent requests don't format faster. */
const maxConcurrentRequests = 8;

interface Position {
	readonly line: number;
	readonly character: number;
}

interface TextEdit {
	readonly range: { readonly start: Position; readonly end: Position };
	readonly newText: string;
}

interface ResponseMessage {
	readonly id: number;
	readonly result?: unknown;
	readonly error?: { readonly message: string };
}

interface RequestMessage {
	readonly id: number;
	readonly method: string;
	readonly params?: { readonly items?: readonly { readonly section?: string }[] };
}

type GetExePath = (modules: { fs: typeof fs; module: typeof module; path: typeof path; url: typeof url }) => string;

async function getTsgoPath(): Promise<string> {
	// @typescript/native's own bin uses getExePath to find the native executable, which is in a platform package.
	const getExePathUrl = new URL('lib/getExePath.js', import.meta.resolve('@typescript/native/package.json'));
	const getExePath: GetExePath = (await import(getExePathUrl.href)).default;
	return getExePath({ fs, module, path, url });
}

function getLanguageId(fileName: string): string {
	switch (path.extname(fileName)) {
		case '.tsx': return 'typescriptreact';
		case '.js': case '.cjs': case '.mjs': return 'javascript';
		case '.jsx': return 'javascriptreact';
		default: return 'typescript';
	}
}

/**
 * Applies LSP text edits, which are ordered by position and don't overlap, to a text.
 */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
	const lineStarts = [0];
	for (const match of text.matchAll(/\r\n|\r|\n/g)) {
		lineStarts.push(match.index + match[0].length);
	}
	const offsetAt = ({ line, character }: Position) => {
		if (line >= lineStarts.length) {
			return text.length;
		}
		const lineEnd = line + 1 < lineStarts.length ? lineStarts[line + 1] : text.length;
		return Math.min(lineStarts[line] + character, lineEnd);
	};
	const sorted = edits
		.map((edit, index) => ({ start: offsetAt(edit.range.start), end: offsetAt(edit.range.end), newText: edit.newText, index }))
		.sort((a, b) => a.start - b.start || a.index - b.index);
	let result = '';
	let offset = 0;
	for (const edit of sorted) {
		result += text.slice(offset, edit.start) + edit.newText;
		offset = edit.end;
	}
	return result + text.slice(offset);
}

/**
 * Formats TypeScript with the formatter of the native TypeScript language server (tsgo), like the Format Document
 * command does in this workspace.
 */
export class Formatter {

	/**
	 * Starts the language server. Dispose the formatter to stop it.
	 */
	static async start(): Promise<Formatter> {
		const settings = { ...defaults, ...JSON.parse(fs.readFileSync(path.join(root, 'tsfmt.json'), 'utf8')) };
		const child = cp.spawn(await getTsgoPath(), ['--lsp', '--stdio'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
		const formatter = new Formatter(child, settings);
		try {
			await formatter.initialize();
		} catch (error) {
			child.kill();
			throw error;
		}
		return formatter;
	}

	/** The server caches the files that it reads from disk, so it would miss later changes to them. */
	private readonly filesReadFromDisk = new Set<string>();
	private readonly pendingRequests = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
	private readonly waitingForRequestSlot: (() => void)[] = [];
	private readonly exited: Promise<void>;
	private exitError: Error | undefined;
	private disposing = false;
	private stderr = '';
	private lastRequestId = 0;
	private lastUntitledId = 0;
	private activeRequests = 0;
	private received: Buffer = Buffer.alloc(0);
	private onDidSendConfiguration: (() => void) | undefined;

	private readonly child: cp.ChildProcessByStdio<Writable, Readable, Readable>;
	private readonly settings: Record<string, unknown>;

	private constructor(child: cp.ChildProcessByStdio<Writable, Readable, Readable>, settings: Record<string, unknown>) {
		this.child = child;
		this.settings = settings;
		child.stdout.on('data', (data: Buffer) => this.onData(data));
		// Writing to a server that exited fails, which the exit handler below reports.
		child.stdin.on('error', () => { });
		// The server logs to stderr, including when it shuts down normally, so the log is only shown when it fails.
		child.stderr.on('data', (data: Buffer) => this.stderr = (this.stderr + data.toString('utf8')).slice(-10_000));
		this.exited = new Promise(resolve => {
			const onExit = (error: Error) => {
				this.exitError ??= error;
				for (const request of this.pendingRequests.values()) {
					request.reject(this.exitError);
				}
				this.pendingRequests.clear();
				resolve();
			};
			child.on('error', error => onExit(new Error(`Could not start the TypeScript language server: ${error.message}`)));
			child.on('exit', code => onExit(new Error(`The TypeScript language server exited with code ${code}.${!this.disposing && this.stderr ? `\n${this.stderr}` : ''}`)));
		});
	}

	private async initialize(): Promise<void> {
		const configured = new Promise<void>(resolve => this.onDidSendConfiguration = resolve);
		await this.request('initialize', { processId: process.pid, rootUri: null, workspaceFolders: null, capabilities: { workspace: { configuration: true } } });
		this.notify('initialized', {});
		// The server applies the formatting settings when it gets them, which it asks for after initialization.
		let timeout: NodeJS.Timeout | undefined;
		await Promise.race([
			configured,
			this.exited.then(() => { throw this.exitError; }),
			new Promise((_, reject) => timeout = setTimeout(() => reject(new Error('The TypeScript language server did not request its configuration.')), 60_000)),
		]).finally(() => clearTimeout(timeout));
	}

	/**
	 * Formats `text`, the contents of the file `fileName`.
	 */
	async format(fileName: string, text: string): Promise<string> {
		return this.withRequestSlot(async () => {
			const options = { tabSize: this.settings.tabSize, insertSpaces: this.settings.convertTabsToSpaces };
			let edits: unknown;
			if (!this.filesReadFromDisk.has(fileName) && await fs.promises.readFile(fileName, 'utf8').catch(() => undefined) === text) {
				// The server reads files that aren't open from disk, which is much faster than opening them.
				this.filesReadFromDisk.add(fileName);
				edits = await this.request('textDocument/formatting', { textDocument: { uri: url.pathToFileURL(fileName).href }, options });
			} else {
				const uri = `untitled:/formatter/${++this.lastUntitledId}${path.extname(fileName)}`;
				this.notify('textDocument/didOpen', { textDocument: { uri, languageId: getLanguageId(fileName), version: 1, text } });
				try {
					edits = await this.request('textDocument/formatting', { textDocument: { uri }, options });
				} finally {
					this.notify('textDocument/didClose', { textDocument: { uri } });
				}
			}
			return applyEdits(text, Array.isArray(edits) ? edits : []);
		});
	}

	/**
	 * Returns whether `text`, the contents of the file `fileName`, is formatted.
	 */
	async verifyFormatting(fileName: string, text: string): Promise<boolean> {
		const formatted = await this.format(fileName, text);
		return text.replace(/\r\n/gm, '\n') === formatted.replace(/\r\n/gm, '\n');
	}

	async dispose(): Promise<void> {
		this.disposing = true;
		// Stops a server that doesn't respond. When it exits, its pending requests, including shutdown, fail.
		const timeout = setTimeout(() => this.child.kill('SIGKILL'), 5_000);
		try {
			if (!this.exitError) {
				await this.request('shutdown').catch(() => undefined);
				this.notify('exit');
			}
			await this.exited;
		} finally {
			clearTimeout(timeout);
		}
	}

	private async withRequestSlot<T>(fn: () => Promise<T>): Promise<T> {
		while (this.activeRequests >= maxConcurrentRequests) {
			await new Promise<void>(resolve => this.waitingForRequestSlot.push(resolve));
		}
		this.activeRequests++;
		try {
			return await fn();
		} finally {
			this.activeRequests--;
			this.waitingForRequestSlot.shift()?.();
		}
	}

	private request(method: string, params?: unknown): Promise<unknown> {
		if (this.exitError) {
			return Promise.reject(this.exitError);
		}
		const id = ++this.lastRequestId;
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			this.send({ id, method, params });
		});
	}

	private notify(method: string, params?: unknown): void {
		if (!this.exitError) {
			this.send({ method, params });
		}
	}

	private send(message: object): void {
		const content = JSON.stringify({ jsonrpc: '2.0', ...message });
		this.child.stdin.write(`Content-Length: ${Buffer.byteLength(content)}\r\n\r\n${content}`);
	}

	private onData(data: Buffer): void {
		this.received = this.received.length ? Buffer.concat([this.received, data]) : data;
		for (; ;) {
			const headerEnd = this.received.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				return;
			}
			const contentLength = Number(/Content-Length: (?<length>\d+)/i.exec(this.received.subarray(0, headerEnd).toString('latin1'))?.groups?.length);
			const contentStart = headerEnd + 4;
			if (this.received.length < contentStart + contentLength) {
				return;
			}
			const message = JSON.parse(this.received.subarray(contentStart, contentStart + contentLength).toString('utf8'));
			this.received = this.received.subarray(contentStart + contentLength);
			if (typeof message.method === 'string' && message.id !== undefined) {
				this.onRequest(message);
			} else if (message.id !== undefined) {
				this.onResponse(message);
			}
		}
	}

	private onRequest(request: RequestMessage): void {
		if (request.method === 'workspace/configuration') {
			const editor = { tabSize: this.settings.tabSize, insertSpaces: this.settings.convertTabsToSpaces };
			this.send({ id: request.id, result: (request.params?.items ?? []).map(item => item.section === 'editor' ? editor : { format: this.settings }) });
			this.onDidSendConfiguration?.();
		} else {
			this.send({ id: request.id, result: null });
		}
	}

	private onResponse(response: ResponseMessage): void {
		const request = this.pendingRequests.get(response.id);
		if (!request) {
			return;
		}
		this.pendingRequests.delete(response.id);
		if (response.error) {
			request.reject(new Error(response.error.message));
		} else {
			request.resolve(response.result);
		}
	}
}

async function main(args: readonly string[]): Promise<void> {
	const verify = args.includes('--verify');
	const replace = args.includes('--replace');
	const files = args.filter(arg => !arg.startsWith('--')).map(file => path.resolve(file));

	const formatter = await Formatter.start();
	try {
		let errorCount = 0;
		await Promise.all(files.map(async file => {
			const relativePath = path.relative(process.cwd(), file);
			const text = fs.readFileSync(file, 'utf8');
			if (replace) {
				const formatted = await formatter.format(file, text);
				if (text !== formatted) {
					fs.writeFileSync(file, formatted, 'utf8');
					console.log(`Formatted ${relativePath}`);
				}
			}
			if (verify && !await formatter.verifyFormatting(file, fs.readFileSync(file, 'utf8'))) {
				console.error(`File not formatted. Run the 'Format Document' command to fix it: ${relativePath}`);
				errorCount++;
			}
		}));
		if (errorCount > 0) {
			process.exitCode = 1;
		}
	} finally {
		await formatter.dispose();
	}
}

if (import.meta.main) {
	main(process.argv.slice(2)).catch(error => {
		console.error(error);
		process.exit(1);
	});
}
