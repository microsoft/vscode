/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { basename } from 'vs/base/common/resources';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { VIEW_PANE_ID, ISCMService, ISCMRepository, ISCMViewService } from 'vs/workbench/contrib/scm/common/scm';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarEntry, IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditorResourceAccessor } from 'vs/workbench/common/editor';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { Iterable } from 'vs/base/common/iterator';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { IEditorGroupContextKeyProvider, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { getRepositoryResourceCount } from 'vs/workbench/contrib/scm/browser/util';
import { autorun, autorunWithStore, derived, IObservable, observableFromEvent } from 'vs/base/common/observable';
import { observableConfigValue } from 'vs/platform/observable/common/platformObservableUtils';
import { derivedObservableWithCache, latestChangedValue, observableFromEventOpts } from 'vs/base/common/observableInternal/utils';
import { Command } from 'vs/editor/common/languages';

const ActiveRepositoryContextKeys = {
	ActiveRepositoryName: new RawContextKey<string>('scmActiveRepositoryName', ''),
	ActiveRepositoryBranchName: new RawContextKey<string>('scmActiveRepositoryBranchName', ''),
};

export class SCMActiveRepositoryController extends Disposable implements IWorkbenchContribution {
	private readonly _countBadgeConfig = observableConfigValue<'all' | 'focused' | 'off'>('scm.countBadge', 'all', this.configurationService);

	private readonly _repositories = observableFromEvent(this,
		Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository),
		() => this.scmService.repositories);

	private readonly _focusedRepository = observableFromEventOpts<ISCMRepository | undefined>(
		{ owner: this, equalsFn: () => false },
		this.scmViewService.onDidFocusRepository,
		() => this.scmViewService.focusedRepository);

	private readonly _activeEditor = observableFromEventOpts(
		{ owner: this, equalsFn: () => false },
		this.editorService.onDidActiveEditorChange,
		() => this.editorService.activeEditor);

	private readonly _activeEditorRepository = derivedObservableWithCache<ISCMRepository | undefined>(this, (reader, lastValue) => {
		const activeResource = EditorResourceAccessor.getOriginalUri(this._activeEditor.read(reader));
		if (!activeResource) {
			return lastValue;
		}

		const repository = this.scmService.getRepository(activeResource);
		if (!repository) {
			return lastValue;
		}

		return Object.create(repository);
	});

	/**
	 * The focused repository takes precedence over the active editor repository when the observable
	 * values are updated in the same transaction (or during the initial read of the observable value).
	 */
	private readonly _activeRepository = latestChangedValue(this, [this._activeEditorRepository, this._focusedRepository]);

	private readonly _countBadgeRepositories = derived(this, reader => {
		switch (this._countBadgeConfig.read(reader)) {
			case 'all': {
				const repositories = this._repositories.read(reader);
				return [...Iterable.map(repositories, r => ({ provider: r.provider, resourceCount: this._getRepositoryResourceCount(r) }))];
			}
			case 'focused': {
				const repository = this._activeRepository.read(reader);
				return repository ? [{ provider: repository.provider, resourceCount: this._getRepositoryResourceCount(repository) }] : [];
			}
			case 'off':
				return [];
			default:
				throw new Error('Invalid countBadge setting');
		}
	});

	private readonly _countBadge = derived(this, reader => {
		let total = 0;

		for (const repository of this._countBadgeRepositories.read(reader)) {
			const count = repository.provider.count?.read(reader);
			const resourceCount = repository.resourceCount.read(reader);

			total = total + (count ?? resourceCount);
		}

		return total;
	});

	private _activeRepositoryNameContextKey: IContextKey<string>;
	private _activeRepositoryBranchNameContextKey: IContextKey<string>;

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@ISCMService private readonly scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ITitleService private readonly titleService: ITitleService
	) {
		super();

		this._activeRepositoryNameContextKey = ActiveRepositoryContextKeys.ActiveRepositoryName.bindTo(this.contextKeyService);
		this._activeRepositoryBranchNameContextKey = ActiveRepositoryContextKeys.ActiveRepositoryBranchName.bindTo(this.contextKeyService);

		this.titleService.registerVariables([
			{ name: 'activeRepositoryName', contextKey: ActiveRepositoryContextKeys.ActiveRepositoryName.key },
			{ name: 'activeRepositoryBranchName', contextKey: ActiveRepositoryContextKeys.ActiveRepositoryBranchName.key, }
		]);

		this._register(autorunWithStore((reader, store) => {
			this._updateActivityCountBadge(this._countBadge.read(reader), store);
		}));

		this._register(autorunWithStore((reader, store) => {
			const repository = this._activeRepository.read(reader);
			const commands = repository?.provider.statusBarCommands.read(reader);

			this._updateStatusBar(repository, commands ?? [], store);
		}));

		this._register(autorun(reader => {
			const repository = this._activeRepository.read(reader);
			const historyProvider = repository?.provider.historyProvider.read(reader);
			const branchName = historyProvider?.currentHistoryItemGroupName.read(reader);

			this._updateActiveRepositoryContextKeys(repository?.provider.name, branchName);
		}));
	}

	private _getRepositoryResourceCount(repository: ISCMRepository): IObservable<number> {
		return observableFromEvent(this, repository.provider.onDidChangeResources, () => /** @description repositoryResourceCount */ getRepositoryResourceCount(repository.provider));
	}

	private _updateActivityCountBadge(count: number, store: DisposableStore): void {
		if (count === 0) {
			return;
		}

		const badge = new NumberBadge(count, num => localize('scmPendingChangesBadge', '{0} pending changes', num));
		store.add(this.activityService.showViewActivity(VIEW_PANE_ID, { badge }));
	}

	private _updateStatusBar(repository: ISCMRepository | undefined, commands: readonly Command[], store: DisposableStore): void {
		if (!repository) {
			return;
		}

		const label = repository.provider.rootUri
			? `${basename(repository.provider.rootUri)} (${repository.provider.label})`
			: repository.provider.label;

		for (let index = 0; index < commands.length; index++) {
			const command = commands[index];
			const tooltip = `${label}${command.tooltip ? ` - ${command.tooltip}` : ''}`;

			// Get a repository agnostic name for the status bar action, derive this from the
			// first command argument which is in the form "git.<command>/<number>"
			let repoAgnosticActionName = command.arguments?.[0];
			if (repoAgnosticActionName && typeof repoAgnosticActionName === 'string') {
				repoAgnosticActionName = repoAgnosticActionName
					.substring(0, repoAgnosticActionName.lastIndexOf('/'))
					.replace(/^git\./, '');
				if (repoAgnosticActionName.length > 1) {
					repoAgnosticActionName = repoAgnosticActionName[0].toLocaleUpperCase() + repoAgnosticActionName.slice(1);
				}
			} else {
				repoAgnosticActionName = '';
			}

			const statusbarEntry: IStatusbarEntry = {
				name: localize('status.scm', "Source Control") + (repoAgnosticActionName ? ` ${repoAgnosticActionName}` : ''),
				text: command.title,
				ariaLabel: tooltip,
				tooltip,
				command: command.id ? command : undefined
			};

			store.add(index === 0 ?
				this.statusbarService.addEntry(statusbarEntry, `status.scm.${index}`, MainThreadStatusBarAlignment.LEFT, 10000) :
				this.statusbarService.addEntry(statusbarEntry, `status.scm.${index}`, MainThreadStatusBarAlignment.LEFT, { id: `status.scm.${index - 1}`, alignment: MainThreadStatusBarAlignment.RIGHT, compact: true })
			);
		}
	}

	private _updateActiveRepositoryContextKeys(repositoryName: string | undefined, branchName: string | undefined): void {
		this._activeRepositoryNameContextKey.set(repositoryName ?? '');
		this._activeRepositoryBranchNameContextKey.set(branchName ?? '');
	}
}

