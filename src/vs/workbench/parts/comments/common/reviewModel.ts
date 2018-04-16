/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter, Event } from 'vs/base/common/event';

export enum ReviewStyle {
	Complete,
	Inline,
	Gutter
}

export class ReviewModel {
	private _style: ReviewStyle;
	public get style(): ReviewStyle { return this._style; }
	private _onDidChangeStyle = new Emitter<ReviewStyle>();
	public get onDidChangeStyle(): Event<ReviewStyle> { return this._onDidChangeStyle.event; }

	constructor() {
		this._style = ReviewStyle.Inline;
	}

	setStyle(style: ReviewStyle) {
		this._style = style;
		this._onDidChangeStyle.fire(this._style);
	}
}