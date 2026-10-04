/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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
		const labels = disposables.add(instantiationService.createInstance(ResourceLabels, view));
		instantiationService.stubInstance(ResourceLabels, labels);
		instantiationService.stubInstance(ResourceMarkersRenderer, disposables.add(new ResourceMarkersRenderer(labels, Event.None)));
		disposables.add(toDisposable(() => view.element.remove()));
		document.body.appendChild(view.element);
		view.render();
		view.setVisible(true);
		view.orthogonalSize = 400;
		view.layout(800);
		return { view, markerService };
	}

	async function update(view: MarkersView, markerService: MarkerService, resource: URI, message: string): Promise<void> {
		const changed = Event.toPromise(view['markersModel'].onDidChange);
		markerService.changeOne('test', resource, [marker(message)]);
		await changed;
	}

	function currentMarkers(view: MarkersView): Marker[] {
		return resources.flatMap(resource => view['markersModel'].getResourceMarkers(resource)?.markers ?? []);
	}

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
						retained: markers.map(marker => view['markersViewModel'].getViewModel(marker) !== null),
						disposed: viewModels.map(viewModel => viewModel?.['_store'].isDisposed)
					}, { markers: 0, retained: [false, false], disposed: [true, true] });
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
		});
	}
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */
});
