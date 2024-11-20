/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * This solves the problem that the editor layer cannot depend on the workbench layer.
 *
 * Maybe the multi diff editor widget should be moved to the workbench layer?
 * This would make monaco-editor consumption much more difficult though.
 */
export interface IWorkbenchUIElementFactory {
	createResourceLabel?(element: HTMLElement): IResourceLabel;
}

export interface IResourceLabel extends IDisposable {
	setUri(uri: URI | undefined, options?: IResourceLabelOptions): void;
}

export interface IResourceLabelOptions {
	strikethrough?: boolean;
}
