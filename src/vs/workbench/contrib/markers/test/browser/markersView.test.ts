/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { Event, Relay } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { Marker } from '../../browser/markersModel.js';
import { ResourceMarkersRenderer } from '../../browser/markersTreeViewer.js';
import { MarkersView } from '../../browser/markersView.js';
import { Markers, MarkersViewMode } from '../../common/markers.js';

suite('MarkersView', () => {
	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Inspect lifecycle state without exposing test-only APIs. */
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const resources = [URI.file('/workspace/first.ts'), URI.file('/workspace/second.ts')];

	function marker(message: string): IMarkerData {
		return { message, severity: MarkerSeverity.Error, startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };
	}

	function createView(viewMode: MarkersViewMode) {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ problems: { defaultViewMode: viewMode, autoReveal: false } })
		}, disposables);
		const container = upcastPartial<ViewContainer>({ id: Markers.MARKERS_VIEW_ID });
		const containerModel = upcastPartial<IViewContainerModel>({ onDidChangeContainerInfo: Event.None });
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			getViewLocationById: () => ViewContainerLocation.Panel,
			getViewDescriptorById: () => null,
			getViewContainerByViewId: () => container,
			getDefaultContainerById: () => container,
			getViewContainerModel: () => containerModel
		});
		const markerService = disposables.add(new MarkerService());
		instantiationService.stub(IMarkerService, markerService);
		const view = disposables.add(instantiationService.createInstance(MarkersView, { id: Markers.MARKERS_VIEW_ID, title: 'Problems' }));
		const createInstance = spy(view['instantiationService'], 'createInstance');
		disposables.add(toDisposable(() => createInstance.restore()));
		disposables.add(toDisposable(() => view.element.remove()));
		document.body.appendChild(view.element);
		view.render();
		view.setVisible(true);
		view.orthogonalSize = 400;
		view.layout(800);
		return { view, markerService, createInstance, languageService: instantiationService.get(ILanguageService) as LanguageService };
	}

	async function update(view: MarkersView, markerService: MarkerService, resource: URI, message: string): Promise<void> {
		const changed = Event.toPromise(view['markersModel'].onDidChange);
		markerService.changeOne('test', resource, [marker(message)]);
		await changed;
	}

	function currentMarkers(view: MarkersView): Marker[] {
		return resources.flatMap(resource => view['markersModel'].getResourceMarkers(resource)?.markers ?? []);
	}

	test('releases tree labels, renderers and relay subscriptions on repeated switches and disposal', async () => {
		const relayInput = spy(Relay.prototype, 'input', ['set']);
		disposables.add(toDisposable(() => relayInput.set.restore()));
		const { view, markerService, createInstance, languageService } = createView(MarkersViewMode.Table);
		await update(view, markerService, resources[0], 'first');
		const listeners = () => languageService['_onDidChange']['_size'];
		const initialListeners = listeners();
		const labels: ResourceLabels[] = [];
		const renderers: ResourceMarkersRenderer[] = [];

		for (let iteration = 0; iteration < 3; iteration++) {
			view.setViewMode(MarkersViewMode.Tree);
			const treeLabels = createInstance.returnValues.findLast((instance): instance is ResourceLabels => instance instanceof ResourceLabels)!;
			labels.push(treeLabels);
			const renderer = createInstance.returnValues.findLast((instance): instance is ResourceMarkersRenderer => instance instanceof ResourceMarkersRenderer)!;
			renderers.push(renderer);
			const relay: Relay<never> = relayInput.set.lastCall.thisValue;
			assert.deepStrictEqual({
				freshLabels: new Set(labels).size,
				freshRenderers: new Set(renderers).size,
				disposed: treeLabels['_store'].isDisposed,
				rendererDisposed: renderer['disposables'].isDisposed,
				relayListening: relay['listening'],
				relayListeners: relay['emitter'].hasListeners(),
				listeners: listeners()
			}, { freshLabels: iteration + 1, freshRenderers: iteration + 1, disposed: false, rendererDisposed: false, relayListening: true, relayListeners: true, listeners: initialListeners + 1 });

			if (iteration < 2) {
				view.setViewMode(MarkersViewMode.Table);
			} else {
				view.dispose();
			}

			assert.deepStrictEqual({
				disposed: labels.map(labels => labels['_store'].isDisposed),
				renderersDisposed: renderers.map(renderer => renderer['disposables'].isDisposed),
				relayListening: relay['listening'],
				relayListeners: relay['emitter'].hasListeners(),
				listeners: listeners()
			}, { disposed: labels.map(() => true), renderersDisposed: renderers.map(() => true), relayListening: false, relayListeners: false, listeners: initialListeners });
		}
	});

	for (const viewMode of [MarkersViewMode.Tree, MarkersViewMode.Table]) {
		suite(viewMode, () => {
			for (const populateCache of [false, true]) {
				test(`releases view models on hide with ${populateCache ? 'populated' : 'invalidated'} resource cache`, async () => {
					const { view, markerService } = createView(viewMode);
					await update(view, markerService, resources[0], 'first');
					await update(view, markerService, resources[1], 'second');
					await update(view, markerService, resources[0], 'updated');
					const markers = currentMarkers(view);
					const viewModels = markers.map(marker => view['markersViewModel'].getViewModel(marker));
					if (populateCache) {
						view.getAllResourceMarkers();
					}

					view.setVisible(false);

					assert.deepStrictEqual({
						markers: view['markersModel'].total,
						resources: view.getAllResourceMarkers(),
						retained: markers.map(marker => view['markersViewModel'].getViewModel(marker) !== null),
						disposed: viewModels.map(viewModel => viewModel?.['_store'].isDisposed)
					}, { markers: 0, resources: [], retained: [false, false], disposed: [true, true] });
				});
			}

			test('keeps only current diagnostics across repeated hidden updates', async () => {
				const { view, markerService } = createView(viewMode);
				await update(view, markerService, resources[0], 'first');
				await update(view, markerService, resources[1], 'second');
				view.setMultiline(false);
				const filterChanged = Event.toPromise(view.filterWidget.onDidChangeFilterText);
				view.filterWidget.setFilterText('second');
				await filterChanged;

				for (let revision = 0; revision < 3; revision++) {
					await update(view, markerService, resources[0], `first ${revision}`);
					const obsolete = currentMarkers(view);
					view.setVisible(false);
					const changed = Event.toPromise(markerService.onMarkerChanged);
					markerService.changeAll('test', resources.map((resource, index) => ({ resource, marker: marker(`${index ? 'second' : 'first'} hidden ${revision}`) })));
					await changed;
					view.setVisible(true);
					const current = currentMarkers(view);

					assert.deepStrictEqual({
						obsolete: obsolete.map(marker => view['markersViewModel'].getViewModel(marker) !== null),
						messages: current.map(marker => marker.marker.message),
						rendered: current.map(marker => view.element.textContent?.includes(marker.marker.message)),
						multiline: current.map(marker => view['markersViewModel'].getViewModel(marker)?.multiline),
						viewMode: view['markersViewModel'].viewMode,
						filter: view.filterWidget.getFilterText(),
						stats: view.getFilterStats()
					}, {
						obsolete: [false, false],
						messages: [`first hidden ${revision}`, `second hidden ${revision}`],
						rendered: [false, true],
						multiline: [false, false],
						viewMode,
						filter: 'second',
						stats: { total: 2, filtered: 1 }
					});
				}

				const current = currentMarkers(view);
				const viewModels = current.map(marker => view['markersViewModel'].getViewModel(marker));
				view.dispose();
				assert.deepStrictEqual({
					retained: current.map(marker => view['markersViewModel'].getViewModel(marker) !== null),
					disposed: viewModels.map(viewModel => viewModel?.['_store'].isDisposed)
				}, { retained: [false, false], disposed: [true, true] });
			});

			test('releases replaced and removed resource state while visible', async () => {
				const { view, markerService } = createView(viewMode);
				await update(view, markerService, resources[0], 'first');
				await update(view, markerService, resources[1], 'second');
				const previous = currentMarkers(view);
				await update(view, markerService, resources[0], 'replacement');
				const changed = Event.toPromise(view['markersModel'].onDidChange);
				markerService.changeOne('test', resources[1], []);
				await changed;

				assert.deepStrictEqual({
					previous: previous.map(marker => view['markersViewModel'].getViewModel(marker) !== null),
					messages: currentMarkers(view).map(marker => marker.marker.message),
					stats: view.getFilterStats()
				}, { previous: [false, false], messages: ['replacement'], stats: { total: 1, filtered: 1 } });
			});

			test('keeps the selected diagnostic when switching view mode', async () => {
				const { view, markerService } = createView(viewMode);
				await update(view, markerService, resources[0], 'first');
				const [selected] = currentMarkers(view);
				view['widget'].setMarkerSelection([selected], [selected]);
				const otherMode = viewMode === MarkersViewMode.Tree ? MarkersViewMode.Table : MarkersViewMode.Tree;

				view.setViewMode(otherMode);
				view.setViewMode(viewMode);

				assert.deepStrictEqual({
					viewMode: view['markersViewModel'].viewMode,
					selection: view['widget'].getSelection().map(element => element instanceof Marker ? element.marker.message : undefined),
					focus: view['widget'].getFocus().map(element => element instanceof Marker ? element.marker.message : undefined),
					rendered: view.element.textContent?.includes('first')
				}, { viewMode, selection: ['first'], focus: ['first'], rendered: true });
			});

			test('keeps several selected diagnostics when switching view mode', async () => {
				const { view, markerService } = createView(viewMode);
				await update(view, markerService, resources[0], 'first');
				await update(view, markerService, resources[1], 'second');
				const markers = currentMarkers(view);
				view['widget'].setMarkerSelection(markers, markers);
				const otherMode = viewMode === MarkersViewMode.Tree ? MarkersViewMode.Table : MarkersViewMode.Tree;

				view.setViewMode(otherMode);
				view.setViewMode(viewMode);

				assert.deepStrictEqual(view['widget'].getSelection().map(element => element instanceof Marker ? element.marker.message : undefined).sort(), ['first', 'second']);
			});

			test('switches view mode without a selection', async () => {
				const { view, markerService } = createView(viewMode);
				await update(view, markerService, resources[0], 'first');
				const otherMode = viewMode === MarkersViewMode.Tree ? MarkersViewMode.Table : MarkersViewMode.Tree;

				view.setViewMode(otherMode);
				view.setViewMode(viewMode);

				assert.deepStrictEqual({
					viewMode: view['markersViewModel'].viewMode,
					selection: view['widget'].getSelection().length,
					rendered: view.element.textContent?.includes('first')
				}, { viewMode, selection: 0, rendered: true });
			});
		});
	}
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */
});
