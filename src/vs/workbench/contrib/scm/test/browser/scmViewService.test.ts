/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { SCMViewService } from '../../browser/scmViewService.js';
import { ISCMMenus, ISCMProvider, ISCMRepository, ISCMRepositorySortKey, ISCMService } from '../../common/scm.js';

function createRepository(name: string, path: string): ISCMRepository {
	const provider = upcastPartial<ISCMProvider>({
		id: path,
		providerId: 'git',
		label: 'Git',
		name,
		rootUri: URI.file(path)
	});

	return upcastPartial<ISCMRepository>({ id: path, provider });
}

suite('SCMViewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts repositories by provider name with path as a tie-breaker', () => {
		const repositories = [
			createRepository('zeta', '/a'),
			createRepository('alpha', '/c'),
			createRepository('alpha', '/b')
		];
		const scmService = upcastPartial<ISCMService>({
			repositories,
			onDidAddRepository: Event.None,
			onDidRemoveRepository: Event.None,
			getRepository: () => undefined
		});
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const menus = upcastPartial<ISCMMenus>({});
		const menuInstantiationService = upcastPartial<IInstantiationService>({
			createInstance: (() => menus) as IInstantiationService['createInstance']
		});

		const scmViewService = disposables.add(new SCMViewService(
			scmService,
			instantiationService.get(IContextKeyService),
			instantiationService.get(IEditorService),
			instantiationService.get(IExtensionService),
			menuInstantiationService,
			instantiationService.get(IConfigurationService),
			instantiationService.get(IStorageService)
		));
		disposables.add(scmViewService.onDidChangeVisibleRepositories(() => { }));
		scmViewService.toggleSortKey(ISCMRepositorySortKey.Name);

		assert.deepStrictEqual(
			scmViewService.repositories.map(repository => ({
				name: repository.provider.name,
				path: repository.provider.rootUri?.path
			})),
			[
				{ name: 'alpha', path: '/b' },
				{ name: 'alpha', path: '/c' },
				{ name: 'zeta', path: '/a' }
			]
		);
	});
});
