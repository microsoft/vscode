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
import { IMarkerLimit } from '../../../common/services/markerDecorations.js';
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
		return disposables.add(modelService.createModel(Array.from({ length: 5100 }, () => 'value').join('\n'), null, uri));
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

	async function changeMarkers(model: ITextModel, count: number, owner = 'test', isTruncated = false): Promise<void> {
		const changed = Event.toPromise(markerService.onMarkerChanged);
		markerService.changeOne(owner, model.uri, createMarkers(count), { isTruncated });
		await changed;
	}

	test('reports overflow only above 5000 while preserving all diagnostics', async () => {
		const model = createModel();
		const states = [];
		for (const count of [4999, 5000, 5001, 5100, 5000, 0]) {
			await changeMarkers(model, count);
			states.push({
				diagnostics: markerService.read({ resource: model.uri }).length,
				decorations: decorationService.getLiveMarkers(model.uri).length,
				limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated
			});
		}

		assert.deepStrictEqual(states, [
			{ diagnostics: 4999, decorations: 4999, limited: undefined },
			{ diagnostics: 5000, decorations: 5000, limited: undefined },
			{ diagnostics: 5001, decorations: 5000, limited: 5000 },
			{ diagnostics: 5100, decorations: 5000, limited: 5000 },
			{ diagnostics: 5000, decorations: 5000, limited: undefined },
			{ diagnostics: 0, decorations: 0, limited: undefined }
		]);
	});

	test('separately notifies when only the limit changes, without replacing decorations', async () => {
		const model = createModel();
		await changeMarkers(model, 5000);
		const decorationIds = model.getAllDecorations().map(decoration => decoration.id);
		const markerChanges: URI[] = [];
		disposables.add(decorationService.onDidChangeMarker(model => {
			markerChanges.push(model.uri);
		}));
		const exceededLimitChanges: { resource: URI; limited: number | undefined }[] = [];
		disposables.add(decorationService.onDidChangeMarkerLimit(model => {
			exceededLimitChanges.push({ resource: model.uri, limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated });
		}));

		await changeMarkers(model, 1, 'overflow');
		await changeMarkers(model, 2, 'overflow');
		await changeMarkers(model, 0, 'overflow');

		assert.deepStrictEqual({
			markerChanges,
			exceededLimitChanges,
			decorationIds: model.getAllDecorations().map(decoration => decoration.id)
		}, {
			markerChanges: [],
			exceededLimitChanges: [{ resource: model.uri, limited: 5000 }, { resource: model.uri, limited: undefined }],
			decorationIds
		});
	});

	test('reports diagnostic truncation independently of the decoration limit', async () => {
		const model = createModel();
		await changeMarkers(model, 5001);
		const decorationIds = model.getAllDecorations().map(decoration => decoration.id);
		const markerChanges: URI[] = [];
		disposables.add(decorationService.onDidChangeMarker(model => {
			markerChanges.push(model.uri);
		}));
		const limitChanges: (IMarkerLimit | undefined)[] = [];
		disposables.add(decorationService.onDidChangeMarkerLimit(model => {
			limitChanges.push(decorationService.getMarkerLimits(model.uri));
		}));

		await changeMarkers(model, 1, 'truncated', true);
		const truncatedDecorationIds = model.getAllDecorations().map(decoration => decoration.id);
		await changeMarkers(model, 1, 'truncated');
		const restoredDecorationIds = model.getAllDecorations().map(decoration => decoration.id);
		await changeMarkers(model, 0);
		await changeMarkers(model, 1, 'truncated', true);

		assert.deepStrictEqual({
			limitChanges,
			markerChanges,
			decorationsUnchangedWhileOverLimit: [truncatedDecorationIds, restoredDecorationIds].every(ids => ids.length === decorationIds.length && ids.every((id, index) => id === decorationIds[index]))
		}, {
			limitChanges: [
				{ isMarkersSourceTruncated: true, isMarkersTruncated: 5000 },
				{ isMarkersSourceTruncated: false, isMarkersTruncated: 5000 },
				{ isMarkersSourceTruncated: false, isMarkersTruncated: undefined },
				{ isMarkersSourceTruncated: true, isMarkersTruncated: undefined }
			],
			markerChanges: [model.uri, model.uri],
			decorationsUnchangedWhileOverLimit: true
		});
	});

	test('honors resource filters and restores the limit when filtering ends', async () => {
		const model = createModel();
		await changeMarkers(model, 5100);

		const filtered = Event.toPromise(markerService.onMarkerChanged);
		const filter = disposables.add(markerService.installResourceFilter(model.uri, 'test'));
		await filtered;
		const filteredState = {
			limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated,
			decorations: decorationService.getLiveMarkers(model.uri).length,
			diagnostics: markerService.read({ resource: model.uri, ignoreResourceFilters: true }).length
		};

		const unfiltered = Event.toPromise(markerService.onMarkerChanged);
		filter.dispose();
		await unfiltered;

		assert.deepStrictEqual({
			filtered: filteredState,
			restored: {
				limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated,
				decorations: decorationService.getLiveMarkers(model.uri).length
			}
		}, {
			filtered: { limited: undefined, decorations: 1, diagnostics: 5100 },
			restored: { limited: 5000, decorations: 5000 }
		});
	});

	test('preserves suppression after applying the decoration limit', async () => {
		const model = createModel();
		await changeMarkers(model, 5001);
		const suppression = disposables.add(decorationService.addMarkerSuppression(model.uri, new Range(1, 1, 100, 2)));
		const suppressedState = {
			limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated,
			lines: decorationService.getLiveMarkers(model.uri).map(([range]) => range.startLineNumber)
		};

		suppression.dispose();

		assert.deepStrictEqual({
			suppressed: suppressedState,
			restored: {
				limited: decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated,
				decorations: decorationService.getLiveMarkers(model.uri).length
			}
		}, {
			suppressed: { limited: 5000, lines: Array.from({ length: 4900 }, (_, index) => index + 101) },
			restored: { limited: 5000, decorations: 5000 }
		});
	});

	test('keeps limits separate for resources with the same path', async () => {
		const local = createModel();
		const remote = createModel(URI.from({ scheme: Schemas.vscodeRemote, authority: 'first', path: local.uri.path }));
		const otherRemote = createModel(remote.uri.with({ authority: 'second' }));
		await changeMarkers(local, 5001);
		await changeMarkers(remote, 5000);
		await changeMarkers(otherRemote, 5100);

		assert.deepStrictEqual(
			[local, remote, otherRemote].map(model => decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated),
			[5000, undefined, 5000]
		);
	});

	test('clears the limit on model disposal and restores it when reopening', async () => {
		const model = createModel();
		await changeMarkers(model, 5001);
		model.dispose();
		const afterDisposal = decorationService.getMarkerLimits(model.uri)?.isMarkersTruncated;
		const reopened = createModel(model.uri);

		assert.deepStrictEqual({
			afterDisposal,
			afterReopening: decorationService.getMarkerLimits(reopened.uri)?.isMarkersTruncated,
			decorations: decorationService.getLiveMarkers(reopened.uri).length
		}, {
			afterDisposal: undefined,
			afterReopening: 5000,
			decorations: 5000
		});
	});

	test('initializes limits for existing models and diagnostics', async () => {
		const serviceDisposables = disposables.add(new DisposableStore());
		const model = createModel();
		await changeMarkers(model, 5001);
		decorationService.dispose();
		const restoredService = serviceDisposables.add(new MarkerDecorationsService(modelService, markerService));

		assert.deepStrictEqual({
			limited: restoredService.getMarkerLimits(model.uri)?.isMarkersTruncated,
			decorations: restoredService.getLiveMarkers(model.uri).length
		}, {
			limited: 5000,
			decorations: 5000
		});
	});
});
