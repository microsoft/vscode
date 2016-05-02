/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext, IRestrictedRenderingContext} from 'vs/editor/common/view/renderingContext';

export abstract class ViewPart extends ViewEventHandler {

	_context:ViewContext;

	constructor(context:ViewContext) {
		super();
		this._context = context;
		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
	}

	public abstract prepareRender(ctx:IRenderingContext): void;
	public abstract render(ctx:IRestrictedRenderingContext): void;
}