export class SCMActiveResourceContextKeyController extends Disposable implements IWorkbenchContribution {
	private readonly _repositories = observableFromEvent(this,
		Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository),
		() => this.scmService.repositories);

	private readonly _onDidRepositoryChange = new Emitter<void>();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ISCMService private readonly scmService: ISCMService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		const activeResourceHasChangesContextKey = new RawContextKey<boolean>('scmActiveResourceHasChanges', false, localize('scmActiveResourceHasChanges', "Whether the active resource has changes"));
		const activeResourceRepositoryContextKey = new RawContextKey<string | undefined>('scmActiveResourceRepository', undefined, localize('scmActiveResourceRepository', "The active resource's repository"));

		this._store.add(autorunWithStore((reader, store) => {
			for (const repository of this._repositories.read(reader)) {
				store.add(Event.runAndSubscribe(repository.provider.onDidChangeResources, () => {
					this._onDidRepositoryChange.fire();
				}));
			}
		}));

		// Create context key providers which will update the context keys based on each groups active editor
		const hasChangesContextKeyProvider: IEditorGroupContextKeyProvider<boolean> = {
			contextKey: activeResourceHasChangesContextKey,
			getGroupContextKeyValue: (group) => this._getEditorHasChanges(group.activeEditor),
			onDidChange: this._onDidRepositoryChange.event
		};

		const repositoryContextKeyProvider: IEditorGroupContextKeyProvider<string | undefined> = {
			contextKey: activeResourceRepositoryContextKey,
			getGroupContextKeyValue: (group) => this._getEditorRepositoryId(group.activeEditor),
			onDidChange: this._onDidRepositoryChange.event
		};

		this._store.add(editorGroupsService.registerContextKeyProvider(hasChangesContextKeyProvider));
		this._store.add(editorGroupsService.registerContextKeyProvider(repositoryContextKeyProvider));
	}

	private _getEditorHasChanges(activeEditor: EditorInput | null): boolean {
		const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);
		if (!activeResource) {
			return false;
		}

		const activeResourceRepository = this.scmService.getRepository(activeResource);
		for (const resourceGroup of activeResourceRepository?.provider.groups ?? []) {
			if (resourceGroup.resources
				.some(scmResource =>
					this.uriIdentityService.extUri.isEqual(activeResource, scmResource.sourceUri))) {
				return true;
			}
		}

		return false;
	}

	private _getEditorRepositoryId(activeEditor: EditorInput | null): string | undefined {
		const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);
		if (!activeResource) {
			return undefined;
		}

		const activeResourceRepository = this.scmService.getRepository(activeResource);
		return activeResourceRepository?.id;
	}

	override dispose(): void {
		this._onDidRepositoryChange.dispose();
		super.dispose();
	}
}
