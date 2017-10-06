/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import Event, { Emitter, debounceEvent } from 'vs/base/common/event';
import { IResourceDecorationsService, IResourceDecoration, DecorationType, IResourceDecorationData, IResourceDecorationChangeEvent } from './decorations';
import { TernarySearchTree } from 'vs/base/common/map';

class FileDecorationChangeEvent implements IResourceDecorationChangeEvent {

	private readonly _data = TernarySearchTree.forPaths<boolean>();

	affectsResource(uri: URI): boolean {
		return this._data.get(uri.toString()) || this._data.findSuperstr(uri.toString()) !== undefined;
	}

	static debouncer(last: FileDecorationChangeEvent, current: URI) {
		if (!last) {
			last = new FileDecorationChangeEvent();
		}
		last._data.set(current.toString(), true);
		return last;
	}
}

export class FileDecorationsService implements IResourceDecorationsService {

	readonly _serviceBrand;

	private readonly _onDidChangeFileDecoration = new Emitter<URI>();
	private readonly _types = new Map<DecorationType, TernarySearchTree<IResourceDecoration>>();

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = debounceEvent<URI, FileDecorationChangeEvent>(
		this._onDidChangeFileDecoration.event,
		FileDecorationChangeEvent.debouncer
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
		this._types.set(type, TernarySearchTree.forPaths<IResourceDecoration>());
		return type;
	}

	setDecoration(type: DecorationType, target: URI, data?: IResourceDecorationData): void {
		if (data) {
			this._types.get(type).set(target.toString(), { type, ...data });
		} else {
			this._types.get(type).delete(target.toString());
		}
		this._onDidChangeFileDecoration.fire(target);
	}

	getDecorations(uri: URI, includeChildren: boolean): IResourceDecoration[] {
		let ret: IResourceDecoration[] = [];
		this._someFileDecoration(uri, includeChildren, decoration => {
			ret.push(decoration);
			return false;
		});
		return ret;
	}

	getTopDecoration(uri: URI, includeChildren: boolean): IResourceDecoration {
		let top: IResourceDecoration;
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

	private _someFileDecoration(uri: URI, includeChildren: boolean, callback: (a: IResourceDecoration) => boolean): void {
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

	private static _compareFileDecorationsBySeverity(a: IResourceDecoration, b: IResourceDecoration): number {
		return Severity.compare(a.severity, b.severity);
	}
}
