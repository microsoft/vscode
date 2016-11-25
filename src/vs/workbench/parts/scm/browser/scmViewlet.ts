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
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ISCMService, ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// TODO@Joao remove
import { GitSCMProvider } from 'vs/workbench/parts/git/browser/gitSCMProvider';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
}

class ResourceGroupRenderer implements IRenderer<ISCMResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const countContainer = append(element, $('div'));
		const count = new CountBadge(countContainer);

		return { name, count };
	}

	renderElement(group: ISCMResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.get().length);
	}

	disposeTemplate(template: ResourceGroupTemplate): void {

	}
}

interface ResourceTemplate {
	fileLabel: FileLabel;
}

class ResourceRenderer implements IRenderer<ISCMResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {

	}

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const fileLabel = this.instantiationService.createInstance(FileLabel, container, void 0);

		return { fileLabel };
	}

	renderElement(resource: ISCMResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.uri);
	}

	disposeTemplate(template: ResourceTemplate): void {
		// noop
	}
}

class Delegate implements IDelegate<ISCMResourceGroup | ISCMResource> {

	getHeight() { return 22; }

	getTemplateId(element: ISCMResourceGroup | ISCMResource) {
		return (element as ISCMResource).uri ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

export class SCMViewlet extends Viewlet {

	private list: List<ISCMResourceGroup | ISCMResource>;
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISCMService private scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(VIEWLET_ID, telemetryService);

		// TODO@Joao
		scmService.activeProvider = instantiationService.createInstance(GitSCMProvider);
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('scm-viewlet');

		const root = parent.getHTMLElement();
		const list = append(root, $('.scm-status.show-file-icons'));

		const delegate = new Delegate();

		this.list = new List(list, delegate, [
			new ResourceGroupRenderer(),
			this.instantiationService.createInstance(ResourceRenderer)
		]);

		// chain(this.list.onSelectionChange)
		// 	.map(e => e.elements[0])
		// 	.filter(e => !!e)
		// 	.on(this.openExtension, this, this.disposables);

		this.update();
		this.scmService.activeProvider.onChange(() => this.update());

		return TPromise.as(null);
	}

	private update(): void {
		const provider = this.scmService.activeProvider;
		const groups = provider.resourceGroups;
		const elements = groups.reduce<(ISCMResourceGroup | ISCMResource)[]>((result, group) => {
			const resources = group.get();

			if (resources.length === 0) {
				return result;
			}

			return [...result, group, ...group.get()];
		}, []);

		this.list.splice(0, this.list.length, ...elements);
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
