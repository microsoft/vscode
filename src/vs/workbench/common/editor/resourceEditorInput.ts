/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput, ITextEditorModel } from 'vs/workbench/common/editor';
import { URI } from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.resourceEditorInput';

	private modelReference: Promise<IReference<ITextEditorModel>>;
	private resource: URI;
	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IHashService private readonly hashService: IHashService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	getResource(): URI {
		return this.resource;
	}

	getTypeId(): string {
		return ResourceEditorInput.ID;
	}

	getName(): string {
		return this.name;
	}

	setName(name: string): void {
		if (this.name !== name) {
			this.name = name;
			this._onDidChangeLabel.fire();
		}
	}

	getDescription(): string {
		return this.description;
	}

	setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;
			this._onDidChangeLabel.fire();
		}
	}

	getTelemetryDescriptor(): object {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.resource, path => this.hashService.createSHA1(path));

		/* __GDPR__FRAGMENT__
			"EditorTelemetryDescriptor" : {
				"resource": { "${inline}": [ "${URIDescriptor}" ] }
			}
		*/
		return descriptor;
	}

	resolve(): Promise<ITextEditorModel> {
		if (!this.modelReference) {
			this.modelReference = this.textModelResolverService.createModelReference(this.resource);
		}

		return this.modelReference.then(ref => {
			const model = ref.object;

			if (!(model instanceof ResourceEditorModel)) {
				ref.dispose();
				this.modelReference = null;

				return Promise.reject(new Error(`Unexpected model for ResourceInput: ${this.resource}`));
			}

			return model;
		});
	}

	matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof ResourceEditorInput) {
			let otherResourceEditorInput = <ResourceEditorInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	dispose(): void {
		if (this.modelReference) {
			this.modelReference.then(ref => ref.dispose());
			this.modelReference = null;
		}

		super.dispose();
	}
}
