/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from 'vs/base/common/lazy';
import { URI, UriComponents } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput } from 'vs/workbench/common/editor';
import { CustomEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewEditorInputFactory } from 'vs/workbench/contrib/webview/browser/webviewEditorInputFactory';
import { IWebviewWorkbenchService, WebviewInputOptions } from 'vs/workbench/contrib/webview/browser/webviewWorkbenchService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';

export interface CustomDocumentBackupData {
	readonly viewType: string;
	readonly editorResource: UriComponents;
	readonly extension: undefined | {
		readonly location: UriComponents;
		readonly id: string;
	};

	readonly webview: {
		readonly id: string;
		readonly options: WebviewInputOptions;
		readonly state: any;
	};
}

export class CustomEditorInputFactory extends WebviewEditorInputFactory {

	public static readonly ID = CustomEditorInput.typeId;

	public constructor(
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super(webviewWorkbenchService);
	}

	public serialize(input: CustomEditorInput): string | undefined {
		const data = {
			...this.toJson(input),
			editorResource: input.resource.toJSON(),
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
	): CustomEditorInput {
		const data = this.fromJson(serializedEditorInput);
		const id = data.id || generateUuid();

		const webview = new Lazy(() => {
			const webview = this._webviewService.createWebviewOverlay(id, {
				enableFindWidget: data.options.enableFindWidget,
				retainContextWhenHidden: data.options.retainContextWhenHidden
			}, data.options);

			if (data.extensionLocation && data.extensionId) {
				webview.extension = {
					location: data.extensionLocation,
					id: data.extensionId
				};
			}

			return webview;
		});

		const customInput = this._instantiationService.createInstance(CustomEditorInput, URI.from((data as any).editorResource), data.viewType, id, webview);
		if (typeof data.group === 'number') {
			customInput.updateGroup(data.group);
		}
		return customInput;
	}

	public static createCustomEditorInput(resource: URI, instantiationService: IInstantiationService): Promise<IEditorInput> {
		return instantiationService.invokeFunction(async accessor => {
			const webviewService = accessor.get<IWebviewService>(IWebviewService);
			const backupFileService = accessor.get<IBackupFileService>(IBackupFileService);

			const backup = await backupFileService.resolve(resource);
			if (!backup) {
				throw new Error(`No backup found for custom editor: ${resource}`);
			}

			const backupData = backup.meta as CustomDocumentBackupData;
			const id = backupData.webview.id;

			const webview = new Lazy(() => {
				const webview = webviewService.createWebviewOverlay(id, {
					enableFindWidget: backupData.webview.options.enableFindWidget,
					retainContextWhenHidden: backupData.webview.options.retainContextWhenHidden
				}, backupData.webview.options);

				webview.extension = backupData.extension ? {
					location: URI.revive(backupData.extension.location),
					id: new ExtensionIdentifier(backupData.extension.id),
				} : undefined;

				return webview;
			});

			const editor = instantiationService.createInstance(CustomEditorInput, URI.revive(backupData.editorResource), backupData.viewType, id, webview);
			editor.updateGroup(0);
			return editor;
		});
	}
}
