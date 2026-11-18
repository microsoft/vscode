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
import { IModelRouterRouteSummary } from '../../../../../../../../platform/agentHost/common/modelRouter.js';
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

	function render(routes: readonly IModelRouterRouteSummary[]) {
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
		disposables.add(instantiationService.createInstance(ModelRouterDetails, card, routes, file, () => events.push('close picker')));
		return { card, events };
	}

	function snapshot({ card, events }: ReturnType<typeof render>) {
		const text = (row: Element, part: string) => row.querySelector(`.chat-model-card-route-${part}`)?.textContent;
		return {
			sections: Array.from(card.querySelectorAll('.chat-model-card-section-title'), title => title.textContent),
			routes: Array.from(card.querySelectorAll('.chat-model-card-route'), row => ({ name: text(row, 'name'), model: text(row, 'model'), settings: text(row, 'settings') })),
			events,
		};
	}

	test('lists each route as the picker\'s list shows a model, marks the default one, and opens the router\'s file', () => {
		const routed = render([
			{ name: 'build', model: 'Claude Opus 5.5', effort: 'high', contextTokens: 1_000_000 },
			{ name: 'quick', model: 'Claude Haiku 5.5' },
			{ model: 'GPT-6.1 Sol', effort: 'auto' },
		]);
		const link = routed.card.querySelector<HTMLElement>('.chat-model-card-definition-file a');
		link?.click();
		// One route is not a default, and a router with errors has none to list.
		const single = render([{ model: 'Claude Opus 5.5', effort: 'high' }]);
		assert.deepStrictEqual({ routed: snapshot(routed), link: link?.textContent, single: snapshot(single), invalid: snapshot(render([])) }, {
			routed: {
				sections: ['Routes'],
				routes: [
					{ name: 'build (default)', model: 'Claude Opus 5.5', settings: 'High \u00b7 1M' },
					{ name: 'quick', model: 'Claude Haiku 5.5', settings: undefined },
					{ name: undefined, model: 'GPT-6.1 Sol', settings: 'Auto' },
				],
				events: ['close picker', { resource: file }],
			},
			link: 'daily.model-router.yaml',
			single: { sections: ['Routes'], routes: [{ name: undefined, model: 'Claude Opus 5.5', settings: 'High' }], events: [] },
			invalid: { sections: [], routes: [], events: [] },
		});
	});
});
