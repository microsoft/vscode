/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { ITitleService } from '../../../../services/title/browser/titleService.js';
import { SCMActiveRepositoryController } from '../../browser/activity.js';
import { ISCMHistoryProvider } from '../../common/history.js';
import { ISCMProvider, ISCMRepository, ISCMService, ISCMViewService } from '../../common/scm.js';

suite('SCMActiveRepositoryController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses and clears the active repository name override', () => {
		const provider = new class extends mock<ISCMProvider>() {
			override readonly name = 'worktree';
			override readonly activeRepositoryName = observableValue<string | undefined>(this, undefined);
			override readonly historyProvider = observableValue<ISCMHistoryProvider | undefined>(this, undefined);
			override readonly statusBarCommands = observableValue(this, undefined);
		}();
		const repository = new class extends mock<ISCMRepository>() {
			override readonly provider = provider;
		}();
		const scmService = new class extends mock<ISCMService>() {
			override readonly onDidAddRepository = Event.None;
			override readonly onDidRemoveRepository = Event.None;
		}();
		const scmViewService = new class extends mock<ISCMViewService>() {
			override readonly activeRepository = observableValue(this, { repository, pinned: false });
			override readonly repositories = [repository];
			override readonly visibleRepositories = [];
			override readonly onDidChangeVisibleRepositories = Event.None;
		}();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const titleService = new class extends mock<ITitleService>() {
			override registerVariables(): void { }
		}();

		disposables.add(new SCMActiveRepositoryController(
			new class extends mock<IActivityService>() { }(),
			new TestConfigurationService(),
			contextKeyService,
			scmService,
			scmViewService,
			new class extends mock<IStatusbarService>() { }(),
			titleService
		));

		const names = [contextKeyService.getContextKeyValue('scmActiveRepositoryName')];
		provider.activeRepositoryName.set('repository', undefined);
		names.push(contextKeyService.getContextKeyValue('scmActiveRepositoryName'));
		provider.activeRepositoryName.set(undefined, undefined);
		names.push(contextKeyService.getContextKeyValue('scmActiveRepositoryName'));

		assert.deepStrictEqual(names, ['worktree', 'repository', 'worktree']);
	});
});
