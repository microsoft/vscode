/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * This module provides integration with the Typst WASM compiler.
 *
 * Uses @myriaddreamin/typst-ts-web-compiler for compilation
 * and @myriaddreamin/typst.ts as the high-level API.
 *
 * File references (#image, #include, #bibliography) are handled by loading
 * referenced files using map_shadow/add_source before compilation.
 *
 * @see https://github.com/Myriad-Dreamin/typst.ts
 * @see https://www.npmjs.com/package/@myriaddreamin/typst-ts-web-compiler
 */

// Use 'any' for the typst instance since the exact types are complex

let typstInstance: any = null;
let initPromise: Promise<void> | null = null;

// Renderer instance for bidirectional sync (SVG with debug info)
// Note: typstRenderer and currentRenderSession removed - using text-based sync
// Note: storedReadWasmFile removed - not needed for text-based sync

// Memory access model for file system access
let memoryAccessModel: any = null;

// ============================================================================
// Package Management for Web Workers (Offline-First)
// ============================================================================
// The FetchPackageRegistry uses synchronous XHR which doesn't work in web workers.
// We implement async package prefetching with persistent caching:
// 1. Packages are downloaded asynchronously before compilation
// 2. Downloaded packages are persisted to IndexedDB for offline access
// 3. The PackageRegistry serves from cache synchronously during compilation

interface PackageSpec {
	namespace: string;
	name: string;
	version: string;
}

// In-memory cache for package data (tar.gz bytes) - fast access during session
const packageCache = new Map<string, Uint8Array>();

// Cache for extracted package directories
const extractedPackages = new Map<string, string>();

// IndexedDB database name and store
const PACKAGE_DB_NAME = 'typst-packages';
const PACKAGE_STORE_NAME = 'packages';
const PACKAGE_DB_VERSION = 1;

// IndexedDB instance (lazily initialized) - using 'any' for browser API compatibility
let packageDb: any = null;

/**
 * Get the global indexedDB object if available
 * Uses indirect eval to access global scope without TypeScript type issues
 */
function getIndexedDB(): any {
	try {
		// Use Function constructor to get the global object in any environment
		const globalObj = Function('return this')();
		if (globalObj && globalObj.indexedDB) {
			return globalObj.indexedDB;
		}
	} catch {
		// Fallback: try accessing directly
	}
	return null;
}

/**
 * Initialize IndexedDB for persistent package storage
 */
async function initPackageDb(): Promise<any> {
	if (packageDb) {
		return packageDb;
	}

	const idb = getIndexedDB();
	if (!idb) {
		console.warn('[Typst Packages] IndexedDB not available - packages will not persist');
		return null;
	}

	return new Promise((resolve) => {
		try {
			const request = idb.open(PACKAGE_DB_NAME, PACKAGE_DB_VERSION);

			request.onerror = () => {
				console.warn('[Typst Packages] Failed to open IndexedDB:', request.error);
				resolve(null);
			};

			request.onsuccess = () => {
				packageDb = request.result;
				console.log('[Typst Packages] IndexedDB initialized for offline package storage');
				resolve(packageDb);
			};

			request.onupgradeneeded = (event: any) => {
				const db = event.target.result;
				if (!db.objectStoreNames.contains(PACKAGE_STORE_NAME)) {
					const store = db.createObjectStore(PACKAGE_STORE_NAME, { keyPath: 'key' });
					store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
					console.log('[Typst Packages] Created package store in IndexedDB');
				}
			};
		} catch (error) {
			console.warn('[Typst Packages] IndexedDB initialization error:', error);
			resolve(null);
		}
	});
}

/**
 * Save a package to IndexedDB for persistent offline access
 */
async function savePackageToDb(key: string, data: Uint8Array): Promise<void> {
	const db = await initPackageDb();
	if (!db) {
		return;
	}

	return new Promise((resolve) => {
		try {
			const transaction = db.transaction([PACKAGE_STORE_NAME], 'readwrite');
			const store = transaction.objectStore(PACKAGE_STORE_NAME);

			const record = {
				key,
				data: Array.from(data), // Convert to array for storage
				fetchedAt: Date.now(),
				size: data.length
			};

			const request = store.put(record);

			request.onsuccess = () => {
				console.log(`[Typst Packages] Saved to IndexedDB: ${key}`);
				resolve();
			};

			request.onerror = () => {
				console.warn(`[Typst Packages] Failed to save to IndexedDB: ${key}`, request.error);
				resolve();
			};
		} catch (error) {
			console.warn(`[Typst Packages] Error saving to IndexedDB:`, error);
			resolve();
		}
	});
}

/**
 * Load a package from IndexedDB
 */
async function loadPackageFromDb(key: string): Promise<Uint8Array | undefined> {
	const db = await initPackageDb();
	if (!db) {
		return undefined;
	}

	return new Promise((resolve) => {
		try {
			const transaction = db.transaction([PACKAGE_STORE_NAME], 'readonly');
			const store = transaction.objectStore(PACKAGE_STORE_NAME);
			const request = store.get(key);

			request.onsuccess = () => {
				if (request.result) {
					const data = new Uint8Array(request.result.data);
					console.log(`[Typst Packages] Loaded from IndexedDB: ${key} (${data.length} bytes)`);
					resolve(data);
				} else {
					resolve(undefined);
				}
			};

			request.onerror = () => {
				console.warn(`[Typst Packages] Failed to load from IndexedDB: ${key}`, request.error);
				resolve(undefined);
			};
		} catch (error) {
			console.warn(`[Typst Packages] Error loading from IndexedDB:`, error);
			resolve(undefined);
		}
	});
}

/**
 * Get all cached packages info (for UI/debugging)
 */
export async function getCachedPackagesInfo(): Promise<Array<{ key: string; size: number; fetchedAt: number }>> {
	const db = await initPackageDb();
	if (!db) {
		return [];
	}

	return new Promise((resolve) => {
		try {
			const transaction = db.transaction([PACKAGE_STORE_NAME], 'readonly');
			const store = transaction.objectStore(PACKAGE_STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const packages = request.result.map((record: any) => ({
					key: record.key,
					size: record.size,
					fetchedAt: record.fetchedAt
				}));
				resolve(packages);
			};

			request.onerror = () => {
				resolve([]);
			};
		} catch {
			resolve([]);
		}
	});
}

/**
 * Clear all cached packages (for maintenance)
 */
export async function clearPackageCache(): Promise<void> {
	// Clear in-memory cache
	packageCache.clear();
	extractedPackages.clear();

	// Clear IndexedDB
	const db = await initPackageDb();
	if (!db) {
		return;
	}

	return new Promise((resolve) => {
		try {
			const transaction = db.transaction([PACKAGE_STORE_NAME], 'readwrite');
			const store = transaction.objectStore(PACKAGE_STORE_NAME);
			const request = store.clear();

			request.onsuccess = () => {
				console.log('[Typst Packages] Package cache cleared');
				resolve();
			};

			request.onerror = () => {
				resolve();
			};
		} catch {
			resolve();
		}
	});
}

/**
 * Parse a package import string like "@preview/package-name:0.1.0"
 */
function parsePackageSpec(importStr: string): PackageSpec | undefined {
	// Match @namespace/name:version
	const match = importStr.match(/@(\w+)\/([^:]+):(.+)/);
	if (match) {
		return {
			namespace: match[1],
			name: match[2],
			version: match[3]
		};
	}
	return undefined;
}

/**
 * Extract package imports from Typst source code
 */
function extractPackageImports(source: string): PackageSpec[] {
	const packages: PackageSpec[] = [];
	// Match #import "@namespace/name:version"
	const importPattern = /#import\s+["'](@\w+\/[^"':]+:[^"']+)["']/g;
	let match;
	while ((match = importPattern.exec(source)) !== null) {
		const spec = parsePackageSpec(match[1]);
		if (spec) {
			packages.push(spec);
		}
	}
	return packages;
}

/**
 * Get the URL for downloading a package from Typst Universe
 */
function getPackageUrl(spec: PackageSpec): string {
	return `https://packages.typst.org/${spec.namespace}/${spec.name}-${spec.version}.tar.gz`;
}

/**
 * Get a unique cache key for a package
 */
function getPackageCacheKey(spec: PackageSpec): string {
	return `@${spec.namespace}/${spec.name}:${spec.version}`;
}

/**
 * Pre-fetch a single package asynchronously with offline-first caching
 */
async function fetchPackage(spec: PackageSpec): Promise<Uint8Array | undefined> {
	const cacheKey = getPackageCacheKey(spec);

	// 1. Check in-memory cache first (fastest)
	if (packageCache.has(cacheKey)) {
		console.log(`[Typst Packages] Memory cache hit: ${cacheKey}`);
		return packageCache.get(cacheKey);
	}

	// 2. Check IndexedDB persistent cache (offline-first)
	const persistedData = await loadPackageFromDb(cacheKey);
	if (persistedData) {
		// Load into memory cache for faster subsequent access
		packageCache.set(cacheKey, persistedData);
		console.log(`[Typst Packages] Loaded from offline cache: ${cacheKey}`);
		return persistedData;
	}

	// 3. Fetch from network (online fallback)
	const url = getPackageUrl(spec);
	console.log(`[Typst Packages] Downloading: ${cacheKey} from ${url}`);

	try {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(`[Typst Packages] Download failed: ${cacheKey} - ${response.status} ${response.statusText}`);
			return undefined;
		}

		const data = new Uint8Array(await response.arrayBuffer());

		// Save to both caches
		packageCache.set(cacheKey, data);
		await savePackageToDb(cacheKey, data);

		console.log(`[Typst Packages] Downloaded and cached: ${cacheKey} (${data.length} bytes)`);
		return data;
	} catch (error) {
		console.error(`[Typst Packages] Network error for ${cacheKey}:`, error);
		console.error(`[Typst Packages] Package ${cacheKey} is not available offline and network is unavailable`);
		return undefined;
	}
}

