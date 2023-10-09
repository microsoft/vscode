/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { autorun, autorunWithStore } from 'vs/base/common/observable';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { MultiDiffEditorWidgetImpl } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidget';

export class MultiDiffEditorWidget extends Disposable {
	constructor(private readonly _element: HTMLElement) {
		super();

		this._register(autorunWithStore((reader, store) => {
			store.add(new (readHotReloadableExport(MultiDiffEditorWidgetImpl, reader))(_element));
		}));
	}
}
