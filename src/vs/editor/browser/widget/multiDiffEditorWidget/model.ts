/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';

export interface IMultiDiffEditorModel {
	readonly documents: LazyPromise<IDocumentDiffItem>[];
	readonly onDidChange: Event<void>;
}

export interface LazyPromise<T> {
	request(): Promise<T>;
	readonly value: T | undefined;
	readonly onHasValueDidChange: Event<void>;
}

export class ConstLazyPromise<T> implements LazyPromise<T> {
	public readonly onHasValueDidChange = Event.None;

	constructor(
		private readonly _value: T
	) { }

	public request(): Promise<T> {
		return Promise.resolve(this._value);
	}

	public get value(): T {
		return this._value;
	}
}

export interface IDocumentDiffItem {
	readonly title: string;
	readonly original: ITextModel | undefined; // undefined if the file was created.
	readonly modified: ITextModel | undefined; // undefined if the file was deleted.
	readonly options?: IDiffEditorOptions;
	readonly onOptionsDidChange?: Event<void>;
}
