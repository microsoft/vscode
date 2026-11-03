/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import crypto from 'crypto';
import { statSync } from 'fs';
import path from 'path';

import type tt from 'typescript';
import TS from '../../common/typescript';
const ts = TS();

import { ComputeContextSession, type Logger } from '../../common/contextProvider';
import type { Host } from '../../common/host';
import { LanguageServiceProxy } from './languageServerProxy';

const isWindows = process.platform === 'win32';
function _normalizePath(value: string): string {
	if (isWindows) {
		value = value.replace(/\\/g, '/');
		if (/^[a-z]:/.test(value)) {
			value = value.charAt(0).toUpperCase() + value.substring(1);
		}
	}
	const result = path.posix.normalize(value);
	return result.length > 0 && result.charAt(result.length - 1) === '/' ? result.substr(0, result.length - 1) : result;
}

function makeAbsolute(p: string, root?: string): string {
	if (path.isAbsolute(p)) {
		return _normalizePath(p);
	}
	if (root === undefined) {
		return _normalizePath(path.join(process.cwd(), p));
	} else {
		return _normalizePath(path.join(root, p));
	}
}

interface InternalCompilerOptions extends tt.CompilerOptions {
	configFilePath?: string;
}

namespace ParseCommandLine {
	export function create(fileOrDirectory: string): tt.ParsedCommandLine {
		const stat = statSync(fileOrDirectory);
		let configFilePath: string;
		if (stat.isFile()) {
			configFilePath = fileOrDirectory;
		} else if (stat.isDirectory()) {
			configFilePath = path.join(fileOrDirectory, 'tsconfig.json');
		} else {
			throw new Error('The provided path is neither a file nor a directory.');
		}
		return loadConfigFile(configFilePath);
	}

	function getDefaultCompilerOptions(configFileName?: string) {
		const options: tt.CompilerOptions = configFileName && path.basename(configFileName) === 'jsconfig.json'
			? { allowJs: true, maxNodeModuleJsDepth: 2, allowSyntheticDefaultImports: true, skipLibCheck: true, noEmit: true }
			: {};
		return options;
	}

	function loadConfigFile(filePath: string): tt.ParsedCommandLine {
		const readResult = ts.readConfigFile(filePath, ts.sys.readFile);
		if (readResult.error) {
			throw new Error(ts.formatDiagnostics([readResult.error], ts.createCompilerHost({})));
		}
		const config = readResult.config;
		if (config.compilerOptions !== undefined) {
			config.compilerOptions = Object.assign(config.compilerOptions, getDefaultCompilerOptions(filePath));
		}
		const result = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(filePath));
		if (result.errors.length > 0) {
			throw new Error(ts.formatDiagnostics(result.errors, ts.createCompilerHost({})));
		}
		return result;
	}
}

namespace CompileOptions {
	export function getConfigFilePath(options: tt.CompilerOptions): string | undefined {
		if (options.project) {
			const projectPath = path.resolve(options.project);
			if (ts.sys.directoryExists(projectPath)) {
				return _normalizePath(path.join(projectPath, 'tsconfig.json'));
			} else {
				return _normalizePath(projectPath);
			}
		}
		const result = (options as InternalCompilerOptions).configFilePath;
		return result && makeAbsolute(result);
	}
}

interface InternalLanguageServiceHost extends tt.LanguageServiceHost {
	useSourceOfProjectReferenceRedirect?(): boolean;
}

namespace LanguageServiceHost {
	export function useSourceOfProjectReferenceRedirect(host: tt.LanguageServiceHost, value: () => boolean): void {
		(host as InternalLanguageServiceHost).useSourceOfProjectReferenceRedirect = value;
	}
}

class LocalLanguageServiceHost implements tt.LanguageServiceHost {

	private readonly scriptSnapshots: Map<string, tt.IScriptSnapshot>;
	private languageServiceProxy: LanguageServiceProxy | undefined;

	constructor(private readonly config: tt.ParsedCommandLine, private readonly configFilePath: string | undefined, private readonly overrides?: Map<string, string>) {
		this.scriptSnapshots = new Map<string, tt.IScriptSnapshot>();
	}

