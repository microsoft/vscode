/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFolderLocationChangeEvent, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IActivity, IActivityService, NumberBadge } from '../../../../services/activity/common/activity.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarEntryLocation, IStatusbarEntryPriority, IStatusbarService, isStatusbarEntryLocation, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { ITitleService } from '../../../../services/title/browser/titleService.js';
import { SCMActiveRepositoryController } from '../../browser/activity.js';
import { ISCMHistoryProvider } from '../../common/history.js';
import { ISCMProvider, ISCMRepository, ISCMResource, ISCMResourceGroup, ISCMStatusBarCommand, ISCMViewService } from '../../common/scm.js';

suite('SCMActiveRepositoryController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWorkspaceServices(folderUri = URI.file('/folder')) {
		const folder = new class extends mock<IWorkspaceFolder>() {
			override readonly uri = folderUri;
		}();
		const onDidChangeLocation = disposables.add(new Emitter<IFolderLocationChangeEvent>());
		let atAlternateLocation = false;
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override readonly onDidChangeWorkbenchState = Event.None;
			override getWorkspace(): IWorkspace {
				return new class extends mock<IWorkspace>() {
					override readonly folders = [folder];
				}();
			}
		}();
		const folderLocationService = new class extends mock<IWorkspaceFolderLocationService>() {
			override readonly onDidChangeLocation = onDidChangeLocation.event;
			override isAtAlternateLocation(candidate: IWorkspaceFolder): boolean {
				return atAlternateLocation && candidate === folder;
			}
		}();
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUri;
		}();
		const setAtAlternateLocation = (value: boolean) => {
			atAlternateLocation = value;
			onDidChangeLocation.fire({ folder, reason: 'user' });
		};
		return { workspaceContextService, folderLocationService, uriIdentityService, setAtAlternateLocation };
	}

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

		const workspaceServices = createWorkspaceServices();
		disposables.add(new SCMActiveRepositoryController(
			new class extends mock<IActivityService>() { }(),
			new TestConfigurationService({ scm: { countBadge: 'off' } }),
			contextKeyService,
			scmViewService,
			new class extends mock<IStatusbarService>() { }(),
			titleService,
			workspaceServices.workspaceContextService,
			workspaceServices.folderLocationService,
			workspaceServices.uriIdentityService
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

		const workspaceServices = createWorkspaceServices();
		disposables.add(new SCMActiveRepositoryController(
			activityService,
			new TestConfigurationService({ scm: { countBadge: 'all' } }),
			disposables.add(new MockContextKeyService()),
			scmViewService,
			new class extends mock<IStatusbarService>() { }(),
			titleService,
			workspaceServices.workspaceContextService,
			workspaceServices.folderLocationService,
			workspaceServices.uriIdentityService
		));

		assert.deepStrictEqual(badges, [3]);
	});

	test('hides the flagged status bar commands of the repository at the workspace folder while the folder is at an alternate location', () => {
		const createStatusBar = (rootUri: URI) => {
			const provider = new class extends mock<ISCMProvider>() {
				override readonly name = 'repository';
				override readonly label = 'Git';
				override readonly rootUri = rootUri;
				override readonly activeRepositoryName = observableValue<string | undefined>(this, undefined);
				override readonly historyProvider = observableValue<ISCMHistoryProvider | undefined>(this, undefined);
				override readonly statusBarCommands = observableValue<readonly ISCMStatusBarCommand[] | undefined>(this, [
					{ id: 'branch', title: 'main', hideAtAlternateFolderLocation: true },
					{ id: 'sync', title: 'sync' }
				]);
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
			const entries = new Set<string>();
			const statusbarService = new class extends mock<IStatusbarService>() {
				override addEntry(entry: IStatusbarEntry, id: string, _alignment: StatusbarAlignment, priorityOrLocation: number | IStatusbarEntryLocation | IStatusbarEntryPriority): IStatusbarEntryAccessor {
					const anchor = isStatusbarEntryLocation(priorityOrLocation) ? ` after ${priorityOrLocation.location.id}` : '';
					const description = `${id} ${entry.text}${anchor}`;
					entries.add(description);
					return new class extends mock<IStatusbarEntryAccessor>() {
						override dispose(): void { entries.delete(description); }
					}();
				}
			}();
			const workspaceServices = createWorkspaceServices();
			disposables.add(new SCMActiveRepositoryController(
				new class extends mock<IActivityService>() { }(),
				new TestConfigurationService({ scm: { countBadge: 'off' } }),
				disposables.add(new MockContextKeyService()),
				scmViewService,
				statusbarService,
				new class extends mock<ITitleService>() {
					override registerVariables(): void { }
				}(),
				workspaceServices.workspaceContextService,
				workspaceServices.folderLocationService,
				workspaceServices.uriIdentityService
			));
			const texts = () => [...entries];
			return { texts, setAtAlternateLocation: workspaceServices.setAtAlternateLocation };
		};

		const atFolder = createStatusBar(URI.file('/folder'));
		const nested = createStatusBar(URI.file('/folder/nested'));
		const result: Record<string, string[][]> = { atFolder: [atFolder.texts()], nested: [nested.texts()] };
		for (const value of [true, false]) {
			atFolder.setAtAlternateLocation(value);
			nested.setAtAlternateLocation(value);
			result.atFolder.push(atFolder.texts());
			result.nested.push(nested.texts());
		}

		const shown = ['status.scm.0 main', 'status.scm.1 sync after status.scm.0'];
		assert.deepStrictEqual(result, {
			atFolder: [shown, ['status.scm.1 sync'], shown],
			nested: [shown, shown, shown]
		});
	});
});
