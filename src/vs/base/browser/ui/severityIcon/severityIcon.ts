/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import * as DOM from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';

export class SeverityIcon extends Disposable {

	readonly element: HTMLElement;

	constructor() {
		super();
		this.element = DOM.$('');
	}

	set severity(severity: Severity) {
		this.element.className = this.iconClassNameFor(severity);
	}

	style({ color }: {
		color: Color
	}): void {
		this.element.style.color = color.toString();
	}

	private iconClassNameFor(severity: Severity): string {
		switch (severity) {
			case Severity.Ignore:
				return 'octicon octicon-info';
			case Severity.Info:
				return 'octicon octicon-info';
			case Severity.Warning:
				return 'octicon octicon-warning';
			case Severity.Error:
				return 'octicon octicon-error';
		}
		return '';
	}

}