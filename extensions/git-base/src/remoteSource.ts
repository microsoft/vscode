/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window, QuickPick, QuickPickItemKind, l10n, Disposable } from 'vscode';
import { RemoteSourceProvider, RemoteSource, PickRemoteSourceOptions, PickRemoteSourceResult, RemoteSourceAction } from './api/git-base';
import { Model } from './model';
import { throttle, debounce } from './decorators';

async function getQuickPickResult<T extends QuickPickItem>(quickpick: QuickPick<T>): Promise<T | undefined> {
	const listeners: Disposable[] = [];
	const result = await new Promise<T | undefined>(c => {
		listeners.push(
			quickpick.onDidAccept(() => c(quickpick.selectedItems[0])),
			quickpick.onDidHide(() => c(undefined)),
		);
		quickpick.show();
	});

	quickpick.hide();
	listeners.forEach(l => l.dispose());
	return result;
}

class RemoteSourceProviderQuickPick implements Disposable {

	private disposables: Disposable[] = [];
	private isDisposed: boolean = false;

	private quickpick: QuickPick<QuickPickItem & { remoteSource?: RemoteSource }> | undefined;

	constructor(private provider: RemoteSourceProvider) { }

	dispose() {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		this.quickpick = undefined;
		this.isDisposed = true;
	}

	private ensureQuickPick() {
		if (!this.quickpick) {
			this.quickpick = window.createQuickPick();
			this.disposables.push(this.quickpick);
			this.quickpick.ignoreFocusOut = true;
			this.disposables.push(this.quickpick.onDidHide(() => this.dispose()));
			if (this.provider.supportsQuery) {
				this.quickpick.placeholder = this.provider.placeholder ?? l10n.t('Repository name (type to search)');
				this.disposables.push(this.quickpick.onDidChangeValue(this.onDidChangeValue, this));
			} else {
				this.quickpick.placeholder = this.provider.placeholder ?? l10n.t('Repository name');
			}
		}
	}

	@debounce(300)
	private onDidChangeValue(): void {
		this.query();
	}

	@throttle
	private async query(): Promise<void> {
		try {
			if (this.isDisposed) {
				return;
			}
			this.ensureQuickPick();
			this.quickpick!.busy = true;
			this.quickpick!.show();

			const remoteSources = await this.provider.getRemoteSources(this.quickpick?.value) || [];
			// The user may have cancelled the picker in the meantime
			if (this.isDisposed) {
				return;
			}

			if (remoteSources.length === 0) {
				this.quickpick!.items = [{
					label: l10n.t('No remote repositories found.'),
					alwaysShow: true
				}];
			} else {
				this.quickpick!.items = remoteSources.map(remoteSource => ({
					label: remoteSource.icon ? `$(${remoteSource.icon}) ${remoteSource.name}` : remoteSource.name,
					description: remoteSource.description || (typeof remoteSource.url === 'string' ? remoteSource.url : remoteSource.url[0]),
					detail: remoteSource.detail,
					remoteSource,
					alwaysShow: true
				}));
			}
		} catch (err) {
			this.quickpick!.items = [{ label: l10n.t('{0} Error: {1}', '$(error)', err.message), alwaysShow: true }];
			console.error(err);
		} finally {
			if (!this.isDisposed) {
				this.quickpick!.busy = false;
			}
		}
	}

	async pick(): Promise<RemoteSource | undefined> {
		await this.query();
		if (this.isDisposed) {
			return;
		}
		const result = await getQuickPickResult(this.quickpick!);
		return result?.remoteSource;
	}
}

export async function getRemoteSourceActions(model: Model, url: string): Promise<RemoteSourceAction[]> {
	const providers = model.getRemoteProviders();

	const remoteSourceActions = [];
	for (const provider of providers) {
		const providerActions = await provider.getRemoteSourceActions?.(url);
		if (providerActions?.length) {
			remoteSourceActions.push(...providerActions);
		}
	}

	return remoteSourceActions;
}

export async function pickRemoteSource(model: Model, options: PickRemoteSourceOptions & { branch?: false | undefined }): Promise<string | undefined>;
export async function pickRemoteSource(model: Model, options: PickRemoteSourceOptions & { branch: true }): Promise<PickRemoteSourceResult | undefined>;
export async function pickRemoteSource(model: Model, options: PickRemoteSourceOptions = {}): Promise<string | PickRemoteSourceResult | undefined> {
	const quickpick = window.createQuickPick<(QuickPickItem & { provider?: RemoteSourceProvider; url?: string })>();
	quickpick.title = options.title;

	if (options.providerName) {
		const provider = model.getRemoteProviders()
			.filter(provider => provider.name === options.providerName)[0];

		if (provider) {
			return await pickProviderSource(provider, options);
		}
	}

	const remoteProviders = model.getRemoteProviders()
		.map(provider => ({ label: (provider.icon ? `$(${provider.icon}) ` : '') + (options.providerLabel ? options.providerLabel(provider) : provider.name), alwaysShow: true, provider }));

	const recentSources: (QuickPickItem & { url?: string; timestamp: number })[] = [];
	if (options.showRecentSources) {
		for (const { provider } of remoteProviders) {
			const sources = (await provider.getRecentRemoteSources?.() ?? []).map((item) => {
				return {
					...item,
					label: (item.icon ? `$(${item.icon}) ` : '') + item.name,
					url: typeof item.url === 'string' ? item.url : item.url[0],
				};
			});
			recentSources.push(...sources);
		}
	}

	const items = [
		{ kind: QuickPickItemKind.Separator, label: l10n.t('remote sources') },
		...remoteProviders,
		{ kind: QuickPickItemKind.Separator, label: l10n.t('recently opened') },
		...recentSources.sort((a, b) => b.timestamp - a.timestamp)
	];

	quickpick.placeholder = options.placeholder ?? (remoteProviders.length === 0
		? l10n.t('Provide repository URL')
		: l10n.t('Provide repository URL or pick a repository source.'));

	const updatePicks = (value?: string) => {
		if (value) {
			const label = (typeof options.urlLabel === 'string' ? options.urlLabel : options.urlLabel?.(value)) ?? l10n.t('URL');
			quickpick.items = [{
				label: label,
				description: value,
				alwaysShow: true,
				url: value
			},
			...items
			];
		} else {
			quickpick.items = items;
		}
	};

	quickpick.onDidChangeValue(updatePicks);
	updatePicks();

	const result = await getQuickPickResult(quickpick);

	if (result) {
		if (result.url) {
			return result.url;
		} else if (result.provider) {
			return await pickProviderSource(result.provider, options);
		}
	}

	return undefined;
}

async function pickProviderSource(provider: RemoteSourceProvider, options: PickRemoteSourceOptions = {}): Promise<string | PickRemoteSourceResult | undefined> {
	const quickpick = new RemoteSourceProviderQuickPick(provider);
	const remote = await quickpick.pick();
	quickpick.dispose();

	let url: string | undefined;

	if (remote) {
		if (typeof remote.url === 'string') {
			url = remote.url;
		} else if (remote.url.length > 0) {
			url = await window.showQuickPick(remote.url, { ignoreFocusOut: true, placeHolder: l10n.t('Choose a URL to clone from.') });
		}
	}

	if (!url || !options.branch) {
		return url;
	}

	if (!provider.getBranches) {
		return { url };
	}

	const branches = await provider.getBranches(url);

	if (!branches) {
		return { url };
	}

	const branch = await window.showQuickPick(branches, {
		placeHolder: l10n.t('Branch name')
	});

	if (!branch) {
		return { url };
	}

	return { url, branch };
}
