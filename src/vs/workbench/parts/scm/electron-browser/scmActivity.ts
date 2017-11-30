/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { basename } from 'vs/base/common/paths';
import { IDisposable, dispose, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { filterEvent, anyEvent as anyEvent } from 'vs/base/common/event';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';

export class StatusUpdater implements IWorkbenchContribution {

	private badgeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private scmService: ISCMService,
		@IActivityService private activityService: IActivityService
	) {
		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		this.render();
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const provider = repository.provider;
		const onDidChange = anyEvent(provider.onDidChange, provider.onDidChangeResources);
		const changeDisposable = onDidChange(() => this.render());

		const onDidRemove = filterEvent(this.scmService.onDidRemoveRepository, e => e === repository);
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

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('scmPendingChangesBadge', '{0} pending changes', num));
			this.badgeDisposable = this.activityService.showActivity(VIEWLET_ID, badge, 'scm-viewlet-label');
		} else {
			this.badgeDisposable = EmptyDisposable;
		}
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class StatusBarController implements IWorkbenchContribution {

	private statusBarDisposable: IDisposable = EmptyDisposable;
	private focusDisposable: IDisposable = EmptyDisposable;
	private focusedRepository: ISCMRepository | undefined = undefined;
	private focusedProviderContextKey: IContextKey<string | undefined>;
	private disposables: IDisposable[] = [];

	constructor(
		@ISCMService private scmService: ISCMService,
		@IStatusbarService private statusbarService: IStatusbarService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.focusedProviderContextKey = contextKeyService.createKey<string | undefined>('scmProvider', void 0);
		this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);

		if (this.scmService.repositories.length > 0) {
			this.onDidFocusRepository(this.scmService.repositories[0]);
		}
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const changeDisposable = repository.onDidFocus(() => this.onDidFocusRepository(repository));
		const onDidRemove = filterEvent(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);

			if (this.scmService.repositories.length === 0) {
				this.focusedProviderContextKey.set(undefined);
			} else if (this.focusedRepository === repository) {
				this.scmService.repositories[0].focus();
			}
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);

		if (this.scmService.repositories.length === 1) {
			this.onDidFocusRepository(repository);
		}
	}

	private onDidFocusRepository(repository: ISCMRepository): void {
		if (this.focusedRepository !== repository) {
			this.focusedRepository = repository;
			this.focusedProviderContextKey.set(repository.provider.id);
		}

		this.focusDisposable.dispose();
		this.focusDisposable = repository.provider.onDidChange(() => this.render(repository));
		this.render(repository);
	}

	private render(repository: ISCMRepository): void {
		this.statusBarDisposable.dispose();

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