	public setLanguageServiceProxy(languageService: LanguageServiceProxy): void {
		this.languageServiceProxy = languageService;
	}

	public getProgram(): tt.Program | undefined {
		return this.languageServiceProxy?.getProgram();
	}

	public getScriptFileNames() {
		return this.config.fileNames;
	}
	public getCompilationSettings() {
		return this.config.options;
	}
	public getProjectReferences() {
		return this.config.projectReferences;
	}
	public getScriptVersion(_fileName: string): string {
		// The files are immutable.
		return '0';
	}
	// The project is immutable
	public getProjectVersion(): string {
		return '0';
	}
	public getScriptSnapshot(fileName: string): tt.IScriptSnapshot | undefined {
		let result: tt.IScriptSnapshot | undefined = this.scriptSnapshots.get(fileName);
		if (result === undefined) {
			const content: string | undefined = this.overrides?.get(fileName) ?? (ts.sys.fileExists(fileName) ? ts.sys.readFile(fileName) : undefined);
			if (content === undefined) {
				return undefined;
			}
			result = ts.ScriptSnapshot.fromString(content);
			this.scriptSnapshots.set(fileName, result);
		}
		return result;
	}
	public getCurrentDirectory(): string {
		if (this.configFilePath !== undefined) {
			return path.dirname(this.configFilePath);
		} else {
			return process.cwd();
		}
	}
	public getDefaultLibFileName(options: tt.CompilerOptions): string {
		// We need to return the path since the language service needs
		// to know the full path and not only the name which is return
		// from ts.getDefaultLibFileName
		return ts.getDefaultLibFilePath(options);
	}

	public directoryExists = ts.sys.directoryExists;
	public getDirectories = ts.sys.getDirectories;
	public fileExists = ts.sys.fileExists;
	public readFile = ts.sys.readFile;
	public readDirectory = ts.sys.readDirectory;
	// this is necessary to make source references work.
	public realpath = ts.sys.realpath;

	public runWithTemporaryFileUpdate(rootFile: string, updatedText: string, cb: (updatedProgram: tt.Program, originalProgram: tt.Program | undefined, updatedFile: tt.SourceFile) => void): void {
		if (this.languageServiceProxy === undefined) {
			throw new Error('Language service proxy not set.');
		}

		// In the test setup we can't update a script snapshot since everything is immutable. Since the
		// test project are usually small, we simple recreate the language service with the updated content.
		const overrides = this.overrides ?? new Map<string, string>();
		overrides.set(rootFile, updatedText);

		const originalLanguageService = this.languageServiceProxy.getLanguageService();
		try {
			const host: LocalLanguageServiceHost = new LocalLanguageServiceHost(this.config, this.configFilePath, overrides);
			LanguageServiceHost.useSourceOfProjectReferenceRedirect(host, () => {
				return !this.config.options.disableSourceOfProjectReferenceRedirect;
			});

			const languageService: tt.LanguageService = ts.createLanguageService(host);
			const program = languageService.getProgram();
			if (program === undefined) {
				throw new Error('Couldn\'t create language service with underlying program.');
			}
			this.languageServiceProxy.setLanguageService(languageService);
			host.setLanguageServiceProxy(this.languageServiceProxy);
			const updatedFile = program.getSourceFile(rootFile);
			if (updatedFile === undefined) {
				throw new Error('Couldn\'t find updated file in program.');
			}
			cb(program, originalLanguageService.getProgram(), updatedFile);
		} finally {
			this.languageServiceProxy.setLanguageService(originalLanguageService!);
		}
	}
}

export namespace LanguageServices {

	export function createLanguageService(fileOrDirectory: string): [tt.LanguageService, tt.LanguageServiceHost] {
		const config = ParseCommandLine.create(fileOrDirectory);
		return LanguageServices._createLanguageService(config);
	}

