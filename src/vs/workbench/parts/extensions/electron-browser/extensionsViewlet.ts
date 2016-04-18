/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensions-viewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, emmet as $ } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class ExtensionsViewlet extends Viewlet {

	static ID: string = 'workbench.viewlet.extensions';

	private toDispose: IDisposable[];
	private root: HTMLElement;

	constructor(@ITelemetryService telemetryService: ITelemetryService) {
		super(ExtensionsViewlet.ID, telemetryService);
		this.toDispose = [];
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.root = append(parent.getHTMLElement(), $('.extensions-viewlet'));

		return TPromise.as(null);
	}

	setVisible(visible:boolean): TPromise<void> {
		return super.setVisible(visible);
	}

	focus(): void {
		super.focus();
	}

	layout(dimension: Dimension):void {
		// noop
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}
