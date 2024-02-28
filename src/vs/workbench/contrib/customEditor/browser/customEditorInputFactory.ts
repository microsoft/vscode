/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isEqual } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { CustomEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { IWebviewService, WebviewContentOptions, WebviewContentPurpose, WebviewExtensionDescription, WebviewOptions } from 'vs/workbench/contrib/webview/browser/webview';
import { DeserializedWebview, restoreWebviewContentOptions, restoreWebviewOptions, reviveWebviewExtensionDescription, SerializedWebview, SerializedWebviewOptions, WebviewEditorInputSerializer } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditorInputSerializer';
import { IWebviewWorkbenchService } from 'vs/workbench/contrib/webviewPanel/browser/webviewWorkbenchService';
import { IWorkingCopyBackupMeta, IWorkingCopyIdentifier } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { IWorkingCopyEditorHandler, IWorkingCopyEditorService } from 'vs/workbench/services/workingCopy/common/workingCopyEditorService';

export interface CustomDocumentBackupData extends IWorkingCopyBackupMeta {
	readonly viewType: string;
	readonly editorResource: UriComponents;
	backupId: string;

	readonly extension: undefined | {
		readonly location: UriComponents;
		readonly id: string;
	};

	readonly webview: {
		readonly origin: string | undefined;
		readonly options: SerializedWebviewOptions;
		readonly state: any;
	};
}

interface SerializedCustomEditor extends SerializedWebview {
	readonly editorResource: UriComponents;
	readonly dirty: boolean;
	readonly backupId?: string;
}

interface DeserializedCustomEditor extends DeserializedWebview {
	readonly editorResource: URI;
	readonly dirty: boolean;
	readonly backupId?: string;
}

export class CustomEditorInputSerializer extends WebviewEditorInputSerializer {

	public static override readonly ID = CustomEditorInput.typeId;

	public constructor(
		@IWebviewWorkbenchService webviewWorkbenchService: IWebviewWorkbenchService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		super(webviewWorkbenchService);
	}

	public override serialize(input: CustomEditorInput): string | undefined {
		const dirty = input.isDirty();
		const data: SerializedCustomEditor = {
			...this.toJson(input),
			editorResource: input.resource.toJSON(),
			dirty,
			backupId: dirty ? input.backupId : undefined,
		};

		try {
			return JSON.stringify(data);
		} catch {
			return undefined;
		}
	}

	protected override fromJson(data: SerializedCustomEditor): DeserializedCustomEditor {
		return {
			...super.fromJson(data),
			editorResource: URI.from(data.editorResource),
			dirty: data.dirty,
		};
	}

	public override deserialize(
		_instantiationService: IInstantiationService,
		serializedEditorInput: string
	): CustomEditorInput {
		const data = this.fromJson(JSON.parse(serializedEditorInput));

		const webview = reviveWebview(this._webviewService, data);
		const customInput = this._instantiationService.createInstance(CustomEditorInput, { resource: data.editorResource, viewType: data.viewType }, webview, { startsDirty: data.dirty, backupId: data.backupId });
		if (typeof data.group === 'number') {
			customInput.updateGroup(data.group);
		}
		return customInput;
	}
}

function reviveWebview(webviewService: IWebviewService, data: { origin: string | undefined; viewType: string; state: any; webviewOptions: WebviewOptions; contentOptions: WebviewContentOptions; extension?: WebviewExtensionDescription }) {
	const webview = webviewService.createWebviewOverlay({
		providedViewType: data.viewType,
		origin: data.origin,
		title: undefined,
		options: {
			purpose: WebviewContentPurpose.CustomEditor,
			enableFindWidget: data.webviewOptions.enableFindWidget,
			retainContextWhenHidden: data.webviewOptions.retainContextWhenHidden,
		},
		contentOptions: data.contentOptions,
		extension: data.extension,
	});
	webview.state = data.state;
	return webview;
}

export class ComplexCustomWorkingCopyEditorHandler extends Disposable implements IWorkbenchContribution, IWorkingCopyEditorHandler {

	static readonly ID = 'workbench.contrib.complexCustomWorkingCopyEditorHandler';

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkingCopyEditorService _workingCopyEditorService: IWorkingCopyEditorService,
		@IWorkingCopyBackupService private readonly _workingCopyBackupService: IWorkingCopyBackupService,
		@IWebviewService private readonly _webviewService: IWebviewService,
		@ICustomEditorService _customEditorService: ICustomEditorService // DO NOT REMOVE (needed on startup to register overrides properly)
	) {
		super();

		this._register(_workingCopyEditorService.registerHandler(this));
	}

	handles(workingCopy: IWorkingCopyIdentifier): boolean {
		return workingCopy.resource.scheme === Schemas.vscodeCustomEditor;
	}

	isOpen(workingCopy: IWorkingCopyIdentifier, editor: EditorInput): boolean {
		if (!this.handles(workingCopy)) {
			return false;
		}

		if (workingCopy.resource.authority === 'jupyter-notebook-ipynb' && editor instanceof NotebookEditorInput) {
			try {
				const data = JSON.parse(workingCopy.resource.query);
				const workingCopyResource = URI.from(data);
				return isEqual(workingCopyResource, editor.resource);
			} catch {
				return false;
			}
		}

		if (!(editor instanceof CustomEditorInput)) {
			return false;
		}

		if (workingCopy.resource.authority !== editor.viewType.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase()) {
			return false;
		}

		// The working copy stores the uri of the original resource as its query param
		try {
			const data = JSON.parse(workingCopy.resource.query);
			const workingCopyResource = URI.from(data);
			return isEqual(workingCopyResource, editor.resource);
		} catch {
			return false;
		}
	}

	async createEditor(workingCopy: IWorkingCopyIdentifier): Promise<EditorInput> {
		const backup = await this._workingCopyBackupService.resolve<CustomDocumentBackupData>(workingCopy);
		if (!backup?.meta) {
			throw new Error(`No backup found for custom editor: ${workingCopy.resource}`);
		}

		const backupData = backup.meta;
		const extension = reviveWebviewExtensionDescription(backupData.extension?.id, backupData.extension?.location);
		const webview = reviveWebview(this._webviewService, {
			viewType: backupData.viewType,
			origin: backupData.webview.origin,
			webviewOptions: restoreWebviewOptions(backupData.webview.options),
			contentOptions: restoreWebviewContentOptions(backupData.webview.options),
			state: backupData.webview.state,
			extension,
		});

		const editor = this._instantiationService.createInstance(CustomEditorInput, { resource: URI.revive(backupData.editorResource), viewType: backupData.viewType }, webview, { backupId: backupData.backupId });
		editor.updateGroup(0);
		return editor;
	}
}

