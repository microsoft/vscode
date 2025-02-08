/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RenderingContext } from './renderingContext.js';
import { ViewEventHandler } from '../../common/viewEventHandler.js';

export abstract class DynamicViewOverlay extends ViewEventHandler {

	public abstract prepareRender(ctx: RenderingContext): void;

	public abstract render(startLineNumber: number, lineNumber: number): string;

}
