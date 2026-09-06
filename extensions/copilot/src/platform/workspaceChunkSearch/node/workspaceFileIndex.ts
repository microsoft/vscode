/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nodeFs from 'fs';
import { isBinaryFile, isBinaryFileSync } from 'isbinaryfile';
import type vscode from 'vscode';
import { GlobIncludeOptions, shouldInclude } from '../../../util/common/glob';
import { getLanguageForResource } from '../../../util/common/languages';
import { createServiceIdentifier } from '../../../util/common/services';
import { Limiter, raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { Disposable, dispose, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { basename, extname, isEqual, isEqualOrParent } from '../../../util/vs/base/common/resources';
import { TernarySearchTree } from '../../../util/vs/base/common/ternarySearchTree';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { FileType, RelativePattern } from '../../filesystem/common/fileTypes';
import { IIgnoreService } from '../../ignore/common/ignoreService';
import { ISearchService } from '../../search/common/searchService';
import { ITabsAndEditorsService } from '../../tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { IWorkspaceService } from '../../workspace/common/workspaceService';

/**
 * The maximum size of a file to index (in bytes)
 */
const maxIndexableFileSize = 1.5 * 1024 * 1024; // 1.5 MB

/**
 * List of file extension we know for sure that we should not index.
 */
const EXCLUDE_EXTENSIONS = new Set([
	// Images
	'jpg', 'jpeg', 'jpe',
	'png',
	'gif',
	'bmp',
	'tif', 'tiff',
	'tga',
	'ico', 'icns', 'xpm',
	'webp',
	'svg', 'eps',
	'heif', 'heic',
	'raw', 'arw', 'cr2', 'cr3', 'nef', 'nrw', 'orf', 'raf', 'rw2', 'rwl', 'pef', 'srw', 'x3f', 'erf', 'kdc', '3fr', 'mef', 'mrw', 'iiq', 'gpr', 'dng', // raw formats

	// Video
	'mp4', 'm4v',
	'mkv',
	'webm',
	'mov',
	'avi',
	'wmv',
	'flv',

	// Audio
	'mp3',
	'wav',
	'm4a',
	'flac',
	'ogg',
	'wma',
	'weba',
	'aac',
	'pcm',

	// Compressed
	'7z',
	'bz2',
	'gz', 'gz_', 'tgz',
	'rar',
	'tar',
	'xz',
	'zip', 'vsix',
	'iso',
	'img',
	'pkg',

	// Fonts
	'woff', 'woff2',
	'otf',
	'ttf',
	'eot',

	// 3d formats
	'obj',
	'fbx',
	'stl',
	'3ds',
	'dae',
	'blend',
	'ply',
	'glb', 'gltf',
	'max',
	'c4d',
	'ma', 'mb',
	'pcd',

	// Documents
	'pdf', 'ai', 'ps', 'eps', 'indd', // PDF and related formats
	'doc', 'docx', // Word
	'xls', 'xlsx', // Excel
	'ppt', 'pptx', // PowerPoint
	'odt', 'ods', 'odp', // OpenDocument formats
	'rtf', // Rich Text Format
	'psd',
	'pbix', // PowerBI

	// Others
	'temp', 'tmp',
	'exe',
	'db', 'db-wal', 'db-shm', 'sqlite', // SQLite
	'parquet',
	'bin', 'dat', 'data', 'hex', 'cache', 'sum', 'hash',
	'wasm',
	'pdb', 'idb', 'sym',
	'coverage',
	'testlog',
	'git', 'pack', 'pack_', // git
	'lock',
	'log', 'trace', 'tlog',
	'snap',
	'msi',
	'deb',
	'vsidx', 'suo', // VS
	'xcuserstate', // XCode
	'download',
	'map', 'tsbuildinfo', 'jsbundle', // JS/TS
	'dll', 'dll.config', 'dylib', 'so', 'a', 'o', 'lib', 'out', 'elf', // C++
	'nupkg', 'winmd', // C#
	'pyc', 'pkl', 'pickle', 'pyd', // Python
	'rlib', 'rmeta', // Rust
	'dill', // Dart
	'jar', 'class', 'ear', 'war', // Java
	'apk', 'dex', // Android
	'phar', // PHP

	// Certificates and private keys (security sensitive)
	'pfx', 'p12', // PKCS#12 files
	'pem', 'crt', 'cer', // Certificate files
	'key', 'priv', // Private key files
	'jks', 'keystore', // Java keystore files
	'csr', // Certificate signing requests
]);

const EXCLUDED_FOLDERS = [
	'out',
	'dist',
	'.git',
	'.svn',
	'.hg',
	'.yarn',

	'foo.asar',
	'.vscode-test',

	// JS/TS build outputs
	'node_modules',
	'bower_components',
	'.next',
	'.npm',
	'.nuxt',
	'.turbo',
	'.parcel-cache',

	// Python
	'__pycache__',
	'venv',
	'.venv',

	'.mypy_cache',
	'.pytest_cache',
	'.ruff_cache',
	'.tox',

	// Other
	'Pods',
	'.gradle',
	'.terraform',
	'.nyc_output',
];

const EXCLUDED_FILES = [
	'.ds_store',
	'thumbs.db',
	'package-lock.json',
	'yarn.lock',
	'.cache',
];

/**
 * List of file schemes we should never index, even if they are open in the workspace.
 */
const EXCLUDED_SCHEMES = [
	Schemas.vscode,
	Schemas.vscodeUserData,
	'output',
	Schemas.inMemory,
	Schemas.internal,
	Schemas.vscodeChatCodeBlock,
	Schemas.vscodeChatCodeCompareBlock,
	Schemas.chatEditingModel,
	Schemas.chatEditingSnapshotScheme,
	'git',
	Schemas.vscodeSourceControl,
];

export function shouldAlwaysIgnoreFile(resource: URI): boolean {
	if (EXCLUDED_SCHEMES.includes(resource.scheme)) {
		return true;
	}

	// Ignore some common filenames
	if (EXCLUDED_FILES.includes(basename(resource).toLowerCase())) {
		return true;
	}

	// Ignore some common folders like node_modules
	const parts = resource.fsPath.toLowerCase().split(/[/\\]/g);
	if (parts.some(part => EXCLUDED_FOLDERS.includes(part))) {
		return true;
	}

	// Ignore some common extensions
	const normalizedExt = extname(resource).replace(/\./, '').toLowerCase();
	if (EXCLUDE_EXTENSIONS.has(normalizedExt)) {
		return true;
	}

	return false;
}

/**
 * Checks if a file in the workspace should potentially be indexed.
 *
 * Caller should also look at file content to make sure the file is not binary or copilot ignored.
 */
export function shouldPotentiallyIndexFile(accessor: ServicesAccessor, resource: URI): boolean {
	if (shouldAlwaysIgnoreFile(resource)) {
		return false;
	}

	// Only index if the file is in the same scheme as one of the workspace folders
	const workspaceService = accessor.get(IWorkspaceService);
	if (
		![Schemas.file, Schemas.untitled].includes(resource.scheme) && // Still always allow loose and untitled files
		!workspaceService.getWorkspaceFolders().some(folder => resource.scheme === folder.scheme)
	) {
		return false;
	}

	return true;
}

export abstract class FileRepresentation implements IDisposable {

	protected _isDisposed = false;
	protected readonly _disposedCts = new CancellationTokenSource();

	constructor(
		private readonly _uri: URI,
	) { }

	dispose(): void {
		this._isDisposed = true;
		this._disposedCts.cancel();
		this._disposedCts.dispose();
	}

	get uri(): URI {
		return this._uri;
	}

	abstract isDirty(): boolean;

	abstract getText(): Promise<string>;

	protected abstract getStats(): Promise<{ size: number; mtime: number }>;

	/**
	 * Get an id that quickly lets you check if a file has changed.
	 */
	async getFastContentVersionId(): Promise<string> {
		const stats = await this.getStats();
		return `${stats.size}-${stats.mtime}`;
	}
}

interface FileTruncationInfo {
	readonly originalByteLength: number;
}

interface FileTextContent {
	readonly text: string;
	readonly truncated?: FileTruncationInfo;
}

class FsFileRepresentation extends FileRepresentation {
	private readonly _fileReadLimiter: Limiter<{ data: Uint8Array; truncatedInfo?: FileTruncationInfo } | undefined>;

	constructor(
		uri: URI,
		limiter: Limiter<any>,
		@IFileSystemService private readonly _fileSystem: IFileSystemService,
	) {
		super(uri);

		this._fileReadLimiter = limiter;
	}

	override isDirty(): boolean {
		return false;
	}

	async getStats(): Promise<{ size: number; mtime: number }> {
		const stat = await this._fileSystem.stat(this.uri);
		return { size: stat.size, mtime: stat.mtime };
	}

	async getText(): Promise<string> {
		try {
			const fileReadResult = await this._readFile();
			if (!fileReadResult || this._isDisposed) {
				return '';
			}

			const decoder = new TextDecoder();
			const text = decoder.decode(fileReadResult.data);

			// Exclude minified css and js files
			const lang = getLanguageForResource(this.uri).languageId;
			if ((lang === 'javascript' || lang === 'javascriptreact' || lang === 'css') && isMinifiedText(text)) {
				return '';
			}

			return text;
		} catch {
			return '';
		}
	}

	private async _readFile(): Promise<{ data: Uint8Array; truncatedInfo?: FileTruncationInfo } | undefined> {
		try {
			return await this._fileReadLimiter.queue(() => readTextFile(this.uri, this._fileSystem, this._disposedCts.token));
		} catch (_err) {
			return undefined;
		}
	}
}

class TextDocumentFileRepresentation extends FileRepresentation {

	constructor(
		private readonly _textDocument: vscode.TextDocument,
		@IFileSystemService private readonly _fileSystem: IFileSystemService,
	) {
		super(_textDocument.uri);
	}

	private readonly _mtime = Date.now();

	override isDirty(): boolean {
		return this._textDocument.isDirty;
	}

	async getStats(): Promise<{ size: number; mtime: number }> {
		if (!this.isDirty) {
			try {
				const stat = await this._fileSystem.stat(this.uri);
				return { size: stat.size, mtime: stat.mtime };
			} catch (e) {
				// noop
			}
		}

		return {
			size: new TextEncoder().encode(this._textDocument.getText()).length,
			mtime: this._mtime
		};
	}

	private readonly _text = new Lazy((): string => {
		const truncate = (originalText: string, data: Uint8Array): FileTextContent => {
			if (data.length <= maxIndexableFileSize) {
				return { text: originalText };
			}

			const truncated = data.slice(0, maxIndexableFileSize);
			return {
				text: new TextDecoder().decode(truncated),
				truncated: { originalByteLength: data.byteLength }
			};
		};

		const doRead = (): FileTextContent => {
			const text = this._textDocument.getText();

			// Check size of the file
			// TODO: For /chunks, should all of these checks actually be in utf8?
			// TODO: should we truncate files instead of returning empty strings?

			// First do a fast check based on maximum size of the string in bytes.
			// utf-16 strings have at most 4 bytes per character (2 * 2)
			const upperEstimatedByteLength = text.length * 4;
			if (upperEstimatedByteLength < maxIndexableFileSize) {
				return { text };
			}

			// Do another fast check based on shortest possible size of the string in bytes.
			// utf-8 strings have at least 2 bytes per character
			const lowerEstimatedByteLength = text.length * 2;
			if (lowerEstimatedByteLength >= maxIndexableFileSize) {
				return truncate(text, new TextEncoder().encode(text));
			}

			// Finally fall back to a real (expensive) check
			const encoder = new TextEncoder();
			const encodedStr = encoder.encode(text);
			if (encodedStr.length >= maxIndexableFileSize) {
				return truncate(text, encodedStr);
			}

			return { text };
		};

		const content = doRead();
		return content.text;
	});

	async getText(): Promise<string> {
		return this._text.value;
	}
}


export const IWorkspaceFileIndex = createServiceIdentifier<IWorkspaceFileIndex>('workspaceFileIndex');

export interface IWorkspaceFileIndex extends IDisposable {
	readonly _serviceBrand: undefined;

	get fileCount(): number;

	readonly onDidCreateFiles: Event<readonly URI[]>;
	readonly onDidChangeFiles: Event<readonly URI[]>;
	readonly onDidDeleteFiles: Event<readonly URI[]>;

	/**
	 * Initializes the index by loading an initial set of files.
	 */
	initialize(): Promise<void>;

	/**
	 * Returns files currently in the index.
	 *
	 * The index has a maximum size so this may not be all indexable file in the workspace.
	 */
	values(globPatterns?: GlobIncludeOptions): Iterable<FileRepresentation>;

	/**
	 * Retrieves a file that is already in the index.
	 *
	 * If the index has not been initialized or has hit its limit, this will not try to load the file from disk.
	 */
	get(resource: URI): FileRepresentation | undefined;

	/**
	 * Tries to load a file into the index.
	 *
	 * Unlike {@link get}, this will try to load the file from disk if it is not already in the index.
	 */
	tryLoad(file: URI): Promise<FileRepresentation | undefined>;

	/**
	 * Tries to read a file.
	 */
	tryRead(file: URI): Promise<string | undefined>;

	/**
	 * Checks if a file in the workspace should be indexed.
	 *
	 * Caller should still look at file content to make sure the file is not binary.
	 */
	shouldIndexWorkspaceFile(resource: URI, token: CancellationToken): Promise<boolean>;
}

export class WorkspaceFileIndex extends Disposable implements IWorkspaceFileIndex {

	declare readonly _serviceBrand: undefined;

	private readonly _textDocumentFiles = new ResourceMap<TextDocumentFileRepresentation>();
	private readonly _fsFileTree = new SimpleFsTree<FsFileRepresentation>();

	private readonly _onDidCreateFile = this._register(new Emitter<readonly URI[]>());
	public readonly onDidCreateFiles = this._onDidCreateFile.event;

	private readonly _onDidChangeFiles = this._register(new Emitter<readonly URI[]>());
	public readonly onDidChangeFiles = this._onDidChangeFiles.event;

	private readonly _onDidDeleteFile = this._register(new Emitter<readonly URI[]>());
	public readonly onDidDeleteFiles = this._onDidDeleteFile.event;

	private _isDisposed = false;
	private readonly _disposeCts = this._register(new CancellationTokenSource());

	private readonly _fileReadLimiter: Limiter<any>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IFileSystemService private readonly _fileSystem: IFileSystemService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISearchService private readonly _searchService: ISearchService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super();

		this._fileReadLimiter = this._register(new Limiter(20));
	}

	override dispose(): void {
		this._isDisposed = true;
		this._disposeCts.cancel();

		super.dispose();

		dispose(this._fsFileTree.values());
		this._fsFileTree.clear();

		dispose(this._textDocumentFiles.values());
		this._textDocumentFiles.clear();
	}

	get fileCount(): number {
		let openedNonFsFileCount = 0;
		for (const entry of this._textDocumentFiles.values()) {
			if (!this._fsFileTree.get(entry.uri)) {
				openedNonFsFileCount++;
			}
		}

		return this._fsFileTree.fileCount + openedNonFsFileCount;
	}

	get(file: URI): FileRepresentation | undefined {
		return this._textDocumentFiles.get(file) || this._fsFileTree.get(file);
	}

	async tryLoad(uri: URI): Promise<FileRepresentation | undefined> {
		const existing = this.get(uri);
		if (existing) {
			return existing;
		}

		if (!await this.statIsFsFile(uri)) {
			return;
		}

		if (this._isDisposed) {
			return;
		}

		return this.createOrUpdateFsEntry(uri);
	}

	async tryRead(uri: URI): Promise<string | undefined> {
		const existing = this.get(uri);
		if (existing) {
			return existing.getText();
		}

		// Don't add to the index to avoid caching too much
		if (!await this.statIsFsFile(uri)) {
			return;
		}

		const file = this.createFsFileRepresentation(uri);
		return file.getText();
	}

	public *values(glob?: GlobIncludeOptions): Iterable<FileRepresentation> {
		for (const entry of this._textDocumentFiles.values()) {
			if (shouldInclude(entry.uri, glob)) {
				yield entry;
			}
		}

		for (const [uri, entry] of this._fsFileTree.entries()) {
			if (!this._textDocumentFiles.has(uri)) {
				if (shouldInclude(entry.uri, glob)) {
					yield entry;
				}
			}
		}
	}

	private registerListeners(): void {
		// Create text document watchers

		this._register(this._workspaceService.onDidOpenTextDocument(doc => this.addOrUpdateTextDocumentEntry(doc)));
		this._register(this._workspaceService.onDidChangeTextDocument(e => this.addOrUpdateTextDocumentEntry(e.document)));
		this._register(this._workspaceService.onDidCloseTextDocument(doc => this.deleteTextDocumentEntry(doc.uri)));

		this._register(this._tabsAndEditorsService.onDidChangeTabs(e => {
			for (const tab of e.opened) {
				if (tab.uri) {
					const doc = this._workspaceService.textDocuments.find(doc => isEqual(doc.uri, tab.uri));
					if (doc) {
						this.addOrUpdateTextDocumentEntry(doc);
					}
				}
			}

			for (const tab of e.closed) {
				if (tab.uri) {
					this.deleteTextDocumentEntry(tab.uri);
				}
			}
		}));

		// Create file system watchers
		const watcher = this._register(this._fileSystem.createFileSystemWatcher(`**/*`));

		this._register(
			watcher.onDidChange(async uri => {
				if (!await this.shouldIndexWorkspaceFile(uri, this._disposeCts.token)) {
					return;
				}

				if (!await this.statIsFsFile(uri)) {
					return;
				}

				const existing = this._fsFileTree.get(uri);
				this.createOrUpdateFsEntry(uri);
				if (existing) {
					this._onDidChangeFiles.fire([uri]);
				} else {
					this._onDidCreateFile.fire([uri]);
				}
			}));

		this._register(
			watcher.onDidCreate(async uri => {
				if (!await this.shouldIndexWorkspaceFile(uri, this._disposeCts.token)) {
					return;
				}

				if (!await this.statIsFsFile(uri)) {
					return;
				}

				if (this._fsFileTree.get(uri)) {
					return;
				}

				this.createOrUpdateFsEntry(uri);
				this._onDidCreateFile.fire([uri]);
			}));

		this._register(
			watcher.onDidDelete(deletedUri => {
				const entry = this._fsFileTree.get(deletedUri);
				if (entry) {
					entry.dispose();
					this._fsFileTree.delete(deletedUri);

					this._onDidDeleteFile.fire([deletedUri]);
				} else {
					// Not in our list but still could be a directory. In this case we need to delete all files under it
					const deletedFiles = this._fsFileTree.deleteFolder(deletedUri);
					if (deletedFiles.length) {
						this._onDidDeleteFile.fire(deletedFiles);
					}
				}
			}));
	}

	/**
	 * Checks that the file exists and is a file, not a directory.
	 */
	private async statIsFsFile(uri: URI): Promise<boolean> {
		try {
			const stat = await this._fileSystem.stat(uri);
			return !!(stat.type & FileType.File);
		} catch {
			return false;
		}
	}

	private _initialized?: Promise<void>;
	public initialize(): Promise<void> {
		this._initialized ??= (async () => {
			this.registerListeners();

			await this._workspaceService.ensureWorkspaceIsFullyLoaded();
			if (this._isDisposed) {
				return;
			}

			await Promise.all(this._workspaceService.textDocuments.map(doc => this.addOrUpdateTextDocumentEntry(doc, true)));
			if (this._isDisposed) {
				return;
			}

			for (const resource of await this.getWorkspaceFilesToIndex(this.getMaxFilesToIndex(), this._disposeCts.token)) {
				this.createOrUpdateFsEntry(resource);
			}

			/* __GDPR__
				"workspaceChunkIndex.initialize" : {
					"owner": "mjbvz",
					"comment": "Information about successful code searches",
					"totalFileCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Total number of files we can index" }
				}
			*/
			this._telemetryService.sendMSFTTelemetryEvent('workspaceChunkIndex.initialize', {}, {
				totalFileCount: this.fileCount
			});
		})();

		return this._initialized;
	}

	private getMaxFilesToIndex(): number {
		return this._configurationService.getExperimentBasedConfig<number>(ConfigKey.Advanced.WorkspaceMaxLocalIndexSize, this._expService);
	}

	private async getWorkspaceFilesToIndex(maxResults: number, token: CancellationToken): Promise<Iterable<URI>> {
		await raceCancellationError(this._ignoreService.init(), token);

		const resourcesToIndex = new ResourceMap<void>();
		const cts = new CancellationTokenSource(token);

		try {
			for (const folder of this._workspaceService.getWorkspaceFolders() ?? []) {
				const paths = await raceCancellationError(
					this._searchService.findFilesWithDefaultExcludes(new RelativePattern(folder, `**/*`), maxResults - resourcesToIndex.size, cts.token),
					cts.token);

				const tasks = paths.map(async uri => {
					if (await this.shouldIndexWorkspaceFile(uri, cts.token)) {
						if (resourcesToIndex.size < maxResults) {
							resourcesToIndex.set(uri);
						}

						if (resourcesToIndex.size >= maxResults) {
							cts.cancel();
						}
					}
				});
				await raceCancellationError(Promise.all(tasks), cts.token);
			}
		} catch (e) {
			if (isCancellationError(e)) {
				// If outer token was cancelled, rethrow
				if (token.isCancellationRequested) {
					throw e;
				}

				// Otherwise ignore

			} else {
				// Rethrow all non-cancellation errors
				throw e;
			}
		} finally {
			cts.dispose();
		}

		return resourcesToIndex.keys();
	}

	public async shouldIndexWorkspaceFile(resource: URI, token: CancellationToken): Promise<boolean> {
		if (!this._instantiationService.invokeFunction(accessor => shouldPotentiallyIndexFile(accessor, resource))) {
			return false;
		}

		// Only index files that are inside of the workspace
		if (!this._workspaceService.getWorkspaceFolders().some(folder => isEqualOrParent(resource, folder))) {
			return false;
		}

		return this._fileReadLimiter.queue(async () => {
			return !await this._ignoreService.isCopilotIgnored(resource, token);
		});
	}

	private createOrUpdateFsEntry(resource: URI): FsFileRepresentation {
		const entry = this._fsFileTree.get(resource);
		if (entry) {
			entry.dispose();
		}

		const newEntry = this.createFsFileRepresentation(resource);
		this._fsFileTree.addFile(resource, newEntry);
		return newEntry;
	}

	private createFsFileRepresentation(resource: URI) {
		return this._instantiationService.createInstance(FsFileRepresentation, resource, this._fileReadLimiter);
	}

	private async addOrUpdateTextDocumentEntry(doc: vscode.TextDocument, skipEmit = false): Promise<void> {
		if (!await this.shouldIndexWorkspaceFile(doc.uri, this._disposeCts.token)) {
			return;
		}

		// Check to make sure the document is open in the editor area
		if (!this._tabsAndEditorsService.tabs.some(tab => isEqual(doc.uri, tab.uri))) {
			return;
		}

		const existingTextDoc = this._textDocumentFiles.get(doc.uri);
		const existingFsFile = this._fsFileTree.get(doc.uri);
		existingTextDoc?.dispose();

		const newTextDoc = this._instantiationService.createInstance(TextDocumentFileRepresentation, doc);
		this._textDocumentFiles.set(doc.uri, newTextDoc);

		if (!skipEmit) {
			if (!existingTextDoc && !existingFsFile) {
				// File is new both from disk and as an open file
				this._onDidCreateFile.fire([doc.uri]);
			} else {
				// File existed before, either on disk or as an open file

				const existingContent = await (existingTextDoc ?? existingFsFile)?.getText().catch(() => undefined);
				if (existingContent !== await newTextDoc.getText()) {
					this._onDidChangeFiles.fire([doc.uri]);
				}
			}
		}
	}

	private async deleteTextDocumentEntry(deletedUri: URI) {
		const existingTextDoc = this._textDocumentFiles.get(deletedUri);
		if (!existingTextDoc) {
			return;
		}

		// Check to make sure the document is not still open in another tab
		if (this._tabsAndEditorsService.tabs.some(tab => isEqual(deletedUri, tab.uri))) {
			return;
		}

		const existingTextDocContent = await existingTextDoc.getText().catch(() => undefined);

		this._textDocumentFiles.delete(deletedUri);
		existingTextDoc.dispose();

		const existingFsFile = this._fsFileTree.get(deletedUri);
		if (existingFsFile) {
			// File still exists on disk

			// See if the text document content was different than the content on disk
			const existingFsFileContent = await existingFsFile.getText().catch(() => undefined);
			if (existingFsFileContent !== existingTextDocContent) {
				this._onDidChangeFiles.fire([deletedUri]);
			}
		} else {
			// File deleted on disk too
			this._onDidDeleteFile.fire([deletedUri]);
		}
	}
}


/**
 * Tracks files that exist on disk.
 */
class SimpleFsTree<T> {

	private readonly _tree = TernarySearchTree.forUris<T>();

	private _fileCount = 0;

	get fileCount(): number {
		return this._fileCount;
	}

	get(uri: URI): T | undefined {
		return this._tree.get(uri);
	}

	addFile(uri: URI, value: T) {
		if (!this._tree.get(uri)) {
			this._fileCount++;
		}

		this._tree.set(uri, value);
	}

	clear() {
		this._tree.clear();
	}

	delete(uri: URI): boolean {
		const existed = !!this.get(uri);
		this._tree.delete(uri);

		if (existed) {
			this._fileCount = Math.max(0, this._fileCount - 1);
		}

		return existed;
	}

	deleteFolder(folder: URI): URI[] {
		const toDelete: URI[] = [];
		for (const [fileUri] of this._tree.findSuperstr(folder) ?? []) {
			toDelete.push(fileUri);
		}

		for (const fileUri of toDelete) {
			this._tree.delete(fileUri);
		}

		this._fileCount = Math.max(0, this._fileCount - toDelete.length);

		return toDelete;
	}

	*values(): Iterable<T> {
		for (const [, value] of this.entries()) {
			yield value;
		}
	}

	entries(): Iterable<[URI, T]> {
		return this._tree;
	}
}

/**
 * Helper that reads the data for a text file.
 *
 * Automatically handles truncating the file if it is too large and detects if the file is binary.
 */
async function readTextFile(uri: URI, fileSystem: IFileSystemService, token: CancellationToken): Promise<{ data: Uint8Array; truncatedInfo: FileTruncationInfo | undefined } | undefined> {
	if (uri.scheme === Schemas.file) {
		// If the file is on disk, try to avoid reading too much of it into memory if the file is too big

		// Use nodefs to check that the file really exists on disk
		let stats: nodeFs.Stats | undefined;
		try {
			stats = await raceCancellationError(nodeFs.promises.stat(uri.fsPath), token);
		} catch (e) {
			// noop
		}

		if (stats) {
			const data = await raceCancellationError(readLocalTextFileUsingReadStream(uri.fsPath, maxIndexableFileSize), token);
			if (data === 'binary') {
				return undefined;
			}

			return {
				data: data,
				truncatedInfo: { originalByteLength: stats.size }
			};
		}
	}

	let binaryData = await raceCancellationError(fileSystem.readFile(uri), token);
	if (await isBinaryFile(Buffer.from(binaryData))) {
		return undefined;
	}

	let truncatedInfo: { originalByteLength: number } | undefined;
	if (binaryData.byteLength >= maxIndexableFileSize) {
		truncatedInfo = { originalByteLength: binaryData.byteLength };
		binaryData = binaryData.subarray(0, maxIndexableFileSize);
	}

	return { data: binaryData, truncatedInfo };
}

async function readLocalTextFileUsingReadStream(fsFilePath: string, byteLimit: number): Promise<Buffer | 'binary'> {
	const bytesRequiredForIsBinaryCheck = 1024;

	return new Promise((resolve, reject) => {
		const stream = nodeFs.createReadStream(fsFilePath, { start: 0, end: byteLimit - 1 });

		const chunks: Buffer[] = [];
		let totalBytesRead = 0;

		let hasCheckedForBinary = false;

		stream.on('data', chunk => {
			totalBytesRead += chunk.length;

			if (!hasCheckedForBinary && totalBytesRead >= bytesRequiredForIsBinaryCheck) {
				hasCheckedForBinary = true;

				const isBinary = isBinaryFileSync(Buffer.concat(chunks));
				if (isBinary) {
					stream.close();
					return resolve('binary');
				}
			}

			return chunks.push(chunk as Buffer);
		});
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('error', reject);
	});
}


export interface IsMinifiedTextOptions {
	/* Max length of any one line in the text */
	readonly minifiedMaxLineLength: number;

	/** Max average length of lines in the text */
	readonly minifiedMaxAverageLineLength: number;
}

export function isMinifiedText(str: string, options: IsMinifiedTextOptions = { minifiedMaxLineLength: 10_000, minifiedMaxAverageLineLength: 400 }): boolean {
	let foundNewLines = 0;
	let characterCount = 0;

	let accCurrentLineLength = 0;
	let startNewLineSearchIndex = 0;
	while (true) {
		const newLineIndex = str.indexOf('\n', startNewLineSearchIndex);
		if (newLineIndex === -1) {
			if ((str.length - startNewLineSearchIndex) > options.minifiedMaxLineLength) {
				return true;
			}

			characterCount += str.length - startNewLineSearchIndex;
			break;
		}

		const foundLineLength = accCurrentLineLength + (newLineIndex - startNewLineSearchIndex);
		if (foundLineLength > options.minifiedMaxLineLength) {
			return true;
		}

		foundNewLines++;
		characterCount += foundLineLength;
		accCurrentLineLength = 0;
		startNewLineSearchIndex = newLineIndex + 1;
	}

	return characterCount / (foundNewLines + 1) > options.minifiedMaxAverageLineLength;
}