/**
 * Decompress gzip data using DecompressionStream (available in modern browsers/workers)
 */
async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
	// Check if DecompressionStream is available
	if (typeof DecompressionStream === 'undefined') {
		console.warn('[Typst Packages] DecompressionStream not available, cannot decompress');
		throw new Error('DecompressionStream not available');
	}

	const stream = new DecompressionStream('gzip');
	const writer = stream.writable.getWriter();
	writer.write(data);
	writer.close();

	const reader = stream.readable.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) { break; }
		chunks.push(value);
	}

	// Combine all chunks
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

/**
 * Extract package imports from a tar.gz package data
 * This analyzes .typ files inside the package to find transitive dependencies
 */
async function extractPackageImportsFromTarGz(data: Uint8Array): Promise<PackageSpec[]> {
	const packages: PackageSpec[] = [];
	const seen = new Set<string>();

	try {
		// Decompress gzip to get tar data
		const tarData = await decompressGzip(data);

		// Convert decompressed tar to string for pattern matching
		const decoder = new TextDecoder('utf-8', { fatal: false });
		const text = decoder.decode(tarData);

		// Find all package imports in the entire tar content
		const importPattern = /#import\s+["'](@\w+\/[^"':]+:[^"']+)["']/g;
		let match;
		while ((match = importPattern.exec(text)) !== null) {
			const spec = parsePackageSpec(match[1]);
			if (spec) {
				const key = getPackageCacheKey(spec);
				if (!seen.has(key)) {
					seen.add(key);
					packages.push(spec);
				}
			}
		}
	} catch (error) {
		console.warn('[Typst Packages] Error scanning package for dependencies:', error);
	}

	return packages;
}

/**
 * Pre-fetch all packages referenced in the source code, including transitive dependencies
 * This recursively downloads packages that depend on other packages
 */
async function prefetchPackages(source: string): Promise<void> {
	const allPackages = extractPackageImports(source);
	if (allPackages.length === 0) {
		return;
	}

	console.log(`[Typst Packages] Found ${allPackages.length} direct package(s) to prefetch`);

	// Track which packages we've already processed to avoid infinite loops
	const processed = new Set<string>();
	const queue = [...allPackages];
	let totalDownloaded = 0;
	let totalFailed = 0;

	// Process packages in waves, discovering new dependencies as we go
	while (queue.length > 0) {
		const batch = queue.splice(0, queue.length);
		const newDependencies: PackageSpec[] = [];

		for (const spec of batch) {
			const cacheKey = getPackageCacheKey(spec);
			if (processed.has(cacheKey)) {
				continue;
			}
			processed.add(cacheKey);

			// Fetch the package
			const data = await fetchPackage(spec);
			if (data) {
				totalDownloaded++;

				// Scan for transitive dependencies
				const deps = await extractPackageImportsFromTarGz(data);
				for (const dep of deps) {
					const depKey = getPackageCacheKey(dep);
					if (!processed.has(depKey)) {
						newDependencies.push(dep);
					}
				}
			} else {
				totalFailed++;
			}
		}

		// Add newly discovered dependencies to the queue
		if (newDependencies.length > 0) {
			console.log(`[Typst Packages] Found ${newDependencies.length} transitive dependencies`);
			queue.push(...newDependencies);
		}
	}

	// Log summary
	if (totalFailed > 0) {
		console.warn(`[Typst Packages] Prefetch complete: ${totalDownloaded} downloaded, ${totalFailed} failed`);
	} else {
		console.log(`[Typst Packages] Prefetch complete: ${totalDownloaded} packages ready`);
	}
}

/**
 * Custom PackageRegistry that serves packages from the pre-fetched cache
 * This works in web workers because it only reads from an in-memory cache
 */
function createCachedPackageRegistry(am: any) {
	return {
		resolve(spec: PackageSpec, context: any): string | undefined {
			if (spec.namespace !== 'preview') {
				return undefined;
			}

			const cacheKey = getPackageCacheKey(spec);

			// Check if already extracted
			if (extractedPackages.has(cacheKey)) {
				return extractedPackages.get(cacheKey);
			}

			// Get from memory cache (should have been prefetched)
			const data = packageCache.get(cacheKey);
			if (!data) {
				console.error(`[Typst Packages] Package not available: ${cacheKey}`);
				console.error(`[Typst Packages] This package needs to be downloaded first. Check your internet connection.`);
				return undefined;
			}

			// Extract package using the context's untar function
			const previewDir = `/@memory/fetch/packages/preview/${spec.namespace}/${spec.name}/${spec.version}`;
			const entries: Array<[string, Uint8Array, Date]> = [];

			try {
				context.untar(data, (path: string, fileData: Uint8Array, mtime: number) => {
					entries.push([previewDir + '/' + path, fileData, new Date(mtime)]);
				});

				// Write files to access model
				for (const [filePath, fileData, mtime] of entries) {
					am.insertFile(filePath, fileData, mtime);
				}

				extractedPackages.set(cacheKey, previewDir);
				console.log(`[Typst Packages] Extracted: ${cacheKey} -> ${previewDir}`);
				return previewDir;
			} catch (error) {
				console.error(`[Typst Packages] Failed to extract: ${cacheKey}`, error);
				return undefined;
			}
		}
	};
}

/**
 * Create a simple in-memory file system model
 * This is a fallback if the typst.ts MemoryAccessModel cannot be imported
 */
