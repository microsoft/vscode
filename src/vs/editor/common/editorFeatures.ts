/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature } from 'vs/platform/instantiation/common/instantiation';

/**
 * A feature that will be loaded when the first code editor is constructed and disposed when the system shuts down.
 */
export interface IEditorFeature {
	// Marker Interface
}

export type EditorFeatureCtor = IConstructorSignature<IEditorFeature>;

const editorFeatures: EditorFeatureCtor[] = [];

/**
 * Registers an editor feature. Editor features will be instantiated only once, as soon as
 * the first code editor is instantiated.
 */
export function registerEditorFeature<Services extends BrandedService[]>(ctor: { new(...services: Services): IEditorFeature }): void {
	editorFeatures.push(ctor as EditorFeatureCtor);
}

export function getEditorFeatures(): Iterable<EditorFeatureCtor> {
	return editorFeatures.slice(0);
}
