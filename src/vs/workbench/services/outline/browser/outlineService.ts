/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IEditorPane } from '../../../common/editor.js';
import { IOutline, IOutlineCreator, IOutlineService, OutlineTarget } from './outline.js';
import { Event, Emitter } from '../../../../base/common/event.js';

class OutlineService implements IOutlineService {

	declare _serviceBrand: undefined;

	private readonly _factories = new LinkedList<IOutlineCreator<any, any>>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	canCreateOutline(pane: IEditorPane): boolean {
		for (const factory of this._factories) {
			if (factory.matches(pane)) {
				return true;
			}
		}
		return false;
	}

	async createOutline(pane: IEditorPane, target: OutlineTarget, token: CancellationToken): Promise<IOutline<any> | undefined> {
		for (const factory of this._factories) {
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


registerSingleton(IOutlineService, OutlineService, InstantiationType.Delayed);
