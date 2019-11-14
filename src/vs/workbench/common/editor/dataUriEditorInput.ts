/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';
import { DataUri, basename } from 'vs/base/common/resources';

/**
 * An editor input to present data URIs in a binary editor. Data URIs have the form of:
 * data:[mime type];[meta data <key=value>;...];base64,[base64 encoded value]
 */
export class DataUriEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.dataUriEditorInput';

	private readonly name: string;
	private readonly description: string | undefined;

	constructor(
		name: string | undefined,
		description: string | undefined,
		private readonly resource: URI,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		if (!name || !description) {
			const metadata = DataUri.parseMetaData(this.resource);

			if (!name) {
				name = metadata.get(DataUri.META_DATA_LABEL) || basename(resource);
			}

			if (!description) {
				description = metadata.get(DataUri.META_DATA_DESCRIPTION);
			}
		}

		this.name = name;
		this.description = description;
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return DataUriEditorInput.ID;
	}

	getName(): string {
		return this.name;
	}

	getDescription(): string | undefined {
		return this.description;
	}

	resolve(): Promise<BinaryEditorModel> {
		return this.instantiationService.createInstance(BinaryEditorModel, this.resource, this.getName()).load();
	}

	matches(otherInput: unknown): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		// Compare by resource
		if (otherInput instanceof DataUriEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}
