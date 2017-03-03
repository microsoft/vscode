/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';

export abstract class DynamicViewOverlay extends ViewEventHandler {

	public abstract dispose(): void;

	public abstract prepareRender(ctx: RenderingContext): void;

	public abstract render(startLineNumber: number, lineNumber: number): string;

}
