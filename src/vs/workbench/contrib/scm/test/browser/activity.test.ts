/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IActivity, IActivityService, NumberBadge } from '../../../../services/activity/common/activity.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { ITitleService } from '../../../../services/title/browser/titleService.js';
import { SCMActiveRepositoryController } from '../../browser/activity.js';
import { ISCMHistoryProvider } from '../../common/history.js';
import { ISCMProvider, ISCMRepository, ISCMResource, ISCMResourceGroup, ISCMViewService } from '../../common/scm.js';

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
		const scmViewService = new class extends mock<ISCMViewService>() {
			override readonly activeRepository = observableValue(this, { repository, pinned: false });
			override readonly repositories = [repository];
			override readonly visibleRepositories = [];
			override readonly onDidChangeRepositories = Event.None;
			override readonly onDidChangeVisibleRepositories = Event.None;
		}();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const titleService = new class extends mock<ITitleService>() {
			override registerVariables(): void { }
		}();

		disposables.add(new SCMActiveRepositoryController(
			new class extends mock<IActivityService>() { }(),
			new TestConfigurationService({ scm: { countBadge: 'off' } }),
			contextKeyService,
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

	test('count badge "all" sums the repositories that are not selected in the Repositories view', () => {
		const createRepository = (name: string, resourceCount: number) => {
			const provider = new class extends mock<ISCMProvider>() {
				override readonly name = name;
				override readonly count = observableValue<number | undefined>(this, undefined);
				override readonly groups = [new class extends mock<ISCMResourceGroup>() {
					override readonly resources = new Array<ISCMResource>(resourceCount);
				}()];
				override readonly onDidChangeResources = Event.None;
			}();
			return new class extends mock<ISCMRepository>() {
				override readonly provider = provider;
			}();
		};
		const repository1 = createRepository('repository1', 1);
		const repository2 = createRepository('repository2', 2);

		// Single selection mode: only the first repository is selected in the Repositories view
		const scmViewService = new class extends mock<ISCMViewService>() {
			override readonly activeRepository = observableValue<{ repository: ISCMRepository; pinned: boolean } | undefined>(this, undefined);
			override readonly repositories = [repository1, repository2];
			override readonly visibleRepositories = [repository1];
			override readonly onDidChangeRepositories = Event.None;
			override readonly onDidChangeVisibleRepositories = Event.None;
		}();
		const badges: number[] = [];
		const activityService = new class extends mock<IActivityService>() {
			override showViewActivity(_viewId: string, activity: IActivity): IDisposable {
				badges.push((activity.badge as NumberBadge).number);
				return toDisposable(() => { });
			}
		}();
		const titleService = new class extends mock<ITitleService>() {
			override registerVariables(): void { }
		}();

		disposables.add(new SCMActiveRepositoryController(
			activityService,
			new TestConfigurationService({ scm: { countBadge: 'all' } }),
			disposables.add(new MockContextKeyService()),
			scmViewService,
			new class extends mock<IStatusbarService>() { }(),
			titleService
		));

		assert.deepStrictEqual(badges, [3]);
	});
});
