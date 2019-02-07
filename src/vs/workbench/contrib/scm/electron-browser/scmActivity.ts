/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { basename } from 'vs/base/common/paths';
import { IDisposable, dispose, Disposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { commonPrefixLength } from 'vs/base/common/strings';
import { ILogService } from 'vs/platform/log/common/log';

export class StatusUpdater implements IWorkbenchContribution {

	private badgeDisposable: IDisposable = Disposable.None;
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private readonly scmService: ISCMService,
		@IActivityService private readonly activityService: IActivityService,
		@ILogService private readonly logService: ILogService
	) {
		for (const repository of this.scmService.repositories) {
			this.onDidAddRepository(repository);
		}

		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		this.render();
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const provider = repository.provider;
		const onDidChange = Event.any(provider.onDidChange, provider.onDidChangeResources);
		const changeDisposable = onDidChange(() => this.render());

		const onDidRemove = Event.filter(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);
			this.render();
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);
	}

	private render(): void {
		this.badgeDisposable.dispose();

		const count = this.scmService.repositories.reduce((r, repository) => {
			if (typeof repository.provider.count === 'number') {
				return r + repository.provider.count;
			} else {
				return r + repository.provider.groups.elements.reduce<number>((r, g) => r + g.elements.length, 0);
			}
		}, 0);

		// TODO@joao: remove
		this.logService.trace('SCM#StatusUpdater.render', count);

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('scmPendingChangesBadge', '{0} pending changes', num));
			this.badgeDisposable = this.activityService.showActivity(VIEWLET_ID, badge, 'scm-viewlet-label');
		} else {
			this.badgeDisposable = Disposable.None;
		}
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class StatusBarController implements IWorkbenchContribution {

	private statusBarDisposable: IDisposable = Disposable.None;
	private focusDisposable: IDisposable = Disposable.None;
	private focusedRepository: ISCMRepository | undefined = undefined;
	private focusedProviderContextKey: IContextKey<string | undefined>;
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private readonly scmService: ISCMService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService
	) {
		this.focusedProviderContextKey = contextKeyService.createKey<string | undefined>('scmProvider', undefined);
		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);

		for (const repository of this.scmService.repositories) {
			this.onDidAddRepository(repository);
		}

		editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.disposables);
	}

	private onDidActiveEditorChange(): void {
		if (!this.editorService.activeEditor) {
			return;
		}

		const resource = this.editorService.activeEditor.getResource();

		if (!resource || resource.scheme !== 'file') {
			return;
		}

		let bestRepository: ISCMRepository | null = null;
		let bestMatchLength = Number.NEGATIVE_INFINITY;

		for (const repository of this.scmService.repositories) {
			const root = repository.provider.rootUri;

			if (!root) {
				continue;
			}

			const rootFSPath = root.fsPath;
			const prefixLength = commonPrefixLength(rootFSPath, resource.fsPath);

			if (prefixLength === rootFSPath.length && prefixLength > bestMatchLength) {
				bestRepository = repository;
				bestMatchLength = prefixLength;
			}
		}

		if (bestRepository) {
			this.onDidFocusRepository(bestRepository);
		}
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const changeDisposable = repository.onDidFocus(() => this.onDidFocusRepository(repository));
		const onDidRemove = Event.filter(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);

			if (this.scmService.repositories.length === 0) {
				this.onDidFocusRepository(undefined);
			} else if (this.focusedRepository === repository) {
				this.scmService.repositories[0].focus();
			}
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);

		if (!this.focusedRepository) {
			this.onDidFocusRepository(repository);
		}
	}

	private onDidFocusRepository(repository: ISCMRepository | undefined): void {
		if (this.focusedRepository === repository) {
			return;
		}

		this.focusedRepository = repository;
		this.focusedProviderContextKey.set(repository && repository.provider.id);
		this.focusDisposable.dispose();

		if (repository && repository.provider.onDidChangeStatusBarCommands) {
			this.focusDisposable = repository.provider.onDidChangeStatusBarCommands(() => this.render(repository));
		}

		this.render(repository);
	}

	private render(repository: ISCMRepository | undefined): void {
		this.statusBarDisposable.dispose();

		if (!repository) {
			return;
		}

		const commands = repository.provider.statusBarCommands || [];
		const label = repository.provider.rootUri
			? `${basename(repository.provider.rootUri.fsPath)} (${repository.provider.label})`
			: repository.provider.label;

		const disposables = commands.map(c => this.statusbarService.addEntry({
			text: c.title,
			tooltip: `${label} - ${c.tooltip}`,
			command: c.id,
			arguments: c.arguments
		}, MainThreadStatusBarAlignment.LEFT, 10000));

		this.statusBarDisposable = combinedDisposable(disposables);
	}

	dispose(): void {
		this.focusDisposable.dispose();
		this.statusBarDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}
