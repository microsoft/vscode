/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { DataUri } from 'vs/workbench/common/resources';

/**
 * An editor input to present data URIs in a binary editor. Data URIs have the form of:
 * data:[mime type];[meta data <key=value>;...];base64,[base64 encoded value]
 */
export class DataUriEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.dataUriEditorInput';

	private resource: URI;
	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;

		if (!this.name || !this.description) {
			const metadata = DataUri.parseMetaData(this.resource);

			if (!this.name) {
				this.name = metadata.get(DataUri.META_DATA_LABEL);
			}

			if (!this.description) {
				this.description = metadata.get(DataUri.META_DATA_DESCRIPTION);
			}
		}
	}

	public getResource(): URI {
		return this.resource;
	}

	public getTypeId(): string {
		return DataUriEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public resolve(refresh?: boolean): TPromise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load().then(m => m as BinaryEditorModel);
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof DataUriEditorInput) {
			const otherDataUriEditorInput = <DataUriEditorInput>otherInput;

			// Compare by resource
			return otherDataUriEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}
