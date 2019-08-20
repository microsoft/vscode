/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IMarkerData, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { URI, UriComponents } from 'vs/base/common/uri';
import * as vscode from 'vscode';
import { MainContext, MainThreadDiagnosticsShape, ExtHostDiagnosticsShape, IMainContext } from './extHost.protocol';
import { DiagnosticSeverity } from './extHostTypes';
import * as converter from './extHostTypeConverters';
import { mergeSort } from 'vs/base/common/arrays';
import { Event, Emitter } from 'vs/base/common/event';
import { keys } from 'vs/base/common/map';

export class DiagnosticCollection implements vscode.DiagnosticCollection {

	private readonly _name: string;
	private readonly _owner: string;
	private readonly _maxDiagnosticsPerFile: number;
	private readonly _onDidChangeDiagnostics: Emitter<(vscode.Uri | string)[]>;
	private readonly _proxy: MainThreadDiagnosticsShape | undefined;

	private _isDisposed = false;
	private _data = new Map<string, vscode.Diagnostic[]>();

	constructor(name: string, owner: string, maxDiagnosticsPerFile: number, proxy: MainThreadDiagnosticsShape | undefined, onDidChangeDiagnostics: Emitter<(vscode.Uri | string)[]>) {
		this._name = name;
		this._owner = owner;
		this._maxDiagnosticsPerFile = maxDiagnosticsPerFile;
		this._proxy = proxy;
		this._onDidChangeDiagnostics = onDidChangeDiagnostics;
	}

	dispose(): void {
		if (!this._isDisposed) {
			this._onDidChangeDiagnostics.fire(keys(this._data));
			if (this._proxy) {
				this._proxy.$clear(this._owner);
			}
			this._data = undefined!;
			this._isDisposed = true;
		}
	}

	get name(): string {
		this._checkDisposed();
		return this._name;
	}

	set(uri: vscode.Uri, diagnostics: ReadonlyArray<vscode.Diagnostic>): void;
	set(entries: ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>): void;
	set(first: vscode.Uri | ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>, diagnostics?: ReadonlyArray<vscode.Diagnostic>) {

		if (!first) {
			// this set-call is a clear-call
			this.clear();
			return;
		}

		// the actual implementation for #set

		this._checkDisposed();
		let toSync: vscode.Uri[] = [];

		if (first instanceof URI) {

			if (!diagnostics) {
				// remove this entry
				this.delete(first);
				return;
			}

			// update single row
			this._data.set(first.toString(), diagnostics.slice());
			toSync = [first];

		} else if (Array.isArray(first)) {
			// update many rows
			toSync = [];
			let lastUri: vscode.Uri | undefined;

			// ensure stable-sort
			mergeSort(first, DiagnosticCollection._compareIndexedTuplesByUri);

			for (const tuple of first) {
				const [uri, diagnostics] = tuple;
				if (!lastUri || uri.toString() !== lastUri.toString()) {
					if (lastUri && this._data.get(lastUri.toString())!.length === 0) {
						this._data.delete(lastUri.toString());
					}
					lastUri = uri;
					toSync.push(uri);
					this._data.set(uri.toString(), []);
				}

				if (!diagnostics) {
					// [Uri, undefined] means clear this
					const currentDiagnostics = this._data.get(uri.toString());
					if (currentDiagnostics) {
						currentDiagnostics.length = 0;
					}
				} else {
					const currentDiagnostics = this._data.get(uri.toString());
					if (currentDiagnostics) {
						currentDiagnostics.push(...diagnostics);
					}
				}
			}
		}

		// send event for extensions
		this._onDidChangeDiagnostics.fire(toSync);

		// compute change and send to main side
		if (!this._proxy) {
			return;
		}
		const entries: [URI, IMarkerData[]][] = [];
		for (let uri of toSync) {
			let marker: IMarkerData[] = [];
			const diagnostics = this._data.get(uri.toString());
			if (diagnostics) {

				// no more than N diagnostics per file
				if (diagnostics.length > this._maxDiagnosticsPerFile) {
					marker = [];
					const order = [DiagnosticSeverity.Error, DiagnosticSeverity.Warning, DiagnosticSeverity.Information, DiagnosticSeverity.Hint];
					orderLoop: for (let i = 0; i < 4; i++) {
						for (let diagnostic of diagnostics) {
							if (diagnostic.severity === order[i]) {
								const len = marker.push(converter.Diagnostic.from(diagnostic));
								if (len === this._maxDiagnosticsPerFile) {
									break orderLoop;
								}
							}
						}
					}

					// add 'signal' marker for showing omitted errors/warnings
					marker.push({
						severity: MarkerSeverity.Info,
						message: localize({ key: 'limitHit', comment: ['amount of errors/warning skipped due to limits'] }, "Not showing {0} further errors and warnings.", diagnostics.length - this._maxDiagnosticsPerFile),
						startLineNumber: marker[marker.length - 1].startLineNumber,
						startColumn: marker[marker.length - 1].startColumn,
						endLineNumber: marker[marker.length - 1].endLineNumber,
						endColumn: marker[marker.length - 1].endColumn
					});
				} else {
					marker = diagnostics.map(diag => converter.Diagnostic.from(diag));
				}
			}

			entries.push([uri, marker]);
		}
		this._proxy.$changeMany(this._owner, entries);
	}

	delete(uri: vscode.Uri): void {
		this._checkDisposed();
		this._onDidChangeDiagnostics.fire([uri]);
		this._data.delete(uri.toString());
		if (this._proxy) {
			this._proxy.$changeMany(this._owner, [[uri, undefined]]);
		}
	}

	clear(): void {
		this._checkDisposed();
		this._onDidChangeDiagnostics.fire(keys(this._data));
		this._data.clear();
		if (this._proxy) {
			this._proxy.$clear(this._owner);
		}
	}

