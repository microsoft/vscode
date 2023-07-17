/* tslint:disable */
/* eslint-disable */
/**
* Resolves a dependency tree using `spec` as the root package.
* @param {string} spec
* @param {any} opts
* @returns {Promise<NodeMaintainer>}
*/
export function resolveSpec(spec: string, opts: any): Promise<NodeMaintainer>;
/**
* Returns a dependency tree using a `package.json` manifest as the root
* package.
* @param {PackageJson} manifest
* @param {any} opts
* @returns {Promise<NodeMaintainer>}
*/
export function resolveManifest(manifest: PackageJson, opts: any): Promise<NodeMaintainer>;
/**
* Resolves a `Packument` for the given package `spec`.
*
* This uses default `Nassun` options and does not cache the result.
* To configure `Nassun`, and/or enable more efficient caching/reuse,
* look at `Package#packument` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<any>}
*/
export function packument(spec: string, opts: any): Promise<any>;
/**
* Resolves a partial ("corgi") version of the `Packument` for the given
* package `spec`.
*
* This uses default `Nassun` options and does not cache the result.
* To configure `Nassun`, and/or enable more efficient caching/reuse,
* look at `Package#packument` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<any>}
*/
export function corgiPackument(spec: string, opts: any): Promise<any>;
/**
* Resolves version metadata from the given package `spec`, using the default
* resolution algorithm.
*
* This uses default `Nassun` options and does not cache the result. To
* configure `Nassun`, and/or enable more efficient caching/reuse, look at
* `Package#metadata` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<any>}
*/
export function metadata(spec: string, opts: any): Promise<any>;
/**
* Resolves a partial ("corgi") version of the version metadata from the
* given package `spec`, using the default resolution algorithm.
*
* This uses default `Nassun` settings and does not cache the result. To
* configure `Nassun`, and/or enable more efficient caching/reuse, look at
* `Package#metadata` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<any>}
*/
export function corgiMetadata(spec: string, opts: any): Promise<any>;
/**
* Resolves a tarball from the given package `spec`, using the
* default resolution algorithm. This tarball will have its data checked
* if the package metadata fetched includes integrity information.
*
* This uses default `Nassun` settings and does not cache the result.
* To configure `Nassun`, and/or enable more efficient caching/reuse,
* look at `Package#tarball` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<ReadableStream>}
*/
export function tarball(spec: string, opts: any): Promise<ReadableStream>;
/**
* Resolves to a `ReadableStream<Entry>` of entries from the given package
* `spec`, using the default resolution algorithm. The source tarball will
* have its data checked if the package metadata fetched includes integrity
* information.
*
* This uses default `Nassun` settings and does not cache the result. To
* configure `Nassun`, and/or enable more efficient caching/reuse, look at
* `Package#entries` instead.
* @param {string} spec
* @param {any} opts
* @returns {Promise<ReadableStream>}
*/
export function entries(spec: string, opts: any): Promise<ReadableStream>;

export interface NodeMaintainerError {
    message: string;
    code?: string;
}

export interface PackageJson {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    bundledDependencies?: string[];
}


export interface NodeMaintainerOptions {
    registry?: string;
    scopedRegistries?: Map<string, string>;
    concurrency?: number;
    kdlLock?: string;
    npmLock?: string;
    defaultTag?: string;
}

export interface NodeMaintainer {
    inner: NodeMaintainer;
}


/**
 * Error type thrown by the Nassun API.
 */
export interface NassunError {
    message: string;
    code?: string;
}

/**
 * An entry extracted from a package tarball.
 */
export interface Entry {
    type: number;
    mtime: number;
    size: number;
    path: string;
    contents: ReadableStream<Uint8Array>;
}


export interface NassunOpts {
    registry?: string;
    scopedRegistries?: Map<string, string>;
}

