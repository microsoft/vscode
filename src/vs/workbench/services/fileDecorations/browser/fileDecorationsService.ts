/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { IFileDecorationsService, IFileDecoration, DecorationType, IFileDecorationData } from 'vs/workbench/services/fileDecorations/browser/fileDecorations';
import { TernarySearchTree } from 'vs/base/common/map';
import { mergeSort, isFalsyOrEmpty } from 'vs/base/common/arrays';


export class FileDecorationsService implements IFileDecorationsService {

	readonly _serviceBrand;

	private readonly _onDidChangeFileDecoration = new Emitter<URI>();
	private readonly _types = new Map<DecorationType, TernarySearchTree<IFileDecoration[]>>();

	readonly onDidChangeFileDecoration: Event<URI[]> = debounceEvent<URI, URI[]>(
		this._onDidChangeFileDecoration.event,
		(last, current) => {
			if (!last) {
				last = [];
			}
			last.push(current);
			return last;
		}
	);

	registerDecorationType(label: string): DecorationType {
		const outer = this;
		const type = new class extends DecorationType {
			constructor() {
				super(label);
			}
			dispose() {
				outer._types.delete(type);
			}
		};
		this._types.set(type, TernarySearchTree.forPaths<IFileDecoration[]>());
		return type;
	}

	setFileDecorations(type: DecorationType, target: URI, data: IFileDecorationData[]): void {
		let decorations = mergeSort(data.map(data => ({ type, ...data })), FileDecorationsService._compareFileDecorationsBySeverity);
		this._types.get(type).set(target.toString(), decorations);
		this._onDidChangeFileDecoration.fire(target);
	}

	unsetFileDecorations(type: DecorationType, target: URI): void {
		this._types.get(type).delete(target.toString());
		this._onDidChangeFileDecoration.fire(target);
	}

	getDecorations(uri: URI, includeChildren: boolean): IFileDecoration[] {
		let ret: IFileDecoration[] = [];
		this._someFileDecoration(uri, includeChildren, decoration => {
			ret.push(decoration);
			return false;
		});
		return ret;
	}

	getTopDecoration(uri: URI, includeChildren: boolean): IFileDecoration {
		let top: IFileDecoration;
		this._someFileDecoration(uri, includeChildren, decoration => {
			// top is the most severe one,
			// stop as soon as an error is found
			if (!top || FileDecorationsService._compareFileDecorationsBySeverity(top, decoration) > 0) {
				top = decoration;
			}
			return top.severity === Severity.Error;
		});
		return top;
	}

	private _someFileDecoration(uri: URI, includeChildren: boolean, callback: (a: IFileDecoration) => boolean): void {
		let key = uri.toString();
		let done = false;
		this._types.forEach(tree => {
			if (done) {
				return;
			}
			if (includeChildren) {
				let newTree = tree.findSuperstr(key);
				if (newTree) {
					newTree.forEach(([, data]) => done = done || data.some(callback));
				}
			} else {
				let list = tree.get(key);
				if (!isFalsyOrEmpty(list)) {
					done = list.some(callback);
				}
			}
		});
	}

	private static _compareFileDecorationsBySeverity(a: IFileDecoration, b: IFileDecoration): number {
		return Severity.compare(a.severity, b.severity);
	}
}
