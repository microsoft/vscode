/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, $ } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

type RendererType = any;
type RendererTemplateType = any;

class Renderer implements IRenderer<RendererType, RendererTemplateType> {

	templateId: string;

	renderTemplate(container: HTMLElement): RendererTemplateType {

	}

	renderElement(element: RendererType, index: number, templateData: RendererTemplateType): void {

	}

	disposeTemplate(templateData: RendererTemplateType): void {

	}
}

class Delegate implements IDelegate<RendererType> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

export class SCMViewlet extends Viewlet {

	private list: List<RendererType>;
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService private scmService: ISCMService
	) {
		super(VIEWLET_ID, telemetryService);

		console.log(scmService.activeProvider);
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('scm-viewlet');

		const root = parent.getHTMLElement();
		const list = append(root, $('.scm-status'));

		const delegate = new Delegate();
		const renderer = new Renderer();
		this.list = new List(list, delegate, [renderer]);

		// chain(this.list.onSelectionChange)
		// 	.map(e => e.elements[0])
		// 	.filter(e => !!e)
		// 	.on(this.openExtension, this, this.disposables);

		return TPromise.as(null);
	}

	layout({ height }: Dimension): void {
		this.list.layout(height);
	}

	getOptimalWidth(): number {
		return 400;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
