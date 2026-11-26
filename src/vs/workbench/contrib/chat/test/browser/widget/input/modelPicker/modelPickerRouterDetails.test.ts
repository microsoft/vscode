/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IResourceEditorInput } from '../../../../../../../../platform/editor/common/editor.js';
import { IAgentModelRouterRoute } from '../../../../../../../../platform/agentHost/common/meta/agentModelMeta.js';
import { ModelRouterSwitching } from '../../../../../../../../platform/agentHost/common/modelRouter.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IEditorService } from '../../../../../../../services/editor/common/editorService.js';
import { ModelRouterDetails } from '../../../../../browser/widget/input/modelPicker/modelPickerRouterDetails.js';

suite('ModelRouterDetails', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const file = URI.file('/routers/daily.model-router.yaml');

	function render(routes: readonly IAgentModelRouterRoute[], switching?: ModelRouterSwitching) {
		const events: (string | IResourceEditorInput)[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(ILabelService, upcastPartial<ILabelService>({ getUriLabel: resource => `~${resource.path}` }));
		instantiationService.stub(IEditorService, {}, 'openEditor', async (input: IResourceEditorInput) => {
			events.push(input);
			return undefined;
		});
		const card = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		disposables.add(toDisposable(() => card.remove()));
		disposables.add(instantiationService.createInstance(ModelRouterDetails, card, { routes, switching, definitionFile: file, onWillOpenDefinitionFile: () => events.push('close picker') }));
		return { card, events };
	}

	function snapshot({ card, events }: ReturnType<typeof render>) {
		const text = (row: Element, part: string) => row.querySelector(`.chat-model-card-route-${part}`)?.textContent;
		return {
			sections: Array.from(card.querySelectorAll('.chat-model-card-section-heading'), heading => Array.from(heading.children, part => part.textContent).join(': ')),
			routes: Array.from(card.querySelectorAll('.chat-model-card-route'), row => ({ name: text(row, 'name'), model: text(row, 'model'), settings: text(row, 'settings') })),
			explanations: Array.from(card.querySelectorAll('[aria-description]'), element => element.getAttribute('aria-description')),
			events,
		};
	}

	test('lists each route as the picker\'s list shows a model, marks the default one, says whether the router switches, and opens its file', () => {
		const routes: IAgentModelRouterRoute[] = [
			{ name: 'build', model: 'Claude Opus 5.5', effort: 'high', contextTokens: 1_000_000 },
			{ name: 'quick', model: 'Claude Haiku 5.5' },
			{ model: 'GPT-6.1 Sol', effort: 'auto' },
		];
		const routed = render(routes, 'auto');
		const link = routed.card.querySelector<HTMLElement>('.chat-model-card-definition-file a');
		link?.click();
		// One route is not a default, and a router with errors has none to list.
		const single = render([{ model: 'Claude Opus 5.5', effort: 'high' }]);
		const keepsItsRoute = snapshot(render(routes, 'first-turn'));
		assert.deepStrictEqual({ routed: snapshot(routed), link: link?.textContent, keepsItsRoute: { sections: keepsItsRoute.sections, explanation: keepsItsRoute.explanations.at(-1) }, single: snapshot(single), invalid: snapshot(render([])) }, {
			routed: {
				sections: ['Routes', 'Route switching: Automatic'],
				routes: [
					{ name: 'build (default)', model: 'Claude Opus 5.5', settings: 'High \u00b7 1M' },
					{ name: 'quick', model: 'Claude Haiku 5.5', settings: undefined },
					{ name: undefined, model: 'GPT-6.1 Sol', settings: 'Auto' },
				],
				explanations: ['Used when no route clearly fits.', 'A chat moves to another route when the work clearly changes.'],
				events: ['close picker', { resource: file }],
			},
			link: 'daily.model-router.yaml',
			keepsItsRoute: { sections: ['Routes', 'Route switching: Off'], explanation: 'A chat keeps the route picked for its first message.' },
			single: { sections: ['Routes'], routes: [{ name: undefined, model: 'Claude Opus 5.5', settings: 'High' }], explanations: [], events: [] },
			invalid: { sections: [], routes: [], explanations: [], events: [] },
		});
	});
});
