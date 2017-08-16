/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IModel } from 'vs/editor/common/editorCommon';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { MainThreadDocumentContentProvidersShape, ExtHostContext, ExtHostDocumentContentProvidersShape } from '../node/extHost.protocol';
import { ITextSource } from 'vs/editor/common/model/textSource';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';

export class MainThreadDocumentContentProviders extends MainThreadDocumentContentProvidersShape {

	private _resourceContentProvider: { [handle: number]: IDisposable } = Object.create(null);
	private readonly _proxy: ExtHostDocumentContentProvidersShape;

	constructor(
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
		@IThreadService threadService: IThreadService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostDocumentContentProviders);
	}

	$registerTextContentProvider(handle: number, scheme: string): void {
		this._resourceContentProvider[handle] = this._textModelResolverService.registerTextModelContentProvider(scheme, {
			provideTextContent: (uri: URI): TPromise<IModel> => {
				return this._proxy.$provideTextDocumentContent(handle, uri).then(value => {
					if (typeof value === 'string') {
						const firstLineText = value.substr(0, 1 + value.search(/\r?\n/));
						const mode = this._modeService.getOrCreateModeByFilenameOrFirstLine(uri.fsPath, firstLineText);
						return this._modelService.createModel(value, mode, uri);
					}
					return undefined;
				});
			}
		});
	}

	$unregisterTextContentProvider(handle: number): void {
		const registration = this._resourceContentProvider[handle];
		if (registration) {
			registration.dispose();
			delete this._resourceContentProvider[handle];
		}
	}

	$onVirtualDocumentChange(uri: URI, value: ITextSource): void {
		const model = this._modelService.getModel(uri);
		if (!model) {
			return;
		}

		const raw: ITextSource = {
			lines: value.lines,
			length: value.length,
			BOM: value.BOM,
			EOL: value.EOL,
			containsRTL: value.containsRTL,
			isBasicASCII: value.isBasicASCII,
		};

		if (!model.equals(raw)) {
			model.setValueFromTextSource(raw);
		}
	}
}
