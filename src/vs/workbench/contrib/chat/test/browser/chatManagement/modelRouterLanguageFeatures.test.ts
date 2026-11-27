/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { CompletionItem, CompletionTriggerKind } from '../../../../../../editor/common/languages.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { createModelServices } from '../../../../../../editor/test/common/testTextModel.js';
import { IMarkerService, MarkerSeverity } from '../../../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../../../platform/markers/common/markerService.js';
import { ModelRouterLanguageFeatures } from '../../../browser/chatManagement/modelRouterLanguageFeatures.js';

suite('ModelRouterLanguageFeatures', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const file = URI.file('/home/.agents/model-routers/daily-driver.model-router.yaml');

	let modelService: IModelService;
	let languageFeaturesService: ILanguageFeaturesService;
	let markerService: IMarkerService;

	setup(() => {
		const instantiationService = createModelServices(store.add(new DisposableStore()), [[IMarkerService, MarkerService]]);
		modelService = instantiationService.get(IModelService);
		languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
		markerService = instantiationService.get(IMarkerService);
		store.add(instantiationService.createInstance(ModelRouterLanguageFeatures));
	});

	const router = [
		'version: 1',
		'description: |',
		'  Small questions on a small model.',
		'routes:',
		'  - name: quick',
		'    model: haiku',
		'    examples:',
		'      - what does this do?',
		'    when: Quick answers.',
		'  - model: opus',
		'    when: Hard problems.',
	];

	/** The router with `line` as its line `lineNumber`. */
	function withLine(lineNumber: number, line: string): string[] {
		return [...router.slice(0, lineNumber - 1), line, ...router.slice(lineNumber - 1)];
	}

	/** What is offered at the `@` in a router file. */
	async function complete(lines: string[]): Promise<CompletionItem[]> {
		const text = lines.join('\n');
		const model = modelService.createModel(text.replace('@', ''), null, file);
		try {
			const [provider] = languageFeaturesService.completionProvider.ordered(model);
			const result = await provider.provideCompletionItems(model, model.getPositionAt(text.indexOf('@')), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);
			return result?.suggestions ?? [];
		} finally {
			modelService.destroyModel(file);
		}
	}

	async function labels(lines: string[]): Promise<unknown[]> {
		return (await complete(lines)).map(item => item.label);
	}

	/** The edit that accepting `label` makes. */
	function edit(items: CompletionItem[], label: string) {
		const item = items.find(candidate => candidate.label === label);
		return item && { insertText: item.insertText, range: Range.isIRange(item.range) ? Range.lift(item.range).toString() : undefined, offersValues: !!item.command };
	}

	test('offers the keys a router or a route does not have yet', async () => {
		assert.deepStrictEqual({
			router: await labels([...router, '@']),
			route: await labels(withLine(10, '    @')),
			newRoute: await labels([...router, '  - @']),
			textBlock: await labels(withLine(4, '  @')),
			example: await labels(withLine(9, '      - @')),
		}, {
			router: ['name', 'display-name', 'effort', 'context-size', 'switching', 'guidance'],
			route: ['effort', 'context-size', 'guidance'],
			newRoute: ['name', 'model', 'when', 'examples', 'effort', 'context-size', 'guidance'],
			textBlock: [],
			example: [],
		});
	});

	test('writes a key with its colon and offers the values of the router or the route', async () => {
		assert.deepStrictEqual({
			key: edit(await complete([...router, 'sw@']), 'switching'),
			listKey: edit(await complete([...router, '  - ex@']), 'examples'),
			keyBeforeColon: edit(await complete([...router, 'eff@: high']), 'effort'),
			routerValues: await labels([...router, 'effort: @']),
			routeValues: await labels(withLine(10, '    effort: @')),
			valueAfterColon: edit(await complete(withLine(10, '    effort:@')), 'high'),
			valueReplaced: edit(await complete([...router, 'context-size: lo@ng # for big files']), 'default'),
		}, {
			key: { insertText: 'switching: ', range: '[12,1 -> 12,3]', offersValues: true },
			listKey: { insertText: 'examples:', range: '[12,5 -> 12,7]', offersValues: false },
			keyBeforeColon: { insertText: 'effort', range: '[12,1 -> 12,4]', offersValues: false },
			routerValues: ['auto', 'off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
			routeValues: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
			valueAfterColon: { insertText: ' high', range: '[10,12 -> 10,12]', offersValues: false },
			valueReplaced: { insertText: 'default', range: '[12,15 -> 12,19]', offersValues: false },
		});
	});

	test('shows what is wrong with a router file while it is open', () => runWithFakedTimers({}, async () => {
		const problems = (resource: URI) => markerService.read({ resource }).map(marker => `${MarkerSeverity[marker.severity]} ${Range.lift(marker)}: ${marker.message}`);

		const other = URI.file('/home/project/config.yaml');
		const otherModel = modelService.createModel('colour: blue', null, other);
		const model = modelService.createModel(['colour: blue', ...router.slice(1)].join('\n'), null, file);
		const opened = { router: problems(file), other: problems(other), otherCompletions: languageFeaturesService.completionProvider.ordered(otherModel).length };

		model.setValue(['version: 1', 'colour: blue', ...router.slice(1)].join('\n'));
		await timeout(1000);
		const changed = problems(file);

		modelService.destroyModel(file);
		modelService.destroyModel(other);

		assert.deepStrictEqual({ opened, changed, closed: problems(file) }, {
			opened: {
				router: [
					'Warning [1,1 -> 1,7]: Unknown key `colour` is ignored.',
					'Error [1,1 -> 1,13]: Add `version: 1`.',
				],
				other: [],
				otherCompletions: 0,
			},
			changed: ['Warning [2,1 -> 2,7]: Unknown key `colour` is ignored.'],
			closed: [],
		});
	}));
});
