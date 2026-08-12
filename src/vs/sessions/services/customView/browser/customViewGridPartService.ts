/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICustomViewDescriptor } from './customView.js';

export const ICustomViewGridPartService = createDecorator<ICustomViewGridPartService>('customViewGridPartService');

/**
 * Renders the custom view grid part. The part is a passive renderer: the
 * Agents workbench drives it from `ICustomViewService.activeCustomView` so the
 * view is rendered, made visible and focused in one ordered step.
 */
export interface ICustomViewGridPartService {

	readonly _serviceBrand: undefined;

	/** Renders the given custom view, replacing (and disposing) the previous one. */
	setView(descriptor: ICustomViewDescriptor | undefined): void;

	/** Moves keyboard focus into the rendered custom view. */
	focusActiveView(): void;
}
