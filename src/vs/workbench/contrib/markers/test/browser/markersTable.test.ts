/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { FilterOptions } from '../../browser/markersFilterOptions.js';
import { Marker, ResourceMarkers } from '../../browser/markersModel.js';
import { MarkersTable } from '../../browser/markersTable.js';
import { MarkersViewModel } from '../../browser/markersTreeViewer.js';
import { MarkersViewMode } from '../../common/markers.js';

suite('MarkersTable', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const target = URI.parse('https://learn.microsoft.com/dotnet/fundamentals/code-analysis/style-rules/ide0270');

	for (const code of ['IDE0270', { value: 'IDE0270', target }]) {
		test(`shows ${typeof code === 'string' ? 'plain' : 'linked'} diagnostic code without a source`, () => {
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IOpenerService, { ...NullOpenerService });
			const resource = URI.file('/test.cs');
			const resourceMarkers = new ResourceMarkers('resource', resource);
			resourceMarkers.set(resource, [new Marker('marker', {
				owner: 'test', resource, severity: MarkerSeverity.Warning,
				message: 'Null check can be simplified', code,
				startLineNumber: 33, startColumn: 17, endLineNumber: 33, endColumn: 18,
			})]);
			const viewModel = store.add(instantiationService.createInstance(MarkersViewModel, false, MarkersViewMode.Table));
			const filter = new FilterOptions('', [], true, true, true, instantiationService.get(IUriIdentityService));
			const table = store.add(instantiationService.createInstance(MarkersTable, $('div'), viewModel, [], filter, {}));
			table.layout(200, 800);
			table.reset([resourceMarkers]);

			const column = table.getHTMLElement().querySelector<HTMLElement>('.code')!;
			assert.deepStrictEqual({
				text: column.textContent,
				title: column.title,
				mode: column.className,
				href: column.querySelector('a')?.getAttribute('href'),
			}, {
				text: 'IDE0270',
				title: 'IDE0270',
				mode: typeof code === 'string' ? 'code code-label' : 'code code-link',
				href: typeof code === 'string' ? '' : target.toString(true),
			});
		});
	}
});
