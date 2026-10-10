/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
// eslint-disable-next-line local/code-import-patterns
import { AbstractCustomView, ICustomViewDescriptor } from '../../../../../sessions/services/customView/browser/customView.js';
// eslint-disable-next-line local/code-import-patterns
import { CustomViewNode } from '../../../../../sessions/browser/parts/customViewNode.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

const NODE_WIDTH = 720;
const NODE_HEIGHT = 320;

class FixtureCustomView extends AbstractCustomView {

	readonly title: IObservable<string>;
	override readonly description: IObservable<string | undefined>;
	override readonly maxWidth: number | undefined;

	constructor(
		title: string,
		description: string | undefined,
		private readonly _itemCount: number,
		maxWidth?: number,
	) {
		super();
		this.title = constObservable(title);
		this.description = constObservable(description);
		this.maxWidth = maxWidth;
	}

	render(container: HTMLElement): void {
		for (let i = 0; i < this._itemCount; i++) {
			container.appendChild($('div', undefined, `Item ${i + 1}`));
		}
	}

	layout(): void { }
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	CustomViewNodeTitleOnly: defineComponentFixture({
		render: ctx => renderNode(ctx, { title: 'Automations', itemCount: 4 }),
	}),
	CustomViewNodeWithDescription: defineComponentFixture({
		render: ctx => renderNode(ctx, {
			title: 'Automations',
			description: 'Scheduled agents that run on a trigger, defined in this workspace.',
			itemCount: 40,
		}),
	}),
	CustomViewNodeNarrowMaxWidth: defineComponentFixture({
		render: ctx => renderNode(ctx, { title: 'Automations', itemCount: 4, maxWidth: 360 }),
	}),
});

interface IFixtureOptions {
	readonly title: string;
	readonly description?: string;
	readonly itemCount: number;
	readonly maxWidth?: number;
}

function renderNode(ctx: ComponentFixtureContext, options: IFixtureOptions): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => registerWorkbenchServices(reg),
	});

	// The node reads the session-view surface colors that the hosting part sets.
	container.style.width = `${NODE_WIDTH}px`;
	container.style.height = `${NODE_HEIGHT}px`;
	container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	container.style.backgroundColor = 'var(--session-view-background)';

	const descriptor: ICustomViewDescriptor = {
		id: 'fixture.customView',
		ctor: new SyncDescriptor(FixtureCustomView, [options.title, options.description, options.itemCount, options.maxWidth]),
	};

	const node = disposableStore.add(instantiationService.createInstance(CustomViewNode, descriptor));
	node.element.style.height = '100%';
	container.appendChild(node.element);
	node.layout(NODE_WIDTH, NODE_HEIGHT);
}
