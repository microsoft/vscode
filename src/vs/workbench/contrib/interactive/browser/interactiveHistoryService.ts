/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { HistoryNavigator2 } from 'vs/base/common/history';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IInteractiveHistoryService = createDecorator<IInteractiveHistoryService>('IInteractiveHistoryService');

export interface IInteractiveHistoryService {
	readonly _serviceBrand: undefined;

	addToHistory(uri: URI, value: string): void;
	getPreviousValue(uri: URI): string | null;
	getNextValue(uri: URI): string | null;
	replaceLast(uri: URI, value: string): void;
	clearHistory(uri: URI): void;
	has(uri: URI): boolean;
}

export class InteractiveHistoryService extends Disposable implements IInteractiveHistoryService {
	declare readonly _serviceBrand: undefined;
	#history: ResourceMap<HistoryNavigator2<string>>;

	constructor() {
		super();

		this.#history = new ResourceMap<HistoryNavigator2<string>>();
	}

	addToHistory(uri: URI, value: string): void {
		if (!this.#history.has(uri)) {
			this.#history.set(uri, new HistoryNavigator2<string>([value], 50));
			return;
		}

		const history = this.#history.get(uri)!;

		history.resetCursor();
		if (history?.current() !== value) {
			history?.add(value);
		}
	}
	getPreviousValue(uri: URI): string | null {
		const history = this.#history.get(uri);
		return history?.previous() ?? null;
	}

	getNextValue(uri: URI): string | null {
		const history = this.#history.get(uri);

		return history?.next() ?? null;
	}

	replaceLast(uri: URI, value: string) {
		if (!this.#history.has(uri)) {
			this.#history.set(uri, new HistoryNavigator2<string>([value], 50));
			return;
		} else {
			const history = this.#history.get(uri);
			if (history?.current() !== value) {
				history?.replaceLast(value);
			}
		}

	}

	clearHistory(uri: URI) {
		this.#history.delete(uri);
	}

	has(uri: URI) {
		return this.#history.has(uri) ? true : false;
	}

}
