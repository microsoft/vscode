/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UnownedDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CustomFileEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { WebviewEditorInputFactory } from 'vs/workbench/contrib/webview/browser/webviewEditorInputFactory';
import { IWebviewWorkbenchService } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { Lazy } from 'vs/base/common/lazy';

export class CustomEditorInputFactory extends WebviewEditorInputFactory {

	public static readonly ID = CustomFileEditorInput.typeId;

	public constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
	) {
		super(webviewWorkbenchService);
	}

	public serialize(input: CustomFileEditorInput): string | undefined {
		const data = {
			...this.toJson(input),
			editorResource: input.getResource().toJSON()
		};

		try {
			return JSON.stringify(data);
		} catch {
			return undefined;
		}
	}

	public deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): CustomFileEditorInput {
		const data = this.fromJson(serializedEditorInput);
		const id = data.id || generateUuid();

		const webview = new Lazy(() => {
			const webviewInput = this.webviewWorkbenchService.reviveWebview(id, data.viewType, data.title, data.iconPath, data.state, data.options, data.extensionLocation && data.extensionId ? {
				location: data.extensionLocation,
				id: data.extensionId
			} : undefined, data.group);
			return new UnownedDisposable(webviewInput.webview);
		});

		const customInput = this._instantiationService.createInstance(CustomFileEditorInput, URI.from((data as any).editorResource), data.viewType, id, webview);
		if (typeof data.group === 'number') {
			customInput.updateGroup(data.group);
		}
		return customInput;
	}
}
