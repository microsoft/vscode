/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import mime = require('vs/base/common/mime');
import wbeditorcommon = require('vs/workbench/common/editor');
import strinput = require('vs/workbench/browser/parts/editor/stringEditorInput');
import uri from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class DebugStringEditorInput extends strinput.StringEditorInput {

	constructor(
		name: string,
		private resourceUrl: uri,
		description: string,
		value: string,
		mimeType: string,
		singleton: boolean,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(name, description, value, mimeType || mime.MIME_TEXT, singleton, instantiationService);
	}

	public getResource(): uri {
		return this.resourceUrl;
	}
}

export class ReplEditorInput extends wbeditorcommon.EditorInput {

	private static instance: ReplEditorInput;
	public static ID = 'workbench.editors.replEditorInput';
	public static NAME = 'Debug Console';

	public static getInstance(): ReplEditorInput {
		if (!ReplEditorInput.instance) {
			ReplEditorInput.instance = new ReplEditorInput();
		}

		return ReplEditorInput.instance;
	}

	public getId(): string {
		return ReplEditorInput.ID;
	}

	public getName(): string {
		return ReplEditorInput.NAME;
	}

	public resolve(refresh?: boolean): TPromise<wbeditorcommon.EditorModel> {
		return TPromise.as(null);
	}
}