	export function _createLanguageService(config: tt.ParsedCommandLine): [tt.LanguageService, tt.LanguageServiceHost] {
		const configFilePath = CompileOptions.getConfigFilePath(config.options);
		const host: LocalLanguageServiceHost = new LocalLanguageServiceHost(config, configFilePath);

		LanguageServiceHost.useSourceOfProjectReferenceRedirect(host, () => {
			return !config.options.disableSourceOfProjectReferenceRedirect;
		});

		const languageService: LanguageServiceProxy = new LanguageServiceProxy(ts.createLanguageService(host));

		const program = languageService.getProgram();
		if (program === undefined) {
			throw new Error('Couldn\'t create language service with underlying program.');
		}
		host.setLanguageServiceProxy(languageService);
		return [languageService, host];
	}
}

class ConsoleLogger implements Logger {

	info(s: string): void {
		console.info(s);
	}

	msg(s: string, type?: tt.server.Msg): void {
		type = type ?? ts.server.Msg.Info;
		switch (type) {
			case ts.server.Msg.Err:
				console.error(s);
				break;
			case ts.server.Msg.Info:
				console.info(s);
				break;
			case ts.server.Msg.Perf:
				console.log(s);
				break;
			default:
				console.error(s);
		}

	}

	startGroup(): void {
		console.group();
	}

	endGroup(): void {
		console.groupEnd();
	}
}

export class LanguageServicesSession extends ComputeContextSession {

	private readonly languageServices: Map<string, tt.LanguageService>;

	public readonly logger: Logger;

	constructor(root: tt.LanguageService | string, languageServiceHost: tt.LanguageServiceHost, host: Host) {
		super(languageServiceHost, host, true);
		this.logger = new ConsoleLogger();
		this.languageServices = new Map();
		let languageService: tt.LanguageService;
		let key: string | undefined;
		if (typeof root === 'string') {
			languageService = LanguageServices.createLanguageService(root)[0];
			key = makeAbsolute(root);
		} else {
			languageService = root;
			key = CompileOptions.getConfigFilePath(languageService.getProgram()!.getCompilerOptions());
		}
		if (key === undefined) {
			throw new Error('Failed to create key');
		}
		this.languageServices.set(key, languageService);
		this.createDeep(languageService);
	}

	public override logError(error: Error, cmd: string): void {
		console.error(`Error in ${cmd}: ${error.message}`, error);
	}

	public override getScriptVersion(_sourceFile: tt.SourceFile): string | undefined {
		return '1';
	}

	public *getLanguageServices(sourceFile?: tt.SourceFile): IterableIterator<tt.LanguageService> {
		if (sourceFile === undefined) {
			yield* this.languageServices.values();
		} else {
			const file = ts.server.toNormalizedPath(sourceFile.fileName);
			for (const languageService of this.languageServices.values()) {
				const scriptInfo = languageService.getProgram()?.getSourceFile(file);
				if (scriptInfo === undefined) {
					continue;
				}
				yield languageService;
			}
		}
	}

	public entries() {
		return this.languageServices.values();
	}

	private createDeep(languageService: tt.LanguageService): void {
		const program = languageService.getProgram();
		if (program === undefined) {
			throw new Error(`Failed to create program`);
		}
		const references = program.getResolvedProjectReferences();
		if (references !== undefined) {
			for (const reference of references) {
				if (reference === undefined) {
					continue;
				}
				const configFilePath = CompileOptions.getConfigFilePath(reference.commandLine.options);
				const key = configFilePath ?? LanguageServicesSession.makeKey(reference.commandLine);
				if (this.languageServices.has(key)) {
					continue;
				}
				const [languageService] = LanguageServices._createLanguageService(reference.commandLine);
				this.languageServices.set(key, languageService);
				this.createDeep(languageService);
			}
		}
	}

	private static makeKey(config: tt.ParsedCommandLine): string {
		const hash = crypto.createHash('md5'); // CodeQL [SM04514] The 'md5' algorithm is used to compute a shorter string to represent command line arguments in a map. It has no security implications.
		hash.update(JSON.stringify(config.options, undefined, 0));
		return hash.digest('base64');
	}
}