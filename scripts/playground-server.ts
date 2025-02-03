/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fsPromise from 'fs/promises';
import path from 'path';
import * as http from 'http';
import * as parcelWatcher from '@parcel/watcher';

/**
 * Launches the server for the monaco editor playground
 */
function main() {
	const server = new HttpServer({ host: 'localhost', port: 5001, cors: true });
	server.use('/', redirectToMonacoEditorPlayground());

	const rootDir = path.join(__dirname, '..');
	const fileServer = new FileServer(rootDir);
	server.use(fileServer.handleRequest);

	const moduleIdMapper = new SimpleModuleIdPathMapper(path.join(rootDir, 'out'));
	const editorMainBundle = new CachedBundle('vs/editor/editor.main', moduleIdMapper);
	fileServer.overrideFileContent(editorMainBundle.entryModulePath, () => editorMainBundle.bundle());

	const loaderPath = path.join(rootDir, 'out/vs/loader.js');
	fileServer.overrideFileContent(loaderPath, async () =>
		Buffer.from(new TextEncoder().encode(makeLoaderJsHotReloadable(await fsPromise.readFile(loaderPath, 'utf8'), new URL('/file-changes', server.url))))
	);

	const watcher = DirWatcher.watchRecursively(moduleIdMapper.rootDir);
	watcher.onDidChange((path, newContent) => {
		editorMainBundle.setModuleContent(path, newContent);
		editorMainBundle.bundle();
		console.log(`${new Date().toLocaleTimeString()}, file change: ${path}`);
	});
	server.use('/file-changes', handleGetFileChangesRequest(watcher, fileServer, moduleIdMapper));

	console.log(`Server listening on ${server.url}`);
}
setTimeout(main, 0);

// #region Http/File Server

type RequestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
type ChainableRequestHandler = (req: http.IncomingMessage, res: http.ServerResponse, next: RequestHandler) => Promise<void>;

class HttpServer {
	private readonly server: http.Server;
	public readonly url: URL;

	private handler: ChainableRequestHandler[] = [];

	constructor(options: { host: string; port: number; cors: boolean }) {
		this.server = http.createServer(async (req, res) => {
			if (options.cors) {
				res.setHeader('Access-Control-Allow-Origin', '*');
			}

			let i = 0;
			const next = async (req: http.IncomingMessage, res: http.ServerResponse) => {
				if (i >= this.handler.length) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					res.end('404 Not Found');
					return;
				}
				const handler = this.handler[i];
				i++;
				await handler(req, res, next);
			};
			await next(req, res);
		});
		this.server.listen(options.port, options.host);
		this.url = new URL(`http://${options.host}:${options.port}`);
	}

	use(handler: ChainableRequestHandler);
	use(path: string, handler: ChainableRequestHandler);
	use(...args: [path: string, handler: ChainableRequestHandler] | [handler: ChainableRequestHandler]) {
		const handler = args.length === 1 ? args[0] : (req, res, next) => {
			const path = args[0];
			const requestedUrl = new URL(req.url, this.url);
			if (requestedUrl.pathname === path) {
				return args[1](req, res, next);
			} else {
				return next(req, res);
			}
		};

		this.handler.push(handler);
	}
}

function redirectToMonacoEditorPlayground(): ChainableRequestHandler {
	return async (req, res) => {
		const url = new URL('https://microsoft.github.io/monaco-editor/playground.html');
		url.searchParams.append('source', `http://${req.headers.host}/out/vs`);
		res.writeHead(302, { Location: url.toString() });
		res.end();
	};
}

class FileServer {
	private readonly overrides = new Map<string, () => Promise<Buffer>>();

	constructor(public readonly publicDir: string) { }

	public readonly handleRequest: ChainableRequestHandler = async (req, res, next) => {
		const requestedUrl = new URL(req.url!, `http://${req.headers.host}`);

		const pathName = requestedUrl.pathname;

		const filePath = path.join(this.publicDir, pathName);
		if (!filePath.startsWith(this.publicDir)) {
			res.writeHead(403, { 'Content-Type': 'text/plain' });
			res.end('403 Forbidden');
			return;
		}

		try {
			const override = this.overrides.get(filePath);
			let content: Buffer;
			if (override) {
				content = await override();
			} else {
				content = await fsPromise.readFile(filePath);
			}

			const contentType = getContentType(filePath);
			res.writeHead(200, { 'Content-Type': contentType });
			res.end(content);
		} catch (err) {
			if (err.code === 'ENOENT') {
				next(req, res);
			} else {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('500 Internal Server Error');
			}
		}
	};

