/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {IFrameEditorInput} from 'vs/workbench/browser/parts/editor/iframeEditorInput';

/**
 * An editor input derived from IFrameEditorInput that is associated to a resource. This is an "abstract" class.
 * Subclasses should override #createNew() and provide an identifier and name for the editor input.
 */
export abstract class DerivedFrameEditorInput extends IFrameEditorInput {
	private resource: URI;

	constructor(resource: URI, name: string, description?: string) {
		super(name, description, null);

		this.resource = resource;
	}

	public abstract createNew(resource: URI): DerivedFrameEditorInput;

	/**
	 * This is the resource that this input is derived from.
	 */
	public getResource(): URI {
		return this.resource;
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof DerivedFrameEditorInput) {
			let otherDerivedFrameEditorInput = <DerivedFrameEditorInput>otherInput;

			// Otherwise compare by resource
			return otherDerivedFrameEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}
}