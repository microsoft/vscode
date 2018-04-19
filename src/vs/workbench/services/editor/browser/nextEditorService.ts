/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INextEditorService } from 'vs/workbench/services/editor/common/nextEditorService';
import { NextEditorPart } from 'vs/workbench/browser/parts/editor2/nextEditorPart';
// import { ResourceMap } from 'vs/base/common/map';
// import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
// import { IFileEditorInput, IFileInputFactory, IEditorInputFactoryRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
// import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
// import { Registry } from 'vs/platform/registry/common/platform';

// type ICachedEditorInput = ResourceEditorInput | IFileEditorInput | DataUriEditorInput;

export class NextEditorService implements INextEditorService {

	public _serviceBrand: any;

	// private static CACHE: ResourceMap<ICachedEditorInput> = new ResourceMap<ICachedEditorInput>();
	// private fileInputFactory: IFileInputFactory;

	constructor(
		/* private */ editorPart: NextEditorPart
	) {
		// this.fileInputFactory = Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).getFileInputFactory();
	}
}