/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./leftRightWidget';
import Builder = require('vs/base/browser/builder');
import Lifecycle = require('vs/base/common/lifecycle');

var $ = Builder.$;

export interface IRenderer {
	(container:HTMLElement): Lifecycle.IDisposable;
}

export class LeftRightWidget {

	private $el: Builder.Builder;
	private toDispose: Lifecycle.IDisposable[];

	constructor (container:Builder.Builder, renderLeftFn:IRenderer, renderRightFn:IRenderer);
	constructor (container:HTMLElement, renderLeftFn:IRenderer, renderRightFn:IRenderer);
	constructor (container:any, renderLeftFn:IRenderer, renderRightFn:IRenderer) {
		this.$el = $('.monaco-left-right-widget').appendTo(container);

		this.toDispose = [
			renderRightFn($('.right').appendTo(this.$el).getHTMLElement()),
			renderLeftFn($('span.left').appendTo(this.$el).getHTMLElement())
		].filter(x => !!x);
	}

	public dispose() {
		if (this.$el) {
			this.$el.destroy();
			this.$el = null;
		}
	}
}