function createSimpleMemoryModel() {
	const mTimes = new Map<string, Date | undefined>();
	const mData = new Map<string, Uint8Array | undefined>();

	return {
		reset(): void {
			mTimes.clear();
			mData.clear();
		},
		insertFile(path: string, data: Uint8Array, mtime: Date): void {
			mTimes.set(path, mtime);
			mData.set(path, data);
		},
		removeFile(path: string): void {
			mTimes.delete(path);
			mData.delete(path);
		},
		getMTime(path: string): Date | undefined {
			return mTimes.get(path);
		},
		isFile(path: string): boolean | undefined {
			return mData.has(path) ? true : undefined;
		},
		getRealPath(path: string): string | undefined {
			return mData.has(path) ? path : undefined;
		},
		readAll(path: string): Uint8Array | undefined {
			// Try exact match first
			let data = mData.get(path);
			if (data) {
				return data;
			}

			// Try without leading slash
			const withoutSlash = path.startsWith('/') ? path.slice(1) : path;
			data = mData.get(withoutSlash);
			if (data) {
				return data;
			}

			// Try with leading slash
			const withSlash = path.startsWith('/') ? path : '/' + path;
			data = mData.get(withSlash);
			if (data) {
				return data;
			}

			return undefined;
		}
	};
}

export interface CompileResult {
	success: boolean;
	pdf?: Uint8Array;
	svg?: string;
	errors?: DiagnosticInfo[];
}

export interface DiagnosticInfo {
	message: string;
	severity: 'error' | 'warning' | 'info';
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
}

/**
 * Result of compiling with span/debug info for bidirectional sync
 */
export interface CompileWithSpansResult {
	success: boolean;
	/** The compiled artifact bytes (for use with renderer) */
	artifactBytes?: Uint8Array;
	/** Pre-rendered SVG string */
	svg?: string;
	errors?: DiagnosticInfo[];
}

/**
 * Source location resolved from a click in the preview
 */
export interface SourceLocation {
	filepath: string;
	line: number;
	column: number;
}

/**
 * Position in the rendered document
 */
export interface DocumentPosition {
	page: number;
	x: number;
	y: number;
}

interface TypstDiagnostic {
	message?: string;
	msg?: string;
	severity?: string;
	line?: number;
	column?: number;
	col?: number;
	range?: {
		start?: { line?: number; character?: number; column?: number };
		end?: { line?: number; character?: number; column?: number };
	};
}

/**
 * Function type for reading WASM files
 * Returns the WASM module bytes as Uint8Array
 */
export type WasmFileReader = (filename: string) => Promise<Uint8Array>;

/**
 * Options for initializing the Typst WASM compiler
 */
export interface TypstWasmOptions {
	/** Function to read WASM files - returns file bytes */
	readWasmFile?: WasmFileReader;
	/** Base URI for fallback CDN loading (used if readWasmFile is not provided) */
	wasmBaseUri?: string;
}

/**
 * Initialize the Typst WASM compiler
 * @param options Options for WASM initialization
 */
export async function initializeTypstWasm(options?: TypstWasmOptions | string): Promise<void> {
	if (typstInstance) {
		return;
	}

	if (initPromise) {
		return initPromise;
	}

	// Handle legacy string argument for backwards compatibility
	const normalizedOptions: TypstWasmOptions =
		typeof options === 'string' ? { wasmBaseUri: options } : (options ?? {});

	initPromise = doInitialize(normalizedOptions);
	return initPromise;
}

async function doInitialize(options: TypstWasmOptions): Promise<void> {
	try {
		console.log('[Typst WASM] Loading typst.ts module...');

		// Dynamic import of typst.ts modules
		const snippetModule = await import('@myriaddreamin/typst.ts/contrib/snippet');
		const $typst = snippetModule.$typst;
		const TypstSnippet = snippetModule.TypstSnippet;

		if (!$typst) {
			throw new Error('Could not find $typst in typst.ts/contrib/snippet module');
		}

		// Create memory access model for file system access
		memoryAccessModel = createSimpleMemoryModel();
		console.log('[Typst WASM] Created memory access model for file system access');

		// Configure the access model with $typst.use()
		if (TypstSnippet && typeof TypstSnippet.withAccessModel === 'function') {
			try {
				$typst.use(TypstSnippet.withAccessModel(memoryAccessModel));
				console.log('[Typst WASM] Configured access model with $typst.use()');
			} catch (error) {
				console.warn('[Typst WASM] Could not configure access model:', error);
			}
		}

		// Configure package registry for external packages (@preview/...)
		// We use a custom cached registry that works in web workers (no sync XHR)
		// Packages are pre-fetched asynchronously before compilation
		if (TypstSnippet && typeof TypstSnippet.withPackageRegistry === 'function') {
			try {
				const cachedRegistry = createCachedPackageRegistry(memoryAccessModel);
				$typst.use(TypstSnippet.withPackageRegistry(cachedRegistry));
				console.log('[Typst WASM] Configured cached package registry for @preview packages');
			} catch (error) {
				console.warn('[Typst WASM] Could not configure cached package registry:', error);
				// Fallback: try the sync-XHR based registry (works in main thread, not web workers)
				if (typeof TypstSnippet.fetchPackageRegistry === 'function') {
					try {
						$typst.use(TypstSnippet.fetchPackageRegistry(memoryAccessModel));
						console.log('[Typst WASM] Configured sync package registry as fallback');
					} catch (fallbackError) {
						console.warn('[Typst WASM] Fallback package registry also failed:', fallbackError);
					}
				}
			}
		} else if (TypstSnippet && typeof TypstSnippet.fetchPackageRegistry === 'function') {
			// Fallback to sync-XHR based registry
			try {
				$typst.use(TypstSnippet.fetchPackageRegistry(memoryAccessModel));
				console.log('[Typst WASM] Configured sync package registry (may not work in web workers)');
			} catch (error) {
				console.warn('[Typst WASM] Could not configure package registry:', error);
			}
		} else {
			console.warn('[Typst WASM] Package registry not available - @preview packages will not work');
		}

		const { readWasmFile, wasmBaseUri } = options;

		// Configure the compiler to load WASM
		// Priority: 1. File reader (works in all environments), 2. URL fallback, 3. CDN
		if (readWasmFile) {
			// Use file reader to load WASM bytes directly
			// This works in production web (vscode-server) where fetch(file://) fails
			console.log('[Typst WASM] Using file reader for WASM loading');

			$typst.setCompilerInitOptions({
				getModule: async () => {
					console.log('[Typst WASM] Loading compiler WASM via file reader...');
					const bytes = await readWasmFile('typst_ts_web_compiler_bg.wasm');
					return bytes;
				},
			});

			$typst.setRendererInitOptions({
				getModule: async () => {
					console.log('[Typst WASM] Loading renderer WASM via file reader...');
					const bytes = await readWasmFile('typst_ts_renderer_bg.wasm');
					return bytes;
				},
			});
		} else if (wasmBaseUri) {
			// Use URL-based loading (works in local development)
			const compilerWasmUrl = `${wasmBaseUri}/typst_ts_web_compiler_bg.wasm`;
			const rendererWasmUrl = `${wasmBaseUri}/typst_ts_renderer_bg.wasm`;

			console.log('[Typst WASM] Compiler WASM URL:', compilerWasmUrl);
			console.log('[Typst WASM] Renderer WASM URL:', rendererWasmUrl);

			$typst.setCompilerInitOptions({
				getModule: () => compilerWasmUrl,
			});

			$typst.setRendererInitOptions({
				getModule: () => rendererWasmUrl,
			});
		} else {
			// CDN fallback
			const compilerWasmUrl =
				'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm';
			const rendererWasmUrl =
				'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm';

			console.log('[Typst WASM] Using CDN fallback');
			console.log('[Typst WASM] Compiler WASM URL:', compilerWasmUrl);
			console.log('[Typst WASM] Renderer WASM URL:', rendererWasmUrl);

			$typst.setCompilerInitOptions({
				getModule: () => compilerWasmUrl,
			});

			$typst.setRendererInitOptions({
				getModule: () => rendererWasmUrl,
			});
		}

		typstInstance = $typst;
		console.log('[Typst WASM] Typst compiler initialized successfully');
	} catch (error) {
		console.error('[Typst WASM] Failed to initialize:', error);
		initPromise = null;
		throw error;
	}
}

/**
 * Check if the WASM compiler is loaded
 */
