/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import Severity from '../../../../../base/common/severity.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';

export const PICK_REPOSITORY_COMMAND_ID = '_chat.pickRepository';

export interface IRepositoryPickerOptions {
	readonly allowRepositoryUrl?: boolean;
}

export interface IRepositoryPickResult {
	readonly repository?: string;
	readonly cloneUrl?: string;
}

type RepositoryQuickPickItem = IQuickPickItem & IRepositoryPickResult;

/** The repository picker shared by extension-backed cloud sessions and browser session creation. */
export class RepositoryPicker extends Disposable {

	private readonly _currentPick = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async pickRepository(
		getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>,
		options: IRepositoryPickerOptions = {},
		token: CancellationToken = CancellationToken.None,
	): Promise<IRepositoryPickResult | undefined> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			return undefined;
		}

		const store = new DisposableStore();
		this._currentPick.value = store;
		const pickToken = cancelOnDispose(store);
		const requests = store.add(new DisposableStore());
		const quickPick = store.add(this.quickInputService.createQuickPick<RepositoryQuickPickItem>());
		quickPick.placeholder = options.allowRepositoryUrl
			? localize('repositoryPicker.searchOrUrl', "Search for a repository or paste a repository URL...")
			: localize('repositoryPicker.search', "Search for a repository...");
		quickPick.ariaLabel = quickPick.placeholder;
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;

		const updateItems = async () => {
			requests.clear();
			const requestToken = cancelOnDispose(requests);
			const query = quickPick.value;
			quickPick.busy = true;
			try {
				const repositories = await raceCancellationError(getRepositories(query, requestToken), requestToken);
				if (!requestToken.isCancellationRequested) {
					quickPick.items = getRepositoryQuickPickItems(repositories, query, options.allowRepositoryUrl === true);
				}
			} catch (error) {
				if (!requestToken.isCancellationRequested && !isCancellationError(error)) {
					this.logService.error('Error fetching repositories', error);
					quickPick.items = getRepositoryQuickPickItems([], query, options.allowRepositoryUrl === true);
					quickPick.validationMessage = localize('repositoryPicker.loadFailed', "Could not load repositories. Check your GitHub sign-in and connection, then try searching again.");
					quickPick.severity = Severity.Error;
				}
			} finally {
				if (!requestToken.isCancellationRequested) {
					quickPick.busy = false;
				}
			}
		};
		const search = store.add(new RunOnceScheduler(() => void updateItems(), 300));

		try {
			return await new Promise<IRepositoryPickResult | undefined>(resolve => {
				let finished = false;
				const finish = (result?: IRepositoryPickResult) => {
					if (finished) {
						return;
					}
					finished = true;
					search.cancel();
					requests.clear();
					resolve(result);
					quickPick.hide();
				};
				store.add(token.onCancellationRequested(() => finish()));
				store.add(pickToken.onCancellationRequested(() => finish()));
				store.add(quickPick.onDidHide(() => finish()));
				store.add(quickPick.onDidChangeValue(() => {
					requests.clear();
					quickPick.items = [];
					quickPick.selectedItems = [];
					quickPick.validationMessage = undefined;
					quickPick.severity = Severity.Ignore;
					quickPick.busy = true;
					search.schedule();
				}));
				store.add(quickPick.onDidAccept(() => {
					const selected = quickPick.selectedItems[0];
					if (!quickPick.busy && selected && quickPick.items.includes(selected)) {
						finish(selected.cloneUrl ? { cloneUrl: selected.cloneUrl } : { repository: selected.repository });
					}
				}));
				quickPick.show();
				if (!finished) {
					void updateItems();
				}
			});
		} finally {
			store.dispose();
			if (this._currentPick.value === store) {
				this._currentPick.clear();
			}
		}
	}
}

function getRepositoryQuickPickItems(repositories: readonly string[], value: string, allowRepositoryUrl: boolean): RepositoryQuickPickItem[] {
	const repositoryUrl = value.trim();
	const canCloneUrl = allowRepositoryUrl
		&& (/^(?:https?|ssh|git):\/\/\S+$/i.test(repositoryUrl) || /^[^@\s]+@[^:\s]+:\S+$/.test(repositoryUrl));
	return [
		...(canCloneUrl ? [{
			label: localize('repositoryPicker.clone', "Clone from URL"),
			description: repositoryUrl,
			cloneUrl: repositoryUrl,
		}] : []),
		...[...repositories].sort((a, b) => a.localeCompare(b)).map(repository => ({ label: repository, repository })),
	];
}
