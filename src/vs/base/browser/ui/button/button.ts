/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./button';
import EventEmitter = require('vs/base/common/eventEmitter');
import DOM = require('vs/base/browser/dom');
import Builder = require('vs/base/browser/builder');

var $ = Builder.$;

export class Button extends EventEmitter.EventEmitter {

	private $el: Builder.Builder;

	constructor(container: Builder.Builder);
	constructor(container: HTMLElement);
	constructor(container: any) {
		super();

		this.$el = $('a.monaco-button').href('#').appendTo(container);

		this.$el.on('click', (e) => {
			if (!this.enabled) {
				DOM.EventHelper.stop(e);
				return;
			}

			this.emit('click', e);
		});
	}

	public getElement(): HTMLElement {
		return this.$el.getHTMLElement();
	}

	public set label(value: string) {
		this.$el.text(value);
	}

	public set enabled(value: boolean) {
		if (value) {
			this.$el.removeClass('disabled');
		} else {
			this.$el.addClass('disabled');
		}
	}

	public get enabled() {
		return !this.$el.hasClass('disabled');
	}

	public dispose(): void {
		if (this.$el) {
			this.$el.dispose();
			this.$el = null;
		}

		super.dispose();
	}
}