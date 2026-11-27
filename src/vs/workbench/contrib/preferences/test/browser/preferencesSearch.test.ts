/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { TfIdfCalculator } from '../../../../../base/common/tfIdf.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISetting, ISettingsEditorModel, ISettingsGroup } from '../../../../services/preferences/common/preferences.js';
import { nullRange } from '../../../../services/preferences/common/preferencesModels.js';
import { PreferencesSearchService } from '../../browser/preferencesSearch.js';

suite('PreferencesSearchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createModel(settings: Record<string, string>): ISettingsEditorModel {
		// Unrelated settings give the TF-IDF terms of the real settings a realistic weight
		const fillers = Array.from({ length: 200 }, (_, index) => [`filler.setting${index}`, 'Filler']);
		const sectionSettings = [...Object.entries(settings), ...fillers].map(([key, description]) => new class extends mock<ISetting>() {
			override key = key;
			override description = [description];
			override range = nullRange;
		}());
		const group = new class extends mock<ISettingsGroup>() {
			override id = 'test';
			override sections = [{ settings: sectionSettings }];
		}();
		return new class extends mock<ISettingsEditorModel>() {
			override settingsGroups = [group];
		}();
	}

	test('TF-IDF search builds its index once per settings model', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ workbench: { settings: { enableNaturalLanguageSearch: true } } }));
		const service = store.add(instantiationService.createInstance(PreferencesSearchService));
		const indexBuilds = sinon.spy(TfIdfCalculator.prototype, 'updateDocuments');
		const search = async (model: ISettingsEditorModel, query: string) => {
			const result = await service.getRemoteSearchProvider(query)!.searchModel(model, CancellationToken.None);
			return result?.filterMatches.map(match => match.setting.key);
		};

		const animals = createModel({ 'zebra.stripes': 'Paint the zebra stripes', 'giraffe.neck': 'Stretch the giraffe neck' });
		const zebras = createModel({ 'zebra.mane': 'Comb the zebra mane' });
		const results = [
			await search(animals, 'zebra'),
			await search(animals, 'giraffe'),
			await search(zebras, 'zebra'),
		];

		assert.deepStrictEqual({ results, indexBuilds: indexBuilds.callCount }, {
			results: [['zebra.stripes'], ['giraffe.neck'], ['zebra.mane']],
			indexBuilds: 2,
		});
	});
});
