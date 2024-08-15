/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HistoryNavigator2 } from 'vs/base/common/history';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IInteractiveHistoryService = createDecorator<IInteractiveHistoryService>('IInteractiveHistoryService');

export interface IInteractiveHistoryService {
	readonly _serviceBrand: undefined;

	matchesCurrent(uri: URI, value: string): boolean;
	addToHistory(uri: URI, value: string): void;
	getPreviousValue(uri: URI): string | null;
	getNextValue(uri: URI): string | null;
	replaceLast(uri: URI, value: string): void;
	clearHistory(uri: URI): void;
	has(uri: URI): boolean;
}

export class InteractiveHistoryService extends Disposable implements IInteractiveHistoryService {
	declare readonly _serviceBrand: undefined;
	_history: ResourceMap<HistoryNavigator2<string>>;

	constructor() {
		super();

		this._history = new ResourceMap<HistoryNavigator2<string>>();
	}

	matchesCurrent(uri: URI, value: string): boolean {
		const history = this._history.get(uri);
		if (!history) {
			return false;
		}

		return history.current() === value;
	}

	addToHistory(uri: URI, value: string): void {
		const history = this._history.get(uri);
		if (!history) {
			this._history.set(uri, new HistoryNavigator2<string>([value], 50));
			return;
		}

		history.resetCursor();
		history.add(value);
	}

	getPreviousValue(uri: URI): string | null {
		const history = this._history.get(uri);
		return history?.previous() ?? null;
	}

	getNextValue(uri: URI): string | null {
		const history = this._history.get(uri);

		return history?.next() ?? null;
	}

	replaceLast(uri: URI, value: string) {
		const history = this._history.get(uri);
		if (!history) {
			this._history.set(uri, new HistoryNavigator2<string>([value], 50));
			return;
		} else {
			history.replaceLast(value);
			history.resetCursor();
		}
	}

	clearHistory(uri: URI) {
		this._history.delete(uri);
	}

	has(uri: URI) {
		return this._history.has(uri) ? true : false;
	}

}