/**
*/
export class IntoUnderlyingByteSource {
  free(): void;
/**
* @param {any} controller
*/
  start(controller: any): void;
/**
* @param {any} controller
* @returns {Promise<any>}
*/
  pull(controller: any): Promise<any>;
/**
*/
  cancel(): void;
/**
*/
  readonly autoAllocateChunkSize: number;
/**
*/
  readonly type: any;
}
/**
*/
export class IntoUnderlyingSink {
  free(): void;
/**
* @param {any} chunk
* @returns {Promise<any>}
*/
  write(chunk: any): Promise<any>;
/**
* @returns {Promise<any>}
*/
  close(): Promise<any>;
/**
* @param {any} reason
* @returns {Promise<any>}
*/
  abort(reason: any): Promise<any>;
}
/**
*/
export class IntoUnderlyingSource {
  free(): void;
/**
* @param {any} controller
* @returns {Promise<any>}
*/
  pull(controller: any): Promise<any>;
/**
*/
  cancel(): void;
}
/**
* NPM package client used to resolve and fetch package data and metadata.
*/
export class Nassun {
  free(): void;
/**
* Create a new Nassun instance with the given options.
* @param {any} opts
*/
  constructor(opts: any);
/**
* Resolve a spec (e.g. `foo@^1.2.3`, `github:foo/bar`, etc), to a
* `Package` that can be used for further operations.
* @param {string} spec
* @returns {Promise<Package>}
*/
  resolve(spec: string): Promise<Package>;
/**
* Resolves a packument object for the given package `spec`.
* @param {string} spec
* @returns {Promise<any>}
*/
  packument(spec: string): Promise<any>;
/**
* Resolves version metadata from the given package `spec`.
* @param {string} spec
* @returns {Promise<any>}
*/
  metadata(spec: string): Promise<any>;
/**
* Resolves a partial (corgi) version of the packument object for the
* given package `spec`.
* @param {string} spec
* @returns {Promise<any>}
*/
  corgiPackument(spec: string): Promise<any>;
/**
* Resolves a partial (corgi) version of the version metadata from the
* given package `spec`.
* @param {string} spec
* @returns {Promise<any>}
*/
  corgiMetadata(spec: string): Promise<any>;
/**
* Resolves a `ReadableStream<Uint8Array>` tarball from the given package
* `spec`. This tarball will have its data checked if the package
* metadata fetched includes integrity information.
* @param {string} spec
* @returns {Promise<ReadableStream>}
*/
  tarball(spec: string): Promise<ReadableStream>;
/**
* Resolves to a `ReadableStream<Entry>` of entries from the given package
* `spec`, using the default resolution algorithm. The source tarball will
* have its data checked if the package metadata fetched includes integrity
* information.
* @param {string} spec
* @returns {Promise<ReadableStream>}
*/
  entries(spec: string): Promise<ReadableStream>;
}
/**
* An NPM-compatible dependency resolver. NodeMaintainer builds trees of
* package nodes that can be used to generate lockfiles or fetch package
* tarballs, or even extract them to where they would live in `node_modules`.
*/
export class NodeMaintainer {
  free(): void;
/**
* Resolves a dependency tree using `spec` as the root package.
* @param {string} spec
* @param {any} opts
* @returns {Promise<NodeMaintainer>}
*/
  static resolveSpec(spec: string, opts: any): Promise<NodeMaintainer>;
/**
* Returns a dependency tree using a `package.json` manifest as the root
* package.
* @param {PackageJson} manifest
* @param {any} opts
* @returns {Promise<NodeMaintainer>}
*/
  static resolveManifest(manifest: PackageJson, opts: any): Promise<NodeMaintainer>;
/**
* Returns the contents of a package-lock.kdl lockfile for this resolved tree.
* @returns {string}
*/
  toKdl(): string;
/**
* Given a path within node_modules, returns the package that the
* referenced file/directory belongs to.
* @param {string} path
* @returns {Package | undefined}
*/
  packageAtPath(path: string): Package | undefined;
/**
* Concurrently over all packages in the tree, calling `f` on each.
* @param {Function} f
* @returns {Promise<void>}
*/
  forEachPackage(f: Function): Promise<void>;
}
/**
* Options for configuration for various `NodeMaintainer` operations.
*/
export class NodeMaintainerOptions {
  free(): void;
}
/**
* A resolved package. A concrete version has been determined from its
* PackageSpec by the version resolver.
*/
export class Package {
  free(): void;
/**
* The partial (corgi) version of the packument that this `Package` was
* resolved from.
* @returns {Promise<any>}
*/
  corgiPackument(): Promise<any>;
/**
* The partial (corgi) version of the version metadata, aka roughly the
* metadata defined in `package.json`.
* @returns {Promise<any>}
*/
  corgiMetadata(): Promise<any>;
/**
* The full packument that this `Package` was resolved from.
* @returns {Promise<any>}
*/
  packument(): Promise<any>;
/**
* The version metadata, aka roughly the metadata defined in
* `package.json`.
* @returns {Promise<any>}
*/
  metadata(): Promise<any>;
/**
* A `ReadableStream<Uint8Array>` tarball for this package. This tarball
* will have its data checked if the package metadata fetched includes
* integrity information.
* @returns {Promise<ReadableStream>}
*/
  tarball(): Promise<ReadableStream>;
/**
* A `ReadableStream<Entry>` of entries for this package. The source
* tarball will have its data checked if the package metadata fetched
* includes integrity information.
* @returns {Promise<ReadableStream>}
*/
  entries(): Promise<ReadableStream>;
/**
* Original package spec that this `Package` was resolved from.
*/
  readonly from: any;
/**
* Name of the package, as it should be used in the dependency graph.
*/
  readonly name: any;
/**
* The package resolution information that this `Package` was created from.
*/
  readonly resolved: any;
}
/**
* Raw options for [`pipeTo()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeTo).
*/
export class PipeOptions {
  free(): void;
/**
*/
  readonly preventAbort: boolean;
/**
*/
  readonly preventCancel: boolean;
/**
*/
  readonly preventClose: boolean;
/**
*/
  readonly signal: AbortSignal | undefined;
}
/**
*/
export class QueuingStrategy {
  free(): void;
/**
*/
  readonly highWaterMark: number;
}
/**
* Raw options for [`getReader()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader).
*/
export class ReadableStreamGetReaderOptions {
  free(): void;
/**
*/
  readonly mode: any;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_nodemaintaineroptions_free: (a: number) => void;
  readonly __wbg_nodemaintainer_free: (a: number) => void;
  readonly nodemaintainer_resolveSpec: (a: number, b: number, c: number) => number;
  readonly nodemaintainer_resolveManifest: (a: number, b: number) => number;
  readonly nodemaintainer_toKdl: (a: number, b: number) => void;
  readonly nodemaintainer_packageAtPath: (a: number, b: number, c: number) => number;
  readonly nodemaintainer_forEachPackage: (a: number, b: number) => number;
  readonly resolveSpec: (a: number, b: number, c: number) => number;
  readonly resolveManifest: (a: number, b: number) => number;
  readonly packument: (a: number, b: number, c: number) => number;
  readonly corgiPackument: (a: number, b: number, c: number) => number;
  readonly metadata: (a: number, b: number, c: number) => number;
  readonly corgiMetadata: (a: number, b: number, c: number) => number;
  readonly tarball: (a: number, b: number, c: number) => number;
  readonly entries: (a: number, b: number, c: number) => number;
  readonly __wbg_nassun_free: (a: number) => void;
  readonly nassun_new: (a: number, b: number) => void;
  readonly nassun_resolve: (a: number, b: number, c: number) => number;
  readonly nassun_packument: (a: number, b: number, c: number) => number;
  readonly nassun_metadata: (a: number, b: number, c: number) => number;
  readonly nassun_corgiPackument: (a: number, b: number, c: number) => number;
  readonly nassun_corgiMetadata: (a: number, b: number, c: number) => number;
  readonly nassun_tarball: (a: number, b: number, c: number) => number;
  readonly nassun_entries: (a: number, b: number, c: number) => number;
  readonly __wbg_package_free: (a: number) => void;
  readonly package_from: (a: number) => number;
  readonly package_name: (a: number) => number;
  readonly package_resolved: (a: number) => number;
  readonly package_corgiPackument: (a: number) => number;
  readonly package_corgiMetadata: (a: number) => number;
  readonly package_packument: (a: number) => number;
  readonly package_metadata: (a: number) => number;
  readonly package_tarball: (a: number) => number;
  readonly package_entries: (a: number) => number;
  readonly __wbg_readablestreamgetreaderoptions_free: (a: number) => void;
  readonly readablestreamgetreaderoptions_mode: (a: number) => number;
  readonly __wbg_pipeoptions_free: (a: number) => void;
  readonly pipeoptions_preventClose: (a: number) => number;
  readonly pipeoptions_preventCancel: (a: number) => number;
  readonly pipeoptions_preventAbort: (a: number) => number;
  readonly pipeoptions_signal: (a: number) => number;
  readonly __wbg_queuingstrategy_free: (a: number) => void;
  readonly queuingstrategy_highWaterMark: (a: number) => number;
  readonly __wbg_intounderlyingsource_free: (a: number) => void;
  readonly intounderlyingsource_pull: (a: number, b: number) => number;
  readonly intounderlyingsource_cancel: (a: number) => void;
  readonly __wbg_intounderlyingsink_free: (a: number) => void;
  readonly intounderlyingsink_write: (a: number, b: number) => number;
  readonly intounderlyingsink_close: (a: number) => number;
  readonly intounderlyingsink_abort: (a: number, b: number) => number;
  readonly __wbg_intounderlyingbytesource_free: (a: number) => void;
  readonly intounderlyingbytesource_type: (a: number) => number;
  readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
  readonly intounderlyingbytesource_start: (a: number, b: number) => void;
  readonly intounderlyingbytesource_pull: (a: number, b: number) => number;
  readonly intounderlyingbytesource_cancel: (a: number) => void;
  readonly __wbindgen_export_0: (a: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number) => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_export_3: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_4: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_5: (a: number, b: number) => void;
  readonly __wbindgen_export_6: (a: number) => void;
  readonly __wbindgen_export_7: (a: number, b: number, c: number, d: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
