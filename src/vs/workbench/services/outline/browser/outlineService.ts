/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { IOutline, IOutlineCreator, IOutlineService, OutlineTarget } from 'vs/workbench/services/outline/browser/outline';
import { Event, Emitter } from 'vs/base/common/event';

class OutlineService implements IOutlineService {

	declare _serviceBrand: undefined;

	private readonly _factories = new LinkedList<IOutlineCreator<any, any>>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	canCreateOutline(pane: IEditorPane): boolean {
		for (let factory of this._factories) {
			if (factory.matches(pane)) {
				return true;
			}
		}
		return false;
	}

	async createOutline(pane: IEditorPane, target: OutlineTarget, token: CancellationToken): Promise<IOutline<any> | undefined> {
		for (let factory of this._factories) {
			if (factory.matches(pane)) {
				return await factory.createOutline(pane, target, token);
			}
		}
		return undefined;
	}

	registerOutlineCreator(creator: IOutlineCreator<any, any>): IDisposable {
		const rm = this._factories.push(creator);
		this._onDidChange.fire();
		return toDisposable(() => {
			rm();
			this._onDidChange.fire();
		});
	}
}


registerSingleton(IOutlineService, OutlineService, true);