	public filePathToUrlPath(filePath: string): string | undefined {
		const relative = path.relative(this.publicDir, filePath);
		const isSubPath = !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);

		if (!isSubPath) {
			return undefined;
		}
		const relativePath = relative.replace(/\\/g, '/');
		return `/${relativePath}`;
	}

	public overrideFileContent(filePath: string, content: () => Promise<Buffer>): void {
		this.overrides.set(filePath, content);
	}
}

function getContentType(filePath: string): string {
	const extname = path.extname(filePath);
	switch (extname) {
		case '.js':
			return 'text/javascript';
		case '.css':
			return 'text/css';
		case '.json':
			return 'application/json';
		case '.png':
			return 'image/png';
		case '.jpg':
			return 'image/jpg';
		case '.svg':
			return 'image/svg+xml';
		case '.html':
			return 'text/html';
		case '.wasm':
			return 'application/wasm';
		default:
			return 'text/plain';
	}
}

// #endregion

// #region File Watching

interface IDisposable {
	dispose(): void;
}

class DirWatcher {
	public static watchRecursively(dir: string): DirWatcher {
		const listeners: ((path: string, newContent: string) => void)[] = [];
		const fileContents = new Map<string, string>();
		const event = (handler: (path: string, newContent: string) => void) => {
			listeners.push(handler);
			return {
				dispose: () => {
					const idx = listeners.indexOf(handler);
					if (idx >= 0) {
						listeners.splice(idx, 1);
					}
				}
			};
		};
		parcelWatcher.subscribe(dir, async (err, events) => {
			for (const e of events) {
				if (e.type === 'update') {
					const newContent = await fsPromise.readFile(e.path, 'utf8');
					if (fileContents.get(e.path) !== newContent) {
						fileContents.set(e.path, newContent);
						listeners.forEach(l => l(e.path, newContent));
					}
				}
			}
		});
		return new DirWatcher(event);
	}

	constructor(public readonly onDidChange: (handler: (path: string, newContent: string) => void) => IDisposable) {
	}
}

