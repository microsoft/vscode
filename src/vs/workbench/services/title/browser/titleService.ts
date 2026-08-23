/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuxiliaryTitlebarPart, ITitlebarPart } from '../../../browser/parts/titlebar/titlebarPart.js';
import { WindowTitle } from '../../../browser/parts/titlebar/windowTitle.js';
import { IEditorGroupsContainer } from '../../editor/common/editorGroupsService.js';

export const ITitleService = createDecorator<ITitleService>('titleService');

export interface ITitleService extends ITitlebarPart {

	readonly _serviceBrand: undefined;

	/**
	 * The shared {@link WindowTitle} instance for the main window. Used by
	 * components that need to render or react to the resolved `window.title`
	 * (template variables, decorations, etc.) without instantiating their own.
	 */
	readonly windowTitle: WindowTitle;

	/**
	 * Get the status bar part that is rooted in the provided container.
	 */
	getPart(container: HTMLElement): ITitlebarPart;

	/**
	 * Creates a new auxililary title bar part in the provided container.
	 */
	createAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer, instantiationService: IInstantiationService): IAuxiliaryTitlebarPart;
}