export function isWasmLoaded(): boolean {
	return typstInstance !== null;
}

/**
 * Result of loading referenced files - includes any errors for missing files
 */
interface LoadReferencedFilesResult {
	/** Errors for files that could not be loaded */
	errors: DiagnosticInfo[];
}

/**
 * Load referenced files into the compiler using MemoryAccessModel.insertFile
 * This is the preferred method for multi-file compilation
 *
 * @returns Result with any errors for missing files (with correct line/column)
 */
async function loadReferencedFiles(document: vscode.TextDocument): Promise<LoadReferencedFilesResult> {
	const result: LoadReferencedFilesResult = { errors: [] };

	if (!memoryAccessModel) {
		console.warn('[Typst WASM] No memory access model available, file references will not work');
		return result;
	}

	// Reset previous files
	if (typeof memoryAccessModel.reset === 'function') {
		memoryAccessModel.reset();
	}

	// Get the document directory for resolving relative paths
	const documentDir = vscode.Uri.joinPath(document.uri, '..');
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;

	// Extract file references from the document
	const source = document.getText();
	const references = extractFileReferences(source);

	for (const ref of references) {
		try {
			// Resolve the path relative to document directory
			const cleanPath = ref.path.replace(/^["']|["']$/g, '');
			let fileUri: vscode.Uri;

			if (cleanPath.startsWith('/')) {
				// Absolute path (relative to workspace)
				if (workspaceRoot) {
					fileUri = vscode.Uri.joinPath(workspaceRoot, cleanPath.slice(1));
				} else {
					fileUri = vscode.Uri.joinPath(documentDir, cleanPath.slice(1));
				}
			} else {
				// Relative path (relative to document directory)
				fileUri = vscode.Uri.joinPath(documentDir, cleanPath);
			}

			// Check if file exists first
			try {
				const stat = await vscode.workspace.fs.stat(fileUri);

				// Check if it's a directory instead of a file
				if (stat.type === vscode.FileType.Directory) {
					const typeLabel = ref.type === 'bibliography' ? 'Bibliography' : ref.type === 'image' ? 'Image' : 'Include';
					result.errors.push({
						message: `${typeLabel} path "${ref.path}" is a directory, not a file`,
						severity: 'error',
						range: {
							start: { line: ref.line, character: ref.column },
							end: { line: ref.line, character: ref.column + ref.path.length + 20 }
						}
					});
					continue;
				}

				// Read the file
				const data = await vscode.workspace.fs.readFile(fileUri);

				// Insert file into memory access model
				// The compiler uses /tmp/ as default directory when mainFilePath is not specified
				// We need to resolve paths relative to /tmp/ so the compiler can find them
				// For "../foo" from /tmp/, the resolved path is "/foo"
				let virtualPath: string;
				if (cleanPath.startsWith('/')) {
					// Absolute paths stay as-is
					virtualPath = cleanPath;
				} else {
					// Resolve relative path from /tmp/
					// Split the path and resolve . and ..
					const baseParts = ['', 'tmp']; // represents /tmp
					const pathParts = cleanPath.split(/[/\\]/);
					const resolvedParts = [...baseParts];

					for (const part of pathParts) {
						if (part === '..') {
							if (resolvedParts.length > 1) {
								resolvedParts.pop();
							}
						} else if (part !== '.' && part !== '') {
							resolvedParts.push(part);
						}
					}
					virtualPath = resolvedParts.join('/') || '/';
				}
				memoryAccessModel.insertFile(virtualPath, data, new Date(stat.mtime));
			} catch (statError: any) {
				// File does not exist or cannot be accessed
				const typeLabel = ref.type === 'bibliography' ? 'Bibliography' : ref.type === 'image' ? 'Image' : 'Include';
				let errorMessage = `${typeLabel} file not found: "${ref.path}"`;

				// Check if error indicates file not found
				if (statError?.code === 'FileNotFound' || statError?.code === 'ENOENT') {
					errorMessage = `${typeLabel} file not found: "${ref.path}"`;
				} else if (statError?.message) {
					// Include original error but make it clearer
					const originalMsg = String(statError.message);
					// Replace confusing "is a directory" message for non-existent files
					if (originalMsg.includes('is a directory')) {
						errorMessage = `${typeLabel} file not found: "${ref.path}"`;
					} else {
						errorMessage = `Cannot load ${typeLabel.toLowerCase()} file "${ref.path}": ${originalMsg}`;
					}
				}

				result.errors.push({
					message: errorMessage,
					severity: 'error',
					range: {
						start: { line: ref.line, character: ref.column },
						end: { line: ref.line, character: ref.column + ref.path.length + 20 }
					}
				});
				console.warn(`[Typst WASM] Failed to load file ${ref.path}:`, statError);
			}
		} catch (error) {
			console.warn(`[Typst WASM] Error processing file reference ${ref.path}:`, error);
		}
	}

	return result;
}

/**
 * File reference with position information
 */
interface FileReference {
	path: string;
	type: 'image' | 'include' | 'bibliography';
	line: number;  // 0-based line number
	column: number;  // 0-based column number
}

/**
 * Extract file references from Typst source code with position information
 */
function extractFileReferences(source: string): FileReference[] {
	const references: FileReference[] = [];
	const lines = source.split('\n');

	// Process each line to track accurate positions
	for (let lineNum = 0; lineNum < lines.length; lineNum++) {
		const line = lines[lineNum];

		// Skip comment lines
		if (line.trim().startsWith('//')) {
			continue;
		}

		// Remove inline comments for pattern matching
		const lineWithoutComments = removeInlineComment(line);

		// Match image("path") - with or without # prefix (inside figures uses image without #)
		const imagePattern = /#?image\s*\(\s*["']([^"']+)["']/g;
		let match;
		while ((match = imagePattern.exec(lineWithoutComments)) !== null) {
			references.push({
				path: match[1],
				type: 'image',
				line: lineNum,
				column: match.index
			});
		}

		// Match include("path") - with or without # prefix
		const includePattern = /#?include\s*\(\s*["']([^"']+)["']/g;
		while ((match = includePattern.exec(lineWithoutComments)) !== null) {
			references.push({
				path: match[1],
				type: 'include',
				line: lineNum,
				column: match.index
			});
		}

		// Match bibliography("path") - with or without # prefix
		const bibPattern = /#?bibliography\s*\(\s*["']([^"']+)["']/g;
		while ((match = bibPattern.exec(lineWithoutComments)) !== null) {
			references.push({
				path: match[1],
				type: 'bibliography',
				line: lineNum,
				column: match.index
			});
		}
	}

	return references;
}

/**
 * Remove inline comments from a line while preserving string contents
 */
function removeInlineComment(line: string): string {
	let inString = false;
	let stringChar = '';

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const prevChar = i > 0 ? line[i - 1] : '';

		// Handle string delimiters (double quote = 34, single quote = 39, backslash = 92)
		if ((char.charCodeAt(0) === 34 || char.charCodeAt(0) === 39) && prevChar.charCodeAt(0) !== 92) {
			if (!inString) {
				inString = true;
				stringChar = char;
			} else if (char === stringChar) {
				inString = false;
				stringChar = '';
			}
		}

		// Check for // comment (only if not in string)
		if (!inString && char === '/' && i + 1 < line.length && line[i + 1] === '/') {
			return line.substring(0, i);
		}
	}

	return line;
}

/**
 * Compile Typst source code to PDF
 * @param source The Typst source code
 * @param document Optional document for file resolution context
 */
export async function compileToPdf(source: string, document?: vscode.TextDocument): Promise<CompileResult> {
	if (!typstInstance) {
		return {
			success: false,
			errors: [
				{
					message: 'Typst WASM compiler not initialized',
					severity: 'error',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				},
			],
		};
	}

	try {
		// Pre-fetch any external packages referenced in the source
		await prefetchPackages(source);

		// Load referenced files using map_shadow/add_source
		// Collect any file loading errors (missing files, etc.)
		let fileErrors: DiagnosticInfo[] = [];
		if (document) {
			const loadResult = await loadReferencedFiles(document);
			fileErrors = loadResult.errors;
		}

		// If there are file loading errors, return them immediately
		// This provides clearer error messages with correct line numbers
		if (fileErrors.length > 0) {
			return {
				success: false,
				errors: fileErrors
			};
		}

		const pdf = await typstInstance.pdf({
			mainContent: source,
		});

		if (pdf) {
			return { success: true, pdf };
		} else {
			return {
				success: false,
				errors: [
					{
						message: 'Compilation returned no output',
						severity: 'error',
						range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					},
				],
			};
		}
	} catch (error: any) {
		console.error('[Typst WASM] Compilation error:', error);
		return parseCompilationError(error, source);
	}
}

/**
 * Compile Typst source code to SVG
 * @param source The Typst source code
 * @param document Optional document for file resolution context
 */
export async function compileToSvg(source: string, document?: vscode.TextDocument): Promise<CompileResult> {
	if (!typstInstance) {
		return {
			success: false,
			errors: [
				{
					message: 'Typst WASM compiler not initialized',
					severity: 'error',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				},
			],
		};
	}

	try {
		// Pre-fetch any external packages referenced in the source
		await prefetchPackages(source);

		// Load referenced files using map_shadow/add_source
		// Collect any file loading errors (missing files, etc.)
		let fileErrors: DiagnosticInfo[] = [];
		if (document) {
			const loadResult = await loadReferencedFiles(document);
			fileErrors = loadResult.errors;
		}

		// If there are file loading errors, return them immediately
		// This provides clearer error messages with correct line numbers
		if (fileErrors.length > 0) {
			return {
				success: false,
				errors: fileErrors
			};
		}

		const svg = await typstInstance.svg({
			mainContent: source,
		});

		return { success: true, svg };
	} catch (error: any) {
		// Log the error for debugging
		console.error('[Typst WASM] Compilation error:', error);
		return parseCompilationError(error, source);
	}
}

/**
 * Helper function to find error location in source code based on error message patterns.
 * This is used when the compiler doesn't provide accurate line/column information.
 *
 * @param message The error message from the compiler
 * @param source The Typst source code
 * @returns Location { line, column } (0-based) or undefined if not found
 */
function findErrorLocationInSource(message: string, source: string): { line: number; column: number } | undefined {
	const lines = source.split('\n');

	// Pattern 1: "label `<labelname>` does not exist in the document"
	// Used for bibliography citations (@labelname) that reference non-existent entries
	const labelNotExistMatch = message.match(/label\s+`<([^>]+)>`\s+does not exist/i);
	if (labelNotExistMatch) {
		const labelName = labelNotExistMatch[1];
		const citationPattern = '@' + labelName;
		for (let i = 0; i < lines.length; i++) {
			const colIndex = lines[i].indexOf(citationPattern);
			if (colIndex !== -1 && !lines[i].trim().startsWith('//')) {
				return { line: i, column: colIndex };
			}
		}
	}

	// Pattern 2: "label `<labelname>` occurs multiple times" / "duplicate label"
	// Find the second occurrence of the label definition
	const duplicateLabelMatch = message.match(/label\s+`<([^>]+)>`\s+(?:occurs|already|duplicate)/i);
	if (duplicateLabelMatch) {
		const labelName = duplicateLabelMatch[1];
		const labelPattern = '<' + labelName + '>';
		let firstFound = false;
		for (let i = 0; i < lines.length; i++) {
			const colIndex = lines[i].indexOf(labelPattern);
			if (colIndex !== -1 && !lines[i].trim().startsWith('//')) {
				if (firstFound) {
					return { line: i, column: colIndex };
				}
				firstFound = true;
			}
		}
	}

	// Pattern 3: "unknown variable: varname" or "unknown variable `varname`"
	const unknownVarMatch = message.match(/unknown\s+variable[:\s]+`?(\w+)`?/i);
	if (unknownVarMatch) {
		const varName = unknownVarMatch[1];
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(varName) && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf(varName);
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 4: "unknown function: funcname" or "unknown function `funcname`"
	const unknownFuncMatch = message.match(/unknown\s+function[:\s]+`?(\w+)`?/i);
	if (unknownFuncMatch) {
		const funcName = unknownFuncMatch[1];
		// Functions are called with # prefix or as method calls
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith('//')) {
				continue;
			}
			// Try #funcname( pattern
			const funcCallPattern = new RegExp('#' + funcName + '\\s*\\(');
			const funcMatch = line.match(funcCallPattern);
			if (funcMatch && funcMatch.index !== undefined) {
				return { line: i, column: funcMatch.index };
			}
			// Try .funcname( pattern (method call)
			const methodPattern = new RegExp('\\.' + funcName + '\\s*\\(');
			const methodMatch = line.match(methodPattern);
			if (methodMatch && methodMatch.index !== undefined) {
				return { line: i, column: methodMatch.index };
			}
			// Try funcname( without # (inside code blocks)
			if (line.includes(funcName + '(')) {
				const colIndex = line.indexOf(funcName + '(');
				return { line: i, column: colIndex };
			}
		}
	}

	// Pattern 5: "unknown field: fieldname" or "unknown key: keyname"
	const unknownFieldMatch = message.match(/unknown\s+(?:field|key)[:\s]+`?(\w+)`?/i);
	if (unknownFieldMatch) {
		const fieldName = unknownFieldMatch[1];
		// Fields are used as fieldname: value
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith('//')) {
				continue;
			}
			const fieldPattern = new RegExp(fieldName + '\\s*:');
			const fieldMatch = line.match(fieldPattern);
			if (fieldMatch && fieldMatch.index !== undefined) {
				return { line: i, column: fieldMatch.index };
			}
		}
	}

	// Pattern 6: "file not found" or "failed to open" for specific files
	const fileNotFoundMatch = message.match(/(?:file\s+not\s+found|failed\s+to\s+(?:load|open))[:\s]*["']?([^"'\n]+)["']?/i);
	if (fileNotFoundMatch) {
		const fileName = fileNotFoundMatch[1].trim();
		// Look for image(), include(), or bibliography() calls with this file
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(fileName) && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf(fileName);
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 7: "unknown font family: fontname"
	const unknownFontMatch = message.match(/unknown\s+font(?:\s+family)?[:\s]+`?([^`\n]+)`?/i);
	if (unknownFontMatch) {
		const fontName = unknownFontMatch[1].trim();
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(fontName) && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf(fontName);
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 8: "package not found" or "cannot find package"
	const packageNotFoundMatch = message.match(/(?:package\s+not\s+found|cannot\s+find\s+package)[:\s]*["']?(@[^"'\s\n]+)["']?/i);
	if (packageNotFoundMatch) {
		const packageName = packageNotFoundMatch[1];
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(packageName) && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf(packageName);
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 9: "missing argument: argname" or "argument `argname` is missing"
	const missingArgMatch = message.match(/(?:missing\s+argument|argument\s+`([^`]+)`\s+is\s+missing)[:\s]*`?([^`\n]*)`?/i);
	if (missingArgMatch) {
		const argName = missingArgMatch[1] || missingArgMatch[2];
		if (argName) {
			// Look for function calls that might be missing this argument
			// This is harder to pinpoint, so we look for the function name if mentioned
			const funcInMessage = message.match(/(?:in|for|of)\s+`?(\w+)`?/i);
			if (funcInMessage) {
				const funcName = funcInMessage[1];
				for (let i = 0; i < lines.length; i++) {
					if (lines[i].includes(funcName) && !lines[i].trim().startsWith('//')) {
						const colIndex = lines[i].indexOf(funcName);
						return { line: i, column: colIndex >= 0 ? colIndex : 0 };
					}
				}
			}
		}
	}

	// Pattern 10: "cannot apply X to Y" - type mismatch errors
	const typeErrorMatch = message.match(/cannot\s+(?:apply|convert|use)\s+`?(\w+)`?\s+(?:to|as|on)\s+`?(\w+)`?/i);
	if (typeErrorMatch) {
		// Look for the first term which is usually the value being used incorrectly
		const term = typeErrorMatch[1];
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(term) && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf(term);
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 11: "can only be used when context is known" - context-dependent functions
	if (message.includes('can only be used when context is known')) {
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('.display()') || lines[i].includes('counter(') || lines[i].includes('state(')) {
				return { line: i, column: 0 };
			}
		}
	}

	// Pattern 12: "expected X, found Y" - syntax errors with expected tokens
	const expectedMatch = message.match(/expected\s+([^,\n]+)(?:,\s+found)?/i);
	if (expectedMatch) {
		const expected = expectedMatch[1].trim();
		// Common patterns
		if (expected.includes(')') || expected.includes(']') || expected.includes('}')) {
			// Look for unmatched opening brackets
			const bracketStack: Array<{ char: string; line: number; col: number }> = [];
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				for (let j = 0; j < line.length; j++) {
					const char = line[j];
					if (char === '(' || char === '[' || char === '{') {
						bracketStack.push({ char, line: i, col: j });
					} else if (char === ')' || char === ']' || char === '}') {
						bracketStack.pop();
					}
				}
			}
			if (bracketStack.length > 0) {
				const last = bracketStack[bracketStack.length - 1];
				return { line: last.line, column: last.col };
			}
		}
	}

	// Pattern 13: "content or array expected, found X" - common type mismatch
	const contentExpectedMatch = message.match(/(?:content|array|string|integer|float)\s+expected/i);
	if (contentExpectedMatch) {
		// Look for #set or #show statements which often cause these errors
		for (let i = 0; i < lines.length; i++) {
			if ((lines[i].includes('#set') || lines[i].includes('#show')) && !lines[i].trim().startsWith('//')) {
				return { line: i, column: 0 };
			}
		}
	}

	// Pattern 14: "assertion failed" - for #assert statements
	if (message.includes('assertion failed')) {
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('#assert') && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf('#assert');
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	// Pattern 15: "division by zero" - math errors
	if (message.includes('division by zero') || message.includes('divide by zero')) {
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('/') && !lines[i].trim().startsWith('//')) {
				const colIndex = lines[i].indexOf('/');
				return { line: i, column: colIndex >= 0 ? colIndex : 0 };
			}
		}
	}

	return undefined;
}

/**
 * Validate Typst source code and get diagnostics with proper location information
 * @param source The Typst source code
 * @param document Optional document for file resolution context
 */
export async function validateSource(source: string, document?: vscode.TextDocument): Promise<DiagnosticInfo[]> {
	if (!typstInstance) {
		return [];
	}

	try {
		// Pre-fetch any external packages referenced in the source
		await prefetchPackages(source);

		// Load referenced files using map_shadow/add_source
		// Collect any file loading errors (missing files, etc.)
		let fileErrors: DiagnosticInfo[] = [];
		if (document) {
			const loadResult = await loadReferencedFiles(document);
			fileErrors = loadResult.errors;
		}

		// If there are file loading errors, return them immediately
		// This provides clearer error messages with correct line numbers
		if (fileErrors.length > 0) {
			return fileErrors;
		}

		// Check if getDiagnostics method is available (proper API)
		if (typeof typstInstance.getDiagnostics === 'function') {
			const diagnostics = await typstInstance.getDiagnostics({
				mainContent: source,
			});

			if (Array.isArray(diagnostics)) {
				return diagnostics.map((diag: any) => {
					let lineNum = 0;
					let colNum = 0;

					// Try to decode span if decode method is available
					if (diag.span && typeof typstInstance.decode === 'function') {
						try {
							const decoded = typstInstance.decode(diag.span);
							if (decoded && typeof decoded.line === 'number') {
								lineNum = Math.max(0, decoded.line - 1);
							}
							if (decoded && typeof decoded.column === 'number') {
								colNum = Math.max(0, decoded.column - 1);
							}
						} catch (e) {
							// Fallback if decode fails
							console.warn('[Typst WASM] Failed to decode span:', e);
						}
					}

					// Check for direct line/column properties
					if (typeof diag.line === 'number') {
						lineNum = Math.max(0, diag.line - 1);
					}
					if (typeof diag.column === 'number' || typeof diag.col === 'number') {
						colNum = Math.max(0, (diag.column || diag.col || 0) - 1);
					}

					// Check for range property
					if (diag.range && typeof diag.range === 'object') {
						if (typeof diag.range.start?.line === 'number') {
							lineNum = Math.max(0, diag.range.start.line);
						}
						if (
							typeof diag.range.start?.character === 'number' ||
							typeof diag.range.start?.column === 'number'
						) {
							colNum = Math.max(0, diag.range.start.character || diag.range.start.column || 0);
						}
					}

					const message = diag.message || diag.msg || String(diag);

					// If location is still unknown, try to find it in source code
					if (lineNum === 0) {
						const location = findErrorLocationInSource(message, source);
						if (location) {
							lineNum = location.line;
							colNum = location.column;
						}
					}

					const severity =
						(diag.severity || 'error').toLowerCase() === 'error'
							? 'error'
							: (diag.severity || 'error').toLowerCase() === 'warning'
								? 'warning'
								: 'info';

					return {
						message: message,
						severity: severity,
						range: {
							start: { line: lineNum, character: colNum },
							end: { line: lineNum, character: colNum + (diag.length || 100) },
						},
					};
				});
			}
		}

		// Fallback: Try to compile - if it fails, we get errors
		try {
			await typstInstance.svg({
				mainContent: source,
			});
		} catch (error: any) {
			const result = parseCompilationError(error, source);
			return result.errors ?? [];
		}
		return []; // No errors
	} catch (error) {
		const result = parseCompilationError(error, source);
		return result.errors ?? [];
	}
}

/**
 * Parse compilation error into DiagnosticInfo
 * Handles both string error messages and Rust diagnostic object formats
 */
function parseCompilationError(error: unknown, source?: string): CompileResult {
	// Filter out access model configuration errors - these are warnings, not real compilation errors
	let errorMsg: string;
	if (error && typeof error === 'object') {
		const errorObj = error as { message?: unknown };
		errorMsg = errorObj.message !== undefined ? String(errorObj.message) : String(error);
	} else {
		errorMsg = String(error);
	}

	if (errorMsg.includes('assess model') || errorMsg.includes('access model')) {
		console.warn('[Typst WASM] Ignoring access model configuration warning:', errorMsg);
		// Return a warning instead of an error - the compilation might have actually succeeded
		// but we can't tell because the error was thrown
		return {
			success: false,
			errors: [{
				message: 'Access model configuration warning (compilation may have succeeded)',
				severity: 'warning',
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
			}]
		};
	}

	// Check if error is an array of diagnostic objects (structured format from Typst compiler)
	if (Array.isArray(error)) {
		const errors: DiagnosticInfo[] = [];
		for (const diagnostic of error) {
			if (diagnostic && typeof diagnostic === 'object') {
				const diag = diagnostic as TypstDiagnostic;
				const message = diag.message || diag.msg || String(diagnostic);

				// Filter out access model configuration errors
				if (message.includes('assess model') || message.includes('access model')) {
					console.warn('[Typst WASM] Ignoring access model configuration warning in diagnostics:', message);
					continue;
				}
				const severity =
					(diag.severity || 'error').toLowerCase() === 'error'
						? 'error'
						: (diag.severity || 'error').toLowerCase() === 'warning'
							? 'warning'
							: 'info';

				// Try to extract location from diagnostic object
				let lineNum = 0;
				let colNum = 0;

				// Check for line/column properties
				if (typeof diag.line === 'number') {
					lineNum = Math.max(0, diag.line - 1);
				}
				if (typeof diag.column === 'number' || typeof diag.col === 'number') {
					colNum = Math.max(0, (diag.column || diag.col || 0) - 1);
				}

				// Check for range/span properties
				if (diag.range && typeof diag.range === 'object') {
					if (typeof diag.range.start?.line === 'number') {
						lineNum = Math.max(0, diag.range.start.line);
					}
					if (
						typeof diag.range.start?.character === 'number' ||
						typeof diag.range.start?.column === 'number'
					) {
						colNum = Math.max(0, diag.range.start.character || diag.range.start.column || 0);
					}
				}

				// If location is still unknown, try to find it in source code
				if (lineNum === 0 && source) {
					const location = findErrorLocationInSource(message, source);
					if (location) {
						lineNum = location.line;
						colNum = location.column;
					}
				}

				errors.push({
					message: message,
					severity: severity,
					range: {
						start: { line: lineNum, character: colNum },
						end: { line: lineNum, character: colNum + 100 },
					},
				});
			}
		}

		if (errors.length > 0) {
			return {
				success: false,
				errors: errors,
			};
		}
	}

	// Handle different error types (fallback to string parsing)
	let errorMsgStr: string;
	if (error instanceof Error) {
		errorMsgStr = error.message;
	} else if (typeof error === 'string') {
		errorMsgStr = error;
	} else if (error && typeof error === 'object' && error !== null) {
		// Check if object has toString method
		const errorObj = error as { toString?: () => string };
		if (errorObj.toString && typeof errorObj.toString === 'function') {
			errorMsgStr = errorObj.toString();
		} else {
			errorMsgStr = String(error);
		}
	} else {
		errorMsgStr = String(error);
	}

	// Parse multiple errors if present
	const errors: DiagnosticInfo[] = [];

	// Check if error is in Rust diagnostic format: [SourceDiagnostic { ... }, SourceDiagnostic { ... }]
	// Try to extract ALL individual diagnostic objects (not just the first one)
	// Pattern matches: SourceDiagnostic { severity: Error, span: Span(...), message: "...", trace: [...], hints: [...] }
	// We also try to extract trace information which might contain location hints
	// Note: The pattern is flexible to handle variations in whitespace and optional fields
	const diagnosticPattern =
		/SourceDiagnostic\s*\{\s*severity:\s*(\w+)\s*,\s*span:\s*Span\(([^)]+)\)\s*,\s*message:\s*"([^"]+)"\s*(?:,\s*trace:\s*\[([^\]]*)\])?\s*(?:,\s*hints:\s*\[([^\]]*)\])?\s*\}/g;
	let match;
	let foundDiagnostics = false;

	// Reset regex lastIndex to ensure we search from the beginning
	diagnosticPattern.lastIndex = 0;

	while ((match = diagnosticPattern.exec(errorMsgStr)) !== null) {
		foundDiagnostics = true;
		const severityStr = match[1].toLowerCase();
		const severity =
			severityStr === 'error' ? 'error' : severityStr === 'warning' ? 'warning' : 'info';
		let message = match[3];
		const trace = match[4] || '';
		const hints = match[5] || '';

		// Try multiple methods to extract location:
		// 1. From the error message itself
		// 2. From trace information
		// 3. From hints
		let lineNum = 0;
		let colNum = 0;

		// Method 1: Check the message
		let lineMatch = message.match(
			/(?:at|on|line|Ln|line)\s+(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i
		);
		if (lineMatch) {
			lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
			colNum =
				lineMatch[2] || lineMatch[3]
					? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1)
					: 0;
		}

		// Method 2: Check trace for location hints
		if (lineNum === 0 && trace) {
			lineMatch = trace.match(/(?:line|Ln)\s*(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i);
			if (lineMatch) {
				lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
				colNum =
					lineMatch[2] || lineMatch[3]
						? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1)
						: 0;
			}
		}

		// Method 3: Check hints
		if (lineNum === 0 && hints) {
			lineMatch = hints.match(/(?:line|Ln)\s*(\d+)(?:\s*,\s*col(?:umn)?\s*(\d+)|[:\s]+(\d+))?/i);
			if (lineMatch) {
				lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
				colNum =
					lineMatch[2] || lineMatch[3]
						? Math.max(0, parseInt(lineMatch[2] || lineMatch[3] || '0', 10) - 1)
						: 0;
			}
		}

		// Method 4: If we have source code, try to find the error location by searching for context
		// This is a heuristic approach when span decoding isn't available
		if (lineNum === 0 && source) {
			const location = findErrorLocationInSource(message, source);
			if (location) {
				lineNum = location.line;
				colNum = location.column;
			}

			// Additional complex patterns that may modify the error message
			const lines = source.split('\n');

			// For "unclosed delimiter" - try to find unmatched brackets by parsing
			// This also enhances the error message with specific bracket info
			if (lineNum === 0 && message.includes('unclosed delimiter')) {
				const bracketStack: Array<{ char: string; line: number; col: number }> = [];
				let inString = false;
				let inCodeBlock = false;
				let stringChar = '';
				let unclosedBracket: { char: string; line: number; col: number } | null = null;

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					for (let j = 0; j < line.length; j++) {
						const char = line[j];

						// Handle strings
						// eslint-disable-next-line local/code-no-unexternalized-strings
						if ((char === '\"' || char === "'") && (j === 0 || line[j - 1] !== '\\')) {
							if (!inString) {
								inString = true;
								stringChar = char;
							} else if (char === stringChar) {
								inString = false;
								stringChar = '';
							}
							continue;
						}

						if (inString) {
							continue;
						}

						// Handle code blocks
						if (char === '`' && j + 2 < line.length && line.substring(j, j + 3) === '```') {
							inCodeBlock = !inCodeBlock;
							j += 2;
							continue;
						}

						if (inCodeBlock) {
							continue;
						}

						// Handle comments
						if (char === '/' && j + 1 < line.length && line[j + 1] === '/') {
							break;
						}

						// Track brackets
						if (char === '(' || char === '[' || char === '{') {
							bracketStack.push({ char, line: i, col: j });
						} else if (char === ')' || char === ']' || char === '}') {
							if (bracketStack.length === 0) {
								lineNum = i;
								colNum = j;
								unclosedBracket = { char, line: i, col: j };
								break;
							}
							const last = bracketStack.pop();
							const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
							if (last && pairs[last.char] !== char) {
								lineNum = i;
								colNum = j;
								unclosedBracket = { char: last.char, line: last.line, col: last.col };
								break;
							}
						}
					}
					if (lineNum > 0) {
						break;
					}
				}

				if (lineNum === 0 && bracketStack.length > 0) {
					unclosedBracket = bracketStack[bracketStack.length - 1];
					lineNum = unclosedBracket.line;
					colNum = unclosedBracket.col;
				}

				if (unclosedBracket) {
					const bracketNames: Record<string, string> = {
						'(': 'parenthesis',
						'[': 'square bracket',
						'{': 'curly brace',
					};
					const bracketName = bracketNames[unclosedBracket.char] || 'delimiter';
					message = `${message} (unclosed ${bracketName} opened at line ${unclosedBracket.line + 1}, column ${unclosedBracket.col + 1})`;
				}
			}

			// For "unclosed label" - find labels missing closing >
			if (lineNum === 0 && message.includes('unclosed label')) {
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const openLabelIndex = line.indexOf('<');
					if (openLabelIndex >= 0) {
						const afterOpen = line.substring(openLabelIndex + 1);
						const closeLabelIndex = afterOpen.indexOf('>');
						if (closeLabelIndex === -1) {
							lineNum = i;
							colNum = openLabelIndex;
							break;
						}
					}
				}
			}
		}

		errors.push({
			message: message,
			severity: severity,
			range: {
				start: { line: lineNum, character: colNum },
				end: { line: lineNum, character: colNum + 100 },
			},
		});
	}

	// Also try a more flexible pattern that handles variations in whitespace
	// This will catch ALL diagnostic messages, not just the first one
	if (!foundDiagnostics) {
		const flexiblePattern = /message:\s*"([^"]+)"/g;
		flexiblePattern.lastIndex = 0;
		while ((match = flexiblePattern.exec(errorMsgStr)) !== null) {
			// Check if this looks like a diagnostic message (appears near SourceDiagnostic)
			const beforeMatch = errorMsgStr.substring(Math.max(0, match.index - 100), match.index);
			if (beforeMatch.includes('SourceDiagnostic') || beforeMatch.includes('severity')) {
				foundDiagnostics = true;
				const message = match[1];

				// Try to extract line number from message
				let lineNum = 0;
				let colNum = 0;
				const lineMatch = message.match(/(?:at|on|line)\s+(\d+)(?::(\d+))?/i);
				if (lineMatch) {
					lineNum = Math.max(0, parseInt(lineMatch[1], 10) - 1);
					colNum = lineMatch[2] ? Math.max(0, parseInt(lineMatch[2], 10) - 1) : 0;
				}

				errors.push({
					message: message,
					severity: 'error',
					range: {
						start: { line: lineNum, character: colNum },
						end: { line: lineNum, character: colNum + 100 },
					},
				});
			}
		}
	}

	// If we didn't find diagnostic objects, try to parse as plain text
	if (!foundDiagnostics) {
		const errorLines = errorMsgStr.split('\n');

		for (const line of errorLines) {
			if (line.trim()) {
				// Try to extract line/column info from error message
				// Common formats: "error: ... at line 5", "5:10: error..."
				const lineMatch = line.match(/(?:line\s*|:)(\d+)(?::(\d+))?/i);
				const lineNum = lineMatch ? parseInt(lineMatch[1], 10) - 1 : 0;
				const colNum = lineMatch?.[2] ? parseInt(lineMatch[2], 10) - 1 : 0;

				errors.push({
					message: line.trim(),
					severity: line.toLowerCase().includes('warning') ? 'warning' : 'error',
					range: {
						start: { line: Math.max(0, lineNum), character: colNum },
						end: { line: Math.max(0, lineNum), character: colNum + 100 },
					},
				});
			}
		}
	}

	return {
		success: false,
		errors: errors.length > 0 ? errors : [{
			message: foundDiagnostics ? 'Compilation error (see details above)' : errorMsgStr,
			severity: 'error',
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
		}]
	};
}

/**
 * Reset the compiler state
 */
export async function resetCompiler(): Promise<void> {
	if (typstInstance?.resetShadow) {
		await typstInstance.resetShadow();
	}
}

/**
 * Query the document using Typst's introspection query API
 * This is useful for finding labels, elements, etc.
 *
 * @param source The Typst source code
 * @param selector The Typst selector string (e.g., "label(<name>)" for labels)
 * @param field Optional field to extract from the result
 * @param document Optional document for file resolution context
 * @returns The query result, or undefined if query fails
 */
export async function queryDocument<T = any>(
	source: string,
	selector: string,
	field?: string,
	document?: vscode.TextDocument
): Promise<T | undefined> {
	if (!typstInstance) {
		return undefined;
	}

	try {
		// Load referenced files if document is provided
		if (document) {
			await loadReferencedFiles(document);
		}

		const result = await typstInstance.query({
			mainContent: source,
			selector: selector,
			field: field,
		});
		return result as T;
	} catch (error) {
		console.warn('[Typst WASM] Query failed:', error);
		return undefined;
	}
}

/**
 * Dispose of the WASM module
 */
export function disposeWasm(): void {
	typstInstance = null;
	initPromise = null;
	// Clean up bidirectional sync state
	disposeRenderer();
}

// ============================================================================
// Bidirectional Sync Functions - Text-based Source Mapping (WASM Compatible)
// ============================================================================

// Store the current source for text-to-line mapping
let currentSourceCode: string = '';
let currentSourceLines: string[] = [];

/**
 * Compile Typst source to SVG for bidirectional sync.
 * Uses simple SVG generation and stores source for text-based mapping.
 *
 * @param source The Typst source code
 * @returns Compile result with SVG that can be displayed in the preview
 */
export async function compileWithSpans(source: string): Promise<CompileWithSpansResult> {
	if (!typstInstance) {
		return {
			success: false,
			errors: [
				{
					message: 'Typst WASM compiler not initialized',
					severity: 'error',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				},
			],
		};
	}

	try {
		// Store source for text-based mapping
		currentSourceCode = source;
		currentSourceLines = source.split('\n');

		// Use simple SVG compilation - reliable and works with standard WASM
		const svg = await typstInstance.svg({
			mainContent: source,
		});

		if (svg) {
			return {
				success: true,
				svg,
			};
		}

		return {
			success: false,
			errors: [
				{
					message: 'Compilation produced no output',
					severity: 'error',
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
				},
			],
		};
	} catch (error) {
		return parseCompilationError(error, source);
	}
}

/**
 * Resolve clicked text content to a source location.
 * Uses text content matching - works with standard WASM without debug info.
 *
 * @param textContent The text content from the clicked element
 * @returns The source location (file, line, column) or undefined if not found
 */
export async function resolveSourceLocationByText(
	textContent: string
): Promise<SourceLocation | undefined> {
	if (!currentSourceCode || !textContent) {
		return undefined;
	}

	try {
		// Normalize text for matching
		const normalizedText = textContent.trim().replace(/\s+/g, ' ');

		if (!normalizedText || normalizedText.length < 2) {
			return undefined;
		}

		// Strategy 1: Direct text match in source lines
		for (let i = 0; i < currentSourceLines.length; i++) {
			const line = currentSourceLines[i];
			const colIdx = line.indexOf(normalizedText);
			if (colIdx !== -1) {
				return { filepath: '/main.typ', line: i + 1, column: colIdx + 1 };
			}
		}

		// Strategy 2: Try partial match for longer text (first few words)
		if (normalizedText.length > 20) {
			const firstWords = normalizedText.split(/\s+/).slice(0, 5).join(' ');
			if (firstWords.length >= 10) {
				for (let i = 0; i < currentSourceLines.length; i++) {
					const line = currentSourceLines[i];
					if (line.includes(firstWords)) {
						return { filepath: '/main.typ', line: i + 1, column: line.indexOf(firstWords) + 1 };
					}
				}
			}
		}

		// Strategy 3: Fuzzy match - find the best matching line
		const words = normalizedText.split(/\s+/).filter((w) => w.length > 2);
		if (words.length > 0) {
			let bestLine = -1;
			let bestScore = 0;

			for (let i = 0; i < currentSourceLines.length; i++) {
				const line = currentSourceLines[i];
				if (!line.trim() || line.trim().startsWith('//')) {
					continue;
				}

				let score = 0;
				for (const word of words) {
					if (line.includes(word)) {
						score += word.length;
					}
				}

				if (score > bestScore) {
					bestScore = score;
					bestLine = i;
				}
			}

			if (bestLine >= 0 && bestScore >= Math.min(normalizedText.length / 3, 10)) {
				return { filepath: '/main.typ', line: bestLine + 1, column: 1 };
			}
		}

		return undefined;
	} catch (error) {
		return undefined;
	}
}

/**
 * Legacy function - redirects to text-based resolution
 * @deprecated Use resolveSourceLocationByText instead
 */
export async function resolveSourceLocation(
	_elementPath: number[]
): Promise<SourceLocation | undefined> {
	return undefined;
}

/**
 * Find document positions (not implemented in text-based approach)
 */
export async function findDocumentPositions(
	_source: string,
	_line: number,
	_column: number
): Promise<DocumentPosition[]> {
	return [];
}

/**
 * Check if bidirectional sync is ready
 */
export function isRendererReady(): boolean {
	return currentSourceCode.length > 0;
}

/**
 * Dispose of the bidirectional sync state
 */
export function disposeRenderer(): void {
	currentSourceCode = '';
	currentSourceLines = [];
}

