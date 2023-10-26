/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICustomTabLabelService, TabLabelInput } from 'vs/workbench/services/label/common/customTabLabels';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { generateTabId } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';

export class CustomTabLabelService extends Disposable implements ICustomTabLabelService {
	readonly _serviceBrand: undefined;

	private map = new Map<string, TabLabelInput>();

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
	}

	setCustomTabLabelForEditor(editor: EditorInput, groupId: number, input: TabLabelInput | undefined) {
		const tabId = generateTabId(editor, groupId);

		if (input === undefined) {
			this.map.delete(tabId);
			return;
		}

		this.map.set(tabId, input);

		this._register(Event.once(editor.onWillDispose)(() => {
			this.map.delete(tabId);
		}));
	}

	getCustomTabLabelForEditor(editor: EditorInput, groupId: number) {
		const tabId = generateTabId(editor, groupId);
		return this.map.get(tabId);
	}
}

registerSingleton(ICustomTabLabelService, CustomTabLabelService, InstantiationType.Delayed);
