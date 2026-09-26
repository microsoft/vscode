/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IMarkerData, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { MarkerService } from '../../../../platform/markers/common/markerService.js';
import { Range } from '../../../common/core/range.js';
import { ITextModel } from '../../../common/model.js';
import { MarkerDecorationsService } from '../../../common/services/markerDecorationsService.js';
import { IModelService } from '../../../common/services/model.js';
import { createModelServices } from '../testTextModel.js';

suite('MarkerDecorationsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let modelService: IModelService;
	let markerService: MarkerService;
	let decorationService: MarkerDecorationsService;

	setup(() => {
		const instantiationService = createModelServices(disposables.add(new DisposableStore()));
		modelService = instantiationService.get(IModelService);
		markerService = disposables.add(new MarkerService());
		decorationService = disposables.add(new MarkerDecorationsService(modelService, markerService));
	});

	function createModel(uri = URI.file('/diagnostics.txt')): ITextModel {
		return disposables.add(modelService.createModel(Array.from({ length: 600 }, () => 'value').join('\n'), null, uri));
	}

	function createMarkers(count: number): IMarkerData[] {
		const severities = [MarkerSeverity.Error, MarkerSeverity.Warning, MarkerSeverity.Info, MarkerSeverity.Hint];
		return Array.from({ length: count }, (_, index) => ({
			severity: severities[index % severities.length],
			message: `problem ${index + 1}`,
			startLineNumber: index + 1,
			startColumn: 1,
			endLineNumber: index + 1,
			endColumn: 2
		}));
	}

	async function changeMarkers(model: ITextModel, count: number, owner = 'test'): Promise<void> {
		const changed = Event.toPromise(markerService.onMarkerChanged);
		markerService.changeOne(owner, model.uri, createMarkers(count));
		await changed;
	}

	test('reports overflow only above 500 while preserving all diagnostics', async () => {
		const model = createModel();
		const states = [];
		for (const count of [499, 500, 501, 600, 500, 0]) {
			await changeMarkers(model, count);
			states.push({
				diagnostics: markerService.read({ resource: model.uri }).length,
				decorations: decorationService.getLiveMarkers(model.uri).length,
				limited: decorationService.getDecorationLimit(model.uri)
			});
		}

		assert.deepStrictEqual(states, [
			{ diagnostics: 499, decorations: 499, limited: false },
			{ diagnostics: 500, decorations: 500, limited: false },
			{ diagnostics: 501, decorations: 500, limited: 500 },
			{ diagnostics: 600, decorations: 500, limited: 500 },
			{ diagnostics: 500, decorations: 500, limited: false },
			{ diagnostics: 0, decorations: 0, limited: false }
		]);
	});

	test('notifies when only the limit changes, without replacing decorations', async () => {
		const model = createModel();
		await changeMarkers(model, 500);
		const decorationIds = model.getAllDecorations().map(decoration => decoration.id);
		const changes: { resource: URI; limited: number | false }[] = [];
		disposables.add(decorationService.onDidChangeMarker(model => {
			changes.push({ resource: model.uri, limited: decorationService.getDecorationLimit(model.uri) });
		}));

		await changeMarkers(model, 1, 'overflow');
		await changeMarkers(model, 2, 'overflow');
		await changeMarkers(model, 0, 'overflow');

		assert.deepStrictEqual({
			changes,
			decorationIds: model.getAllDecorations().map(decoration => decoration.id)
		}, {
			changes: [{ resource: model.uri, limited: 500 }, { resource: model.uri, limited: false }],
			decorationIds
		});
	});

	test('honors resource filters and restores the limit when filtering ends', async () => {
		const model = createModel();
		await changeMarkers(model, 600);

		const filtered = Event.toPromise(markerService.onMarkerChanged);
		const filter = disposables.add(markerService.installResourceFilter(model.uri, 'test'));
		await filtered;
		const filteredState = {
			limited: decorationService.getDecorationLimit(model.uri),
			decorations: decorationService.getLiveMarkers(model.uri).length,
			diagnostics: markerService.read({ resource: model.uri, ignoreResourceFilters: true }).length
		};

		const unfiltered = Event.toPromise(markerService.onMarkerChanged);
		filter.dispose();
		await unfiltered;

		assert.deepStrictEqual({
			filtered: filteredState,
			restored: {
				limited: decorationService.getDecorationLimit(model.uri),
				decorations: decorationService.getLiveMarkers(model.uri).length
			}
		}, {
			filtered: { limited: false, decorations: 1, diagnostics: 600 },
			restored: { limited: 500, decorations: 500 }
		});
	});

	test('preserves suppression after applying the decoration limit', async () => {
		const model = createModel();
		await changeMarkers(model, 501);
		const suppression = disposables.add(decorationService.addMarkerSuppression(model.uri, new Range(1, 1, 100, 2)));
		const suppressedState = {
			limited: decorationService.getDecorationLimit(model.uri),
			lines: decorationService.getLiveMarkers(model.uri).map(([range]) => range.startLineNumber)
		};

		suppression.dispose();

		assert.deepStrictEqual({
			suppressed: suppressedState,
			restored: {
				limited: decorationService.getDecorationLimit(model.uri),
				decorations: decorationService.getLiveMarkers(model.uri).length
			}
		}, {
			suppressed: { limited: 500, lines: Array.from({ length: 400 }, (_, index) => index + 101) },
			restored: { limited: 500, decorations: 500 }
		});
	});

	test('keeps limits separate for resources with the same path', async () => {
		const local = createModel();
		const remote = createModel(URI.from({ scheme: Schemas.vscodeRemote, authority: 'first', path: local.uri.path }));
		const otherRemote = createModel(remote.uri.with({ authority: 'second' }));
		await changeMarkers(local, 501);
		await changeMarkers(remote, 500);
		await changeMarkers(otherRemote, 600);

		assert.deepStrictEqual(
			[local, remote, otherRemote].map(model => decorationService.getDecorationLimit(model.uri)),
			[500, false, 500]
		);
	});

	test('clears the limit on model disposal and restores it when reopening', async () => {
		const model = createModel();
		await changeMarkers(model, 501);
		model.dispose();
		const afterDisposal = decorationService.getDecorationLimit(model.uri);
		const reopened = createModel(model.uri);

		assert.deepStrictEqual({
			afterDisposal,
			afterReopening: decorationService.getDecorationLimit(reopened.uri),
			decorations: decorationService.getLiveMarkers(reopened.uri).length
		}, {
			afterDisposal: false,
			afterReopening: 500,
			decorations: 500
		});
	});

	test('initializes limits for existing models and diagnostics', async () => {
		const serviceDisposables = disposables.add(new DisposableStore());
		const model = createModel();
		await changeMarkers(model, 501);
		decorationService.dispose();
		const restoredService = serviceDisposables.add(new MarkerDecorationsService(modelService, markerService));

		assert.deepStrictEqual({
			limited: restoredService.getDecorationLimit(model.uri),
			decorations: restoredService.getLiveMarkers(model.uri).length
		}, {
			limited: 500,
			decorations: 500
		});
	});
});
