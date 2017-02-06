/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, ITextEditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	static ID: string = 'workbench.editors.resourceEditorInput';

	protected promise: TPromise<IReference<ResourceEditorModel>>;
	protected resource: URI;

	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
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

	getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.resource);
		return descriptor;
	}

	resolve(refresh?: boolean): TPromise<ITextEditorModel> {
		if (!this.promise) {
			this.promise = this.textModelResolverService.createModelReference(this.resource);
		}

		return this.promise.then(ref => {
			const model = ref.object;

			if (!(model instanceof ResourceEditorModel)) {
				ref.dispose();
				this.promise = null;
				return TPromise.wrapError(`Unexpected model for ResourceInput: ${this.resource}`); // TODO@Ben eventually also files should be supported, but we guard due to the dangerous dispose of the model in dispose()
			}

			// TODO@Joao this should never happen
			model.onDispose(() => this.dispose());

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
		if (this.promise) {
			this.promise.done(ref => ref.dispose());
			this.promise = null;
		}

		super.dispose();
	}
}
