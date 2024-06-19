/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { basename } from 'vs/base/common/resources';
import { IDisposable, dispose, Disposable, DisposableStore, combinedDisposable } from 'vs/base/common/lifecycle';
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
import { Schemas } from 'vs/base/common/network';
import { Iterable } from 'vs/base/common/iterator';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { IEditorGroupContextKeyProvider, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { getRepositoryResourceCount } from 'vs/workbench/contrib/scm/browser/util';
import { autorun, autorunWithStore, derived, IObservable, observableFromEvent } from 'vs/base/common/observable';
import { observableConfigValue } from 'vs/platform/observable/common/platformObservableUtils';
import { derivedObservableWithCache, latestChangedValue, observableFromEventOpts } from 'vs/base/common/observableInternal/utils';
import { Command } from 'vs/editor/common/languages';
import { ISCMHistoryItemGroup } from 'vs/workbench/contrib/scm/common/history';
import { ILogService } from 'vs/platform/log/common/log';

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
			this.logService.trace('SCMActiveRepositoryController (activeEditorRepository derived): no activeResource');
			return lastValue;
		}

		const repository = this.scmService.getRepository(activeResource);
		if (!repository) {
			this.logService.trace(`SCMActiveRepositoryController (activeEditorRepository derived): no repository for '${activeResource.toString()}'`);
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
				return [...Iterable.map(repositories, r => ({ ...r.provider, resourceCount: this._getRepositoryResourceCount(r) }))];
			}
			case 'focused': {
				const repository = this._activeRepository.read(reader);
				return repository ? [{ ...repository.provider, resourceCount: this._getRepositoryResourceCount(repository) }] : [];
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
			const count = repository.count?.read(reader);
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
		@ILogService private readonly logService: ILogService,
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

		this._register(autorun(reader => {
			const repository = this._focusedRepository.read(reader);
			const commands = repository?.provider.statusBarCommands.read(reader);

			this.logService.trace('SCMActiveRepositoryController (focusedRepository):', repository?.id ?? 'no id');
			this.logService.trace('SCMActiveRepositoryController (focusedRepository):', commands ? commands.map(c => c.title).join(', ') : 'no commands');
		}));

		this._register(autorun(reader => {
			const repository = this._activeEditorRepository.read(reader);
			const commands = repository?.provider.statusBarCommands.read(reader);

			this.logService.trace('SCMActiveRepositoryController (activeEditorRepository):', repository?.id ?? 'no id');
			this.logService.trace('SCMActiveRepositoryController (activeEditorRepository):', commands ? commands.map(c => c.title).join(', ') : 'no commands');
		}));

		this._register(autorunWithStore((reader, store) => {
			this._updateActivityCountBadge(this._countBadge.read(reader), store);
		}));

		this._register(autorunWithStore((reader, store) => {
			const repository = this._activeRepository.read(reader);
			const commands = repository?.provider.statusBarCommands.read(reader);

			this.logService.trace('SCMActiveRepositoryController (status bar):', repository?.id ?? 'no id');
			this.logService.trace('SCMActiveRepositoryController (status bar):', commands ? commands.map(c => c.title).join(', ') : 'no commands');

			this._updateStatusBar(repository, commands ?? [], store);
		}));

		this._register(autorun(reader => {
			const repository = this._activeRepository.read(reader);
			const currentHistoryItemGroup = repository?.provider.historyProviderObs.read(reader)?.currentHistoryItemGroupObs.read(reader);

			this._updateActiveRepositoryContextKeys(repository, currentHistoryItemGroup);
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
			this.logService.trace('SCMActiveRepositoryController (status bar): repository is undefined');
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

	private _updateActiveRepositoryContextKeys(repository: ISCMRepository | undefined, currentHistoryItemGroup: ISCMHistoryItemGroup | undefined): void {
		this._activeRepositoryNameContextKey.set(repository?.provider.name ?? '');
		this._activeRepositoryBranchNameContextKey.set(currentHistoryItemGroup?.name ?? '');
	}
}

const ActiveRepositoryContextKeys = {
	ActiveRepositoryName: new RawContextKey<string>('scmActiveRepositoryName', ''),
	ActiveRepositoryBranchName: new RawContextKey<string>('scmActiveRepositoryBranchName', ''),
};

export class SCMActiveResourceContextKeyController implements IWorkbenchContribution {

	private readonly disposables = new DisposableStore();
	private repositoryDisposables = new Set<IDisposable>();
	private onDidRepositoryChange = new Emitter<void>();

	constructor(
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ISCMService private readonly scmService: ISCMService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		const activeResourceHasChangesContextKey = new RawContextKey<boolean>('scmActiveResourceHasChanges', false, localize('scmActiveResourceHasChanges', "Whether the active resource has changes"));
		const activeResourceRepositoryContextKey = new RawContextKey<string | undefined>('scmActiveResourceRepository', undefined, localize('scmActiveResourceRepository', "The active resource's repository"));

		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);

		for (const repository of this.scmService.repositories) {
			this.onDidAddRepository(repository);
		}

		// Create context key providers which will update the context keys based on each groups active editor
		const hasChangesContextKeyProvider: IEditorGroupContextKeyProvider<boolean> = {
			contextKey: activeResourceHasChangesContextKey,
			getGroupContextKeyValue: (group) => this.getEditorHasChanges(group.activeEditor),
			onDidChange: this.onDidRepositoryChange.event
		};

		const repositoryContextKeyProvider: IEditorGroupContextKeyProvider<string | undefined> = {
			contextKey: activeResourceRepositoryContextKey,
			getGroupContextKeyValue: (group) => this.getEditorRepositoryId(group.activeEditor),
			onDidChange: this.onDidRepositoryChange.event
		};

		this.disposables.add(editorGroupsService.registerContextKeyProvider(hasChangesContextKeyProvider));
		this.disposables.add(editorGroupsService.registerContextKeyProvider(repositoryContextKeyProvider));
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const onDidChange = Event.any(repository.provider.onDidChange, repository.provider.onDidChangeResources);
		const changeDisposable = onDidChange(() => {
			this.onDidRepositoryChange.fire();
		});

		const onDidRemove = Event.filter(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.repositoryDisposables.delete(disposable);
			this.onDidRepositoryChange.fire();
		});

		const disposable = combinedDisposable(changeDisposable, removeDisposable);
		this.repositoryDisposables.add(disposable);
	}

	private getEditorRepositoryId(activeEditor: EditorInput | null): string | undefined {
		const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);

		if (activeResource?.scheme === Schemas.file || activeResource?.scheme === Schemas.vscodeRemote) {
			const activeResourceRepository = Iterable.find(
				this.scmService.repositories,
				r => Boolean(r.provider.rootUri && this.uriIdentityService.extUri.isEqualOrParent(activeResource, r.provider.rootUri))
			);

			return activeResourceRepository?.id;
		}

		return undefined;
	}

	private getEditorHasChanges(activeEditor: EditorInput | null): boolean {
		const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);

		if (activeResource?.scheme === Schemas.file || activeResource?.scheme === Schemas.vscodeRemote) {
			const activeResourceRepository = Iterable.find(
				this.scmService.repositories,
				r => Boolean(r.provider.rootUri && this.uriIdentityService.extUri.isEqualOrParent(activeResource, r.provider.rootUri))
			);

			for (const resourceGroup of activeResourceRepository?.provider.groups ?? []) {
				if (resourceGroup.resources
					.some(scmResource =>
						this.uriIdentityService.extUri.isEqual(activeResource, scmResource.sourceUri))) {
					return true;
				}
			}
		}

		return false;
	}

	dispose(): void {
		this.disposables.dispose();
		dispose(this.repositoryDisposables.values());
		this.repositoryDisposables.clear();
		this.onDidRepositoryChange.dispose();
	}
}
