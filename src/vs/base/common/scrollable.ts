/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Lifecycle = require('vs/base/common/lifecycle');

export interface IScrollable {
	getScrollHeight():number;
	getScrollWidth():number;
	getScrollLeft():number;
	setScrollLeft(scrollLeft:number);
	getScrollTop():number;
	setScrollTop(scrollTop:number);
	addScrollListener(callback:()=>void): Lifecycle.IDisposable;
}