	forEach(callback: (uri: URI, diagnostics: ReadonlyArray<vscode.Diagnostic>, collection: DiagnosticCollection) => any, thisArg?: any): void {
		this._checkDisposed();
		this._data.forEach((value, key) => {
			const uri = URI.parse(key);
			callback.apply(thisArg, [uri, this.get(uri), this]);
		});
	}

	get(uri: URI): ReadonlyArray<vscode.Diagnostic> {
		this._checkDisposed();
		const result = this._data.get(uri.toString());
		if (Array.isArray(result)) {
			return <ReadonlyArray<vscode.Diagnostic>>Object.freeze(result.slice(0));
		}
		return [];
	}

	has(uri: URI): boolean {
		this._checkDisposed();
		return Array.isArray(this._data.get(uri.toString()));
	}

	private _checkDisposed() {
		if (this._isDisposed) {
			throw new Error('illegal state - object is disposed');
		}
	}

	private static _compareIndexedTuplesByUri(a: [vscode.Uri, vscode.Diagnostic[]], b: [vscode.Uri, vscode.Diagnostic[]]): number {
		if (a[0].toString() < b[0].toString()) {
			return -1;
		} else if (a[0].toString() > b[0].toString()) {
			return 1;
		} else {
			return 0;
		}
	}
}

export class ExtHostDiagnostics implements ExtHostDiagnosticsShape {

	private static _idPool: number = 0;
	private static readonly _maxDiagnosticsPerFile: number = 1000;

	private readonly _proxy: MainThreadDiagnosticsShape;
	private readonly _collections = new Map<string, DiagnosticCollection>();
	private readonly _onDidChangeDiagnostics = new Emitter<(vscode.Uri | string)[]>();

	static _debouncer(last: (vscode.Uri | string)[], current: (vscode.Uri | string)[]): (vscode.Uri | string)[] {
		if (!last) {
			return current;
		} else {
			return last.concat(current);
		}
	}

	static _mapper(last: (vscode.Uri | string)[]): { uris: vscode.Uri[] } {
		const uris: vscode.Uri[] = [];
		const map = new Set<string>();
		for (const uri of last) {
			if (typeof uri === 'string') {
				if (!map.has(uri)) {
					map.add(uri);
					uris.push(URI.parse(uri));
				}
			} else {
				if (!map.has(uri.toString())) {
					map.add(uri.toString());
					uris.push(uri);
				}
			}
		}
		Object.freeze(uris);
		return { uris };
	}

	readonly onDidChangeDiagnostics: Event<vscode.DiagnosticChangeEvent> = Event.map(Event.debounce(this._onDidChangeDiagnostics.event, ExtHostDiagnostics._debouncer, 50), ExtHostDiagnostics._mapper);

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadDiagnostics);
	}

	createDiagnosticCollection(name?: string): vscode.DiagnosticCollection {
		let { _collections, _proxy, _onDidChangeDiagnostics } = this;
		let owner: string;
		if (!name) {
			name = '_generated_diagnostic_collection_name_#' + ExtHostDiagnostics._idPool++;
			owner = name;
		} else if (!_collections.has(name)) {
			owner = name;
		} else {
			console.warn(`DiagnosticCollection with name '${name}' does already exist.`);
			do {
				owner = name + ExtHostDiagnostics._idPool++;
			} while (_collections.has(owner));
		}

		const result = new class extends DiagnosticCollection {
			constructor() {
				super(name!, owner, ExtHostDiagnostics._maxDiagnosticsPerFile, _proxy, _onDidChangeDiagnostics);
				_collections.set(owner, this);
			}
			dispose() {
				super.dispose();
				_collections.delete(owner);
			}
		};

		return result;
	}

	getDiagnostics(resource: vscode.Uri): ReadonlyArray<vscode.Diagnostic>;
	getDiagnostics(): ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>;
	getDiagnostics(resource?: vscode.Uri): ReadonlyArray<vscode.Diagnostic> | ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]>;
	getDiagnostics(resource?: vscode.Uri): ReadonlyArray<vscode.Diagnostic> | ReadonlyArray<[vscode.Uri, ReadonlyArray<vscode.Diagnostic>]> {
		if (resource) {
			return this._getDiagnostics(resource);
		} else {
			const index = new Map<string, number>();
			const res: [vscode.Uri, vscode.Diagnostic[]][] = [];
			this._collections.forEach(collection => {
				collection.forEach((uri, diagnostics) => {
					let idx = index.get(uri.toString());
					if (typeof idx === 'undefined') {
						idx = res.length;
						index.set(uri.toString(), idx);
						res.push([uri, []]);
					}
					res[idx][1] = res[idx][1].concat(...diagnostics);
				});
			});
			return res;
		}
	}

	private _getDiagnostics(resource: vscode.Uri): ReadonlyArray<vscode.Diagnostic> {
		let res: vscode.Diagnostic[] = [];
		this._collections.forEach(collection => {
			if (collection.has(resource)) {
				res = res.concat(collection.get(resource));
			}
		});
		return res;
	}

	private _mirrorCollection: vscode.DiagnosticCollection | undefined;

	$acceptMarkersChange(data: [UriComponents, IMarkerData[]][]): void {

		if (!this._mirrorCollection) {
			const name = '_generated_mirror';
			const collection = new DiagnosticCollection(name, name, ExtHostDiagnostics._maxDiagnosticsPerFile, undefined, this._onDidChangeDiagnostics);
			this._collections.set(name, collection);
			this._mirrorCollection = collection;
		}

		for (const [uri, markers] of data) {
			this._mirrorCollection.set(URI.revive(uri), markers.map(converter.Diagnostic.to));
		}
	}
}