function handleGetFileChangesRequest(watcher: DirWatcher, fileServer: FileServer, moduleIdMapper: SimpleModuleIdPathMapper): ChainableRequestHandler {
	return async (req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		const d = watcher.onDidChange((fsPath, newContent) => {
			const path = fileServer.filePathToUrlPath(fsPath);
			if (path) {
				res.write(JSON.stringify({ changedPath: path, moduleId: moduleIdMapper.getModuleId(fsPath), newContent }) + '\n');
			}
		});
		res.on('close', () => d.dispose());
	};
}
function makeLoaderJsHotReloadable(loaderJsCode: string, fileChangesUrl: URL): string {
	loaderJsCode = loaderJsCode.replace(
		/constructor\(env, scriptLoader, defineFunc, requireFunc, loaderAvailableTimestamp = 0\) {/,
		'$&globalThis.___globalModuleManager = this; globalThis.vscode = { process: { env: { VSCODE_DEV: true } } }'
	);

	const ___globalModuleManager: any = undefined;

	// This code will be appended to loader.js
	function $watchChanges(fileChangesUrl: string) {
		interface HotReloadConfig { }

		let reloadFn;
		if (globalThis.$sendMessageToParent) {
			reloadFn = () => globalThis.$sendMessageToParent({ kind: 'reload' });
		} else if (typeof window !== 'undefined') {
			reloadFn = () => window.location.reload();
		} else {
			reloadFn = () => { };
		}

		console.log('Connecting to server to watch for changes...');
		(fetch as any)(fileChangesUrl)
			.then(async request => {
				const reader = request.body.getReader();
				let buffer = '';
				while (true) {
					const { done, value } = await reader.read();
					if (done) { break; }
					buffer += new TextDecoder().decode(value);
					const lines = buffer.split('\n');
					buffer = lines.pop()!;

					const changes: { relativePath: string; config: HotReloadConfig | undefined; path: string; newContent: string }[] = [];

					for (const line of lines) {
						const data = JSON.parse(line);
						const relativePath = data.changedPath.replace(/\\/g, '/').split('/out/')[1];
						changes.push({ config: {}, path: data.changedPath, relativePath, newContent: data.newContent });
					}

					const result = handleChanges(changes, 'playground-server');
					if (result.reloadFailedJsFiles.length > 0) {
						reloadFn();
					}
				}
			}).catch(err => {
				console.error(err);
				setTimeout(() => $watchChanges(fileChangesUrl), 1000);
			});


		function handleChanges(changes: {
			relativePath: string;
			config: HotReloadConfig | undefined;
			path: string;
			newContent: string;
		}[], debugSessionName: string) {
			// This function is stringified and injected into the debuggee.

			const hotReloadData: { count: number; originalWindowTitle: any; timeout: any; shouldReload: boolean } = globalThis.$hotReloadData || (globalThis.$hotReloadData = { count: 0, messageHideTimeout: undefined, shouldReload: false });

			const reloadFailedJsFiles: { relativePath: string; path: string }[] = [];

			for (const change of changes) {
				handleChange(change.relativePath, change.path, change.newContent, change.config);
			}

			return { reloadFailedJsFiles };

			function handleChange(relativePath: string, path: string, newSrc: string, config: any) {
				if (relativePath.endsWith('.css')) {
					handleCssChange(relativePath);
				} else if (relativePath.endsWith('.js')) {
					handleJsChange(relativePath, path, newSrc, config);
				}
			}

			function handleCssChange(relativePath: string) {
				if (typeof document === 'undefined') {
					return;
				}

				const styleSheet = (([...document.querySelectorAll(`link[rel='stylesheet']`)] as HTMLLinkElement[]))
					.find(l => new URL(l.href, document.location.href).pathname.endsWith(relativePath));
				if (styleSheet) {
					setMessage(`reload ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					console.log(debugSessionName, 'css reloaded', relativePath);
					styleSheet.href = styleSheet.href.replace(/\?.*/, '') + '?' + Date.now();
				} else {
					setMessage(`could not reload ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					console.log(debugSessionName, 'ignoring css change, as stylesheet is not loaded', relativePath);
				}
			}


			function handleJsChange(relativePath: string, path: string, newSrc: string, config: any) {
				const moduleIdStr = trimEnd(relativePath, '.js');

				const requireFn: any = globalThis.require;
				const moduleManager = (requireFn as any).moduleManager;
				if (!moduleManager) {
					console.log(debugSessionName, 'ignoring js change, as moduleManager is not available', relativePath);
					return;
				}

				const moduleId = moduleManager._moduleIdProvider.getModuleId(moduleIdStr);
				const oldModule = moduleManager._modules2[moduleId];

				if (!oldModule) {
					console.log(debugSessionName, 'ignoring js change, as module is not loaded', relativePath);
					return;
				}

				// Check if we can reload
				const g = globalThis as any;

				// A frozen copy of the previous exports
				const oldExports = Object.freeze({ ...oldModule.exports });
				const reloadFn = g.$hotReload_applyNewExports?.({ oldExports, newSrc, config });

				if (!reloadFn) {
					console.log(debugSessionName, 'ignoring js change, as module does not support hot-reload', relativePath);
					hotReloadData.shouldReload = true;

					reloadFailedJsFiles.push({ relativePath, path });

					setMessage(`hot reload not supported for ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
					return;
				}

				// Eval maintains source maps
				function newScript(/* this parameter is used by newSrc */ define) {
					// eslint-disable-next-line no-eval
					eval(newSrc); // CodeQL [SM01632] This code is only executed during development. It is required for the hot-reload functionality.
				}

				newScript(/* define */ function (deps, callback) {
					// Evaluating the new code was successful.

					// Redefine the module
					delete moduleManager._modules2[moduleId];
					moduleManager.defineModule(moduleIdStr, deps, callback);
					const newModule = moduleManager._modules2[moduleId];


					// Patch the exports of the old module, so that modules using the old module get the new exports
					Object.assign(oldModule.exports, newModule.exports);
					// We override the exports so that future reloads still patch the initial exports.
					newModule.exports = oldModule.exports;

					const successful = reloadFn(newModule.exports);
					if (!successful) {
						hotReloadData.shouldReload = true;
						setMessage(`hot reload failed ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
						console.log(debugSessionName, 'hot reload was not successful', relativePath);
						return;
					}

					console.log(debugSessionName, 'hot reloaded', moduleIdStr);
					setMessage(`successfully reloaded ${formatPath(relativePath)} - ${new Date().toLocaleTimeString()}`);
				});
			}

			function setMessage(message: string) {
				const domElem = (document.querySelector('.titlebar-center .window-title')) as HTMLDivElement | undefined;
				if (!domElem) { return; }
				if (!hotReloadData.timeout) {
					hotReloadData.originalWindowTitle = domElem.innerText;
				} else {
					clearTimeout(hotReloadData.timeout);
				}
				if (hotReloadData.shouldReload) {
					message += ' (manual reload required)';
				}

				domElem.innerText = message;
				hotReloadData.timeout = setTimeout(() => {
					hotReloadData.timeout = undefined;
					// If wanted, we can restore the previous title message
					// domElem.replaceChildren(hotReloadData.originalWindowTitle);
				}, 5000);
			}

			function formatPath(path: string): string {
				const parts = path.split('/');
				parts.reverse();
				let result = parts[0];
				parts.shift();
				for (const p of parts) {
					if (result.length + p.length > 40) {
						break;
					}
					result = p + '/' + result;
					if (result.length > 20) {
						break;
					}
				}
				return result;
			}

			function trimEnd(str, suffix) {
				if (str.endsWith(suffix)) {
					return str.substring(0, str.length - suffix.length);
				}
				return str;
			}
		}
	}

	const additionalJsCode = `
(${(function () {
			globalThis.$hotReload_deprecateExports = new Set<(oldExports: any, newExports: any) => void>();
		}).toString()})();
${$watchChanges.toString()}
$watchChanges(${JSON.stringify(fileChangesUrl)});
`;

	return `${loaderJsCode}\n${additionalJsCode}`;
}

// #endregion

// #region Bundling

class CachedBundle {
	public readonly entryModulePath = this.mapper.resolveRequestToPath(this.moduleId)!;

	constructor(
		private readonly moduleId: string,
		private readonly mapper: SimpleModuleIdPathMapper,
	) {
	}

	private loader: ModuleLoader | undefined = undefined;

	private bundlePromise: Promise<Buffer> | undefined = undefined;
	public async bundle(): Promise<Buffer> {
		if (!this.bundlePromise) {
			this.bundlePromise = (async () => {
				if (!this.loader) {
					this.loader = new ModuleLoader(this.mapper);
					await this.loader.addModuleAndDependencies(this.entryModulePath);
				}
				const editorEntryPoint = await this.loader.getModule(this.entryModulePath);
				const content = bundleWithDependencies(editorEntryPoint!);
				return content;
			})();
		}
		return this.bundlePromise;
	}

	public async setModuleContent(path: string, newContent: string): Promise<void> {
		if (!this.loader) {
			return;
		}
		const module = await this.loader!.getModule(path);
		if (module) {
			if (!this.loader.updateContent(module, newContent)) {
				this.loader = undefined;
			}
		}
		this.bundlePromise = undefined;
	}
}

function bundleWithDependencies(module: IModule): Buffer {
	const visited = new Set<IModule>();
	const builder = new SourceMapBuilder();

	function visit(module: IModule) {
		if (visited.has(module)) {
			return;
		}
		visited.add(module);
		for (const dep of module.dependencies) {
			visit(dep);
		}
		builder.addSource(module.source);
	}

	visit(module);

	const sourceMap = builder.toSourceMap();
	sourceMap.sourceRoot = module.source.sourceMap.sourceRoot;
	const sourceMapBase64Str = Buffer.from(JSON.stringify(sourceMap)).toString('base64');

	builder.addLine(`//# sourceMappingURL=data:application/json;base64,${sourceMapBase64Str}`);

	return builder.toContent();
}

class ModuleLoader {
	private readonly modules = new Map<string, Promise<IModule | undefined>>();

	constructor(private readonly mapper: SimpleModuleIdPathMapper) { }

	public getModule(path: string): Promise<IModule | undefined> {
		return Promise.resolve(this.modules.get(path));
	}

	public updateContent(module: IModule, newContent: string): boolean {
		const parsedModule = parseModule(newContent, module.path, this.mapper);
		if (!parsedModule) {
			return false;
		}
		if (!arrayEquals(parsedModule.dependencyRequests, module.dependencyRequests)) {
			return false;
		}

		module.dependencyRequests = parsedModule.dependencyRequests;
		module.source = parsedModule.source;

		return true;
	}

	async addModuleAndDependencies(path: string): Promise<IModule | undefined> {
		if (this.modules.has(path)) {
			return this.modules.get(path)!;
		}

		const promise = (async () => {
			const content = await fsPromise.readFile(path, { encoding: 'utf-8' });

			const parsedModule = parseModule(content, path, this.mapper);
			if (!parsedModule) {
				return undefined;
			}

			const dependencies = (await Promise.all(parsedModule.dependencyRequests.map(async r => {
				if (r === 'require' || r === 'exports' || r === 'module') {
					return null;
				}

				const depPath = this.mapper.resolveRequestToPath(r, path);
				if (!depPath) {
					return null;
				}
				return await this.addModuleAndDependencies(depPath);
			}))).filter((d): d is IModule => !!d);

			const module: IModule = {
				id: this.mapper.getModuleId(path)!,
				dependencyRequests: parsedModule.dependencyRequests,
				dependencies,
				path,
				source: parsedModule.source,
			};
			return module;
		})();

		this.modules.set(path, promise);
		return promise;
	}
}

function arrayEquals<T>(a: T[], b: T[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
}

const encoder = new TextEncoder();

function parseModule(content: string, path: string, mapper: SimpleModuleIdPathMapper): { source: Source; dependencyRequests: string[] } | undefined {
	const m = content.match(/define\((\[.*?\])/);
	if (!m) {
		return undefined;
	}

	const dependencyRequests = JSON.parse(m[1].replace(/'/g, '"')) as string[];

	const sourceMapHeader = '//# sourceMappingURL=data:application/json;base64,';
	const idx = content.indexOf(sourceMapHeader);

	let sourceMap: any = null;
	if (idx !== -1) {
		const sourceMapJsonStr = Buffer.from(content.substring(idx + sourceMapHeader.length), 'base64').toString('utf-8');
		sourceMap = JSON.parse(sourceMapJsonStr);
		content = content.substring(0, idx);
	}

	content = content.replace('define([', `define("${mapper.getModuleId(path)}", [`);

	const contentBuffer = Buffer.from(encoder.encode(content));
	const source = new Source(contentBuffer, sourceMap);

	return { dependencyRequests, source };
}

class SimpleModuleIdPathMapper {
	constructor(public readonly rootDir: string) { }

	public getModuleId(path: string): string | null {
		if (!path.startsWith(this.rootDir) || !path.endsWith('.js')) {
			return null;
		}
		const moduleId = path.substring(this.rootDir.length + 1);


		return moduleId.replace(/\\/g, '/').substring(0, moduleId.length - 3);
	}

	public resolveRequestToPath(request: string, requestingModulePath?: string): string | null {
		if (request.indexOf('css!') !== -1) {
			return null;
		}

		if (request.startsWith('.')) {
			return path.join(path.dirname(requestingModulePath!), request + '.js');
		} else {
			return path.join(this.rootDir, request + '.js');
		}
	}
}

interface IModule {
	id: string;
	dependencyRequests: string[];
	dependencies: IModule[];
	path: string;
	source: Source;
}

// #endregion

// #region SourceMapBuilder

// From https://stackoverflow.com/questions/29905373/how-to-create-sourcemaps-for-concatenated-files with modifications

class Source {
	// Ends with \n
	public readonly content: Buffer;
	public readonly sourceMap: SourceMap;
	public readonly sourceLines: number;

	public readonly sourceMapMappings: Buffer;


	constructor(content: Buffer, sourceMap: SourceMap | undefined) {
		if (!sourceMap) {
			sourceMap = SourceMapBuilder.emptySourceMap;
		}

		let sourceLines = countNL(content);
		if (content.length > 0 && content[content.length - 1] !== 10) {
			sourceLines++;
			content = Buffer.concat([content, Buffer.from([10])]);
		}

		this.content = content;
		this.sourceMap = sourceMap;
		this.sourceLines = sourceLines;
		this.sourceMapMappings = typeof this.sourceMap.mappings === 'string'
			? Buffer.from(encoder.encode(sourceMap.mappings as string))
			: this.sourceMap.mappings;
	}
}

class SourceMapBuilder {
	public static emptySourceMap: SourceMap = { version: 3, sources: [], mappings: Buffer.alloc(0) };

	private readonly outputBuffer = new DynamicBuffer();
	private readonly sources: string[] = [];
	private readonly mappings = new DynamicBuffer();
	private lastSourceIndex = 0;
	private lastSourceLine = 0;
	private lastSourceCol = 0;

	addLine(text: string) {
		this.outputBuffer.addString(text);
		this.outputBuffer.addByte(10);
		this.mappings.addByte(59); // ;
	}

	addSource(source: Source) {
		const sourceMap = source.sourceMap;
		this.outputBuffer.addBuffer(source.content);

		const sourceRemap: number[] = [];
		for (const v of sourceMap.sources) {
			let pos = this.sources.indexOf(v);
			if (pos < 0) {
				pos = this.sources.length;
				this.sources.push(v);
			}
			sourceRemap.push(pos);
		}
		let lastOutputCol = 0;

		const inputMappings = source.sourceMapMappings;
		let outputLine = 0;
		let ip = 0;
		let inOutputCol = 0;
		let inSourceIndex = 0;
		let inSourceLine = 0;
		let inSourceCol = 0;
		let shift = 0;
		let value = 0;
		let valpos = 0;
		const commit = () => {
			if (valpos === 0) { return; }
			this.mappings.addVLQ(inOutputCol - lastOutputCol);
			lastOutputCol = inOutputCol;
			if (valpos === 1) {
				valpos = 0;
				return;
			}
			const outSourceIndex = sourceRemap[inSourceIndex];
			this.mappings.addVLQ(outSourceIndex - this.lastSourceIndex);
			this.lastSourceIndex = outSourceIndex;
			this.mappings.addVLQ(inSourceLine - this.lastSourceLine);
			this.lastSourceLine = inSourceLine;
			this.mappings.addVLQ(inSourceCol - this.lastSourceCol);
			this.lastSourceCol = inSourceCol;
			valpos = 0;
		};
		while (ip < inputMappings.length) {
			let b = inputMappings[ip++];
			if (b === 59) { // ;
				commit();
				this.mappings.addByte(59);
				inOutputCol = 0;
				lastOutputCol = 0;
				outputLine++;
			} else if (b === 44) { // ,
				commit();
				this.mappings.addByte(44);
			} else {
				b = charToInteger[b];
				if (b === 255) { throw new Error('Invalid sourceMap'); }
				value += (b & 31) << shift;
				if (b & 32) {
					shift += 5;
				} else {
					const shouldNegate = value & 1;
					value >>= 1;
					if (shouldNegate) { value = -value; }
					switch (valpos) {
						case 0: inOutputCol += value; break;
						case 1: inSourceIndex += value; break;
						case 2: inSourceLine += value; break;
						case 3: inSourceCol += value; break;
					}
					valpos++;
					value = shift = 0;
				}
			}
		}
		commit();
		while (outputLine < source.sourceLines) {
			this.mappings.addByte(59);
			outputLine++;
		}
	}

	toContent(): Buffer {
		return this.outputBuffer.toBuffer();
	}

	toSourceMap(sourceRoot?: string): SourceMap {
		return { version: 3, sourceRoot, sources: this.sources, mappings: this.mappings.toBuffer().toString() };
	}
}

export interface SourceMap {
	version: number; // always 3
	file?: string;
	sourceRoot?: string;
	sources: string[];
	sourcesContent?: string[];
	names?: string[];
	mappings: string | Buffer;
}

const charToInteger = Buffer.alloc(256);
const integerToChar = Buffer.alloc(64);

charToInteger.fill(255);

'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.split('').forEach((char, i) => {
	charToInteger[char.charCodeAt(0)] = i;
	integerToChar[i] = char.charCodeAt(0);
});

class DynamicBuffer {
	private buffer: Buffer;
	private size: number;

	constructor() {
		this.buffer = Buffer.alloc(512);
		this.size = 0;
	}

	ensureCapacity(capacity: number) {
		if (this.buffer.length >= capacity) {
			return;
		}
		const oldBuffer = this.buffer;
		this.buffer = Buffer.alloc(Math.max(oldBuffer.length * 2, capacity));
		oldBuffer.copy(this.buffer);
	}

	addByte(b: number) {
		this.ensureCapacity(this.size + 1);
		this.buffer[this.size++] = b;
	}

	addVLQ(num: number) {
		let clamped: number;

		if (num < 0) {
			num = (-num << 1) | 1;
		} else {
			num <<= 1;
		}

		do {
			clamped = num & 31;
			num >>= 5;

			if (num > 0) {
				clamped |= 32;
			}

			this.addByte(integerToChar[clamped]);
		} while (num > 0);
	}

	addString(s: string) {
		const l = Buffer.byteLength(s);
		this.ensureCapacity(this.size + l);
		this.buffer.write(s, this.size);
		this.size += l;
	}

	addBuffer(b: Buffer) {
		this.ensureCapacity(this.size + b.length);
		b.copy(this.buffer, this.size);
		this.size += b.length;
	}

	toBuffer(): Buffer {
		return this.buffer.slice(0, this.size);
	}
}

function countNL(b: Buffer): number {
	let res = 0;
	for (let i = 0; i < b.length; i++) {
		if (b[i] === 10) { res++; }
	}
	return res;
}

// #endregion
