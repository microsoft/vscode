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

export class FileDecorationsService implements IFileDecorationsService {

	readonly _serviceBrand;

	private readonly _onDidChangeFileDecoration = new Emitter<URI>();
	private readonly _types = new Map<DecorationType, TernarySearchTree<IFileDecoration>>();

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
				let tree = outer._types.get(type);
				if (tree) {
					tree.forEach(([key]) => outer._onDidChangeFileDecoration.fire(URI.parse(key)));
					outer._types.delete(type);
				}
			}
		};
		this._types.set(type, TernarySearchTree.forPaths<IFileDecoration>());
		return type;
	}

	setFileDecoration(type: DecorationType, target: URI, data: IFileDecorationData): void {
		this._types.get(type).set(target.toString(), { type, ...data });
		this._onDidChangeFileDecoration.fire(target);
	}

	unsetFileDecoration(type: DecorationType, target: URI): void {
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
			return top !== undefined && top.severity === Severity.Error;
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
					newTree.forEach(([, deco]) => done = done || callback(deco));
				}
			} else {
				let deco = tree.get(key);
				done = done || deco && callback(deco);
			}
		});
	}

	private static _compareFileDecorationsBySeverity(a: IFileDecoration, b: IFileDecoration): number {
		return Severity.compare(a.severity, b.severity);
	}
}
