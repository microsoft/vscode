/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, IValueWithChangeEvent } from 'vs/base/common/event';
import { IDiffEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ITextModel } from 'vs/editor/common/model';
import { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';

export interface IMultiDiffEditorModel {
	readonly documents: IValueWithChangeEvent<readonly LazyPromise<IDocumentDiffItem>[]>;
	readonly contextKeys?: Record<string, ContextKeyValue>;
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
	/**
	 * undefined if the file was created.
	 */
	readonly original: ITextModel | undefined;

	/**
	 * undefined if the file was deleted.
	 */
	readonly modified: ITextModel | undefined;
	readonly options?: IDiffEditorOptions;
	readonly onOptionsDidChange?: Event<void>;
}
