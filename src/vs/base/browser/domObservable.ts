/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet2 } from 'vs/base/browser/dom';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { autorun, IObservable } from 'vs/base/common/observable';

export function createStyleSheetFromObservable(css: IObservable<string>): IDisposable {
	const store = new DisposableStore();
	const w = store.add(createStyleSheet2());
	store.add(autorun(reader => {
		w.setStyle(css.read(reader));
	}));
	return store;
}
