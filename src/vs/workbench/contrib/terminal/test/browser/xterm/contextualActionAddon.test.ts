/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ContextualActionAddon } from 'vs/workbench/contrib/terminal/browser/xterm/contextualActionAddon';
import { IDecoration, IDecorationOptions, Terminal } from 'xterm';

class TestTerminal extends Terminal {
	override registerDecoration(decorationOptions: IDecorationOptions): IDecoration | undefined {
		if (decorationOptions.marker.isDisposed) {
			return undefined;
		}
		const element = document.createElement('div');
		return { marker: decorationOptions.marker, element, onDispose: () => { }, isDisposed: false, dispose: () => { }, onRender: (element: HTMLElement) => { return element; } } as unknown as IDecoration;
	}
}

suite('ContextualActionAddon', () => {
	let contextualActionAddon: ContextualActionAddon;
	let xterm: TestTerminal;

	setup(() => {
		const instantiationService = new TestInstantiationService();
		xterm = new TestTerminal({
			allowProposedApi: true,
			cols: 80,
			rows: 30
		});
		instantiationService.stub(IContextMenuService, instantiationService.createInstance(ContextMenuService));
		contextualActionAddon = instantiationService.createInstance(ContextualActionAddon);
		xterm.loadAddon(contextualActionAddon);
	});
	test(() => {

	});
});
