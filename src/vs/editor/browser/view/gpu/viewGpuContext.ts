/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFastDomNode, type FastDomNode } from 'vs/base/browser/fastDomNode';

export class ViewGpuContext {
	readonly canvas: FastDomNode<HTMLCanvasElement>;

	constructor() {
		this.canvas = createFastDomNode(document.createElement('canvas'));
		this.canvas.setClassName('editorCanvas');
	}
}
