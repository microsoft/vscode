/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IEditorPane } from 'vs/workbench/common/editor';
import { IOutline, IOutlineCreator, IOutlineService } from 'vs/workbench/services/outline/common/outline';


class OutlineService implements IOutlineService {

	declare _serviceBrand: undefined;

	private readonly _factories = new LinkedList<IOutlineCreator<any, any>>();

	async createOutline(pane: IEditorPane): Promise<IOutline<any> | undefined> {
		for (let factory of this._factories) {
			if (factory.matches(pane)) {
				return await factory.createOutline(pane);
			}
		}
		return undefined;
	}

	registerOutlineCreator(creator: IOutlineCreator<any, any>): IDisposable {
		const rm = this._factories.push(creator);
		return toDisposable(rm);
	}
}


registerSingleton(IOutlineService, OutlineService, true);
