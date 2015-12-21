/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IMarkerService, IResourceMarker, IMarkerData} from 'vs/platform/markers/common/markers';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import * as vscode from 'vscode';

class DiagnosticCollection implements vscode.DiagnosticCollection {

	private static _maxDiagnosticsPerFile: number = 250;

	private _name: string;
	private _proxy: MainThreadDiagnostics;
	private _isDisposed: boolean;

	constructor(name: string, proxy: MainThreadDiagnostics) {
		this._name = name;
		this._proxy = proxy;
	}

	dispose(): void {
		if (!this._isDisposed) {
			this._proxy._changeAll(this.name, undefined).then(() => {
				this._proxy = undefined;
				this._isDisposed = true;
			});
		}
	}

	get name(): string {
		this._checkDisposed();
		return this._name;
	}

	set(uri: vscode.Uri, diagnostics: vscode.Diagnostic[]): void;
	set(entries: [vscode.Uri, vscode.Diagnostic[]][]): void;
	set(first: vscode.Uri | [vscode.Uri, vscode.Diagnostic[]][], diagnostics?: vscode.Diagnostic[]) {
		this._checkDisposed();

		if (first instanceof URI) {
			// change markers of resource only (max 500)

			let data: IMarkerData[];
			if (diagnostics) {
				data = [];
				let len = diagnostics.length;
				if (len > DiagnosticCollection._maxDiagnosticsPerFile) {
					console.warn('diagnostics for %s will be capped to %d (actually is %d)', first.toString(), DiagnosticCollection._maxDiagnosticsPerFile, len);
					len = DiagnosticCollection._maxDiagnosticsPerFile;
				}

				for (let i = 0; i < len; i++) {
					data.push(DiagnosticCollection._toMarkerData(diagnostics[i]));
				}
			}

			// set or reset for this resource
			return this._proxy._changeOne(this.name, first, data);

		} else {
			// change all marker of owner
			let entries = <[vscode.Uri, vscode.Diagnostic[]][]>first;
			let data: IResourceMarker[];
			if (entries) {
				let total = 0;
				data = [];
				for (let entry of entries) {
					let [uri, diagnostics] = entry;
					if (diagnostics) {
						let len = diagnostics.length;
						if (len > DiagnosticCollection._maxDiagnosticsPerFile) {
							console.warn('diagnostics for %s will be capped to %d (actually is %d)', uri.toString(), DiagnosticCollection._maxDiagnosticsPerFile, len);
							len = DiagnosticCollection._maxDiagnosticsPerFile;
						}

						for (let i = 0; i < len; i++) {
							data.push({
								resource: <URI>uri,
								marker: DiagnosticCollection._toMarkerData(diagnostics[i])
							});
						}

						total += len;
						if (total > 10 * DiagnosticCollection._maxDiagnosticsPerFile) {
							console.warn('too many diagnostics will cap to %d', 10 * DiagnosticCollection._maxDiagnosticsPerFile);
							break;
						}
					}
				}
			}

			// set or reset all
			this._proxy._changeAll(this.name, data);
		}
	}

	delete(uri: vscode.Uri): void {
		return this.set(uri, undefined);
	}

	clear(): void {
		return this.set(undefined);
	}

	private _checkDisposed() {
		if (this._isDisposed) {
			throw new Error('illegal state - object is disposed');
		}
	}

	private static _toMarkerData(diagnostic: vscode.Diagnostic): IMarkerData {

		let range = diagnostic.range;

		return <IMarkerData>{
			startLineNumber: range.start.line + 1,
			startColumn: range.start.character + 1,
			endLineNumber: range.end.line + 1,
			endColumn: range.end.character + 1,
			message: diagnostic.message,
			source: diagnostic.source,
			severity: DiagnosticCollection._convertDiagnosticsSeverity(diagnostic.severity),
			code: String(diagnostic.code)
		}
	}

	private static _convertDiagnosticsSeverity(severity: number): Severity {
		switch (severity) {
			case 0: return Severity.Error;
			case 1: return Severity.Warning;
			case 2: return Severity.Info;
			case 3: return Severity.Ignore;
			default: return Severity.Error;
		}
	}
}

export class ExtHostDiagnostics {

	private static _idPool: number = 0;
	private _proxy: MainThreadDiagnostics;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadDiagnostics);
	}

	createDiagnosticCollection(name: string): vscode.DiagnosticCollection {
		if (!name) {
			name = '_generated_diagnostic_collection_name_#' + ExtHostDiagnostics._idPool++;
		}
		return new DiagnosticCollection(name, this._proxy);
	}
}

@Remotable.MainContext('MainThreadDiagnostics')
export class MainThreadDiagnostics {

	private _markerService: IMarkerService;

	constructor(@IMarkerService markerService: IMarkerService) {
		this._markerService = markerService;
	}

	_changeOne(owner: string, resource: URI, markers: IMarkerData[]): TPromise<any> {
		this._markerService.changeOne(owner, resource, markers);
		return undefined;
	}

	_changeAll(owner: string, data: IResourceMarker[]): TPromise<any> {
		this._markerService.changeAll(owner, data);
		return undefined;
	}
}
