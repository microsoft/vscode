/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize, localize2 } from 'vs/nls';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { ISCMResourceGroup, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ScmMultiDiffSourceResolver implements IMultiDiffSourceResolver {
	private static readonly _scheme = 'scm-multi-diff-source';

	public static getMultiDiffSourceUri(repositoryUri: string, groupId: string): URI {
		return URI.from({
			scheme: ScmMultiDiffSourceResolver._scheme,
			query: JSON.stringify({ repositoryUri, groupId } satisfies UriFields),
		});
	}

	private static parseUri(uri: URI): { repositoryUri: URI; groupId: string } | undefined {
		if (uri.scheme !== ScmMultiDiffSourceResolver._scheme) {
			return undefined;
		}

		let query: any;
		try {
			query = JSON.parse(uri.query) as UriFields;
		} catch (e) {
			return undefined;
		}

		if (typeof query !== 'object' || query === null) {
			return undefined;
		}

		const { repositoryUri, groupId } = query;
		if (typeof repositoryUri !== 'string' || typeof groupId !== 'string') {
			return undefined;
		}

		return { repositoryUri: URI.parse(repositoryUri), groupId };
	}

	constructor(
		@ISCMService private readonly _scmService: ISCMService,
	) {
	}

	canHandleUri(uri: URI): boolean {
		return ScmMultiDiffSourceResolver.parseUri(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const { repositoryUri, groupId } = ScmMultiDiffSourceResolver.parseUri(uri)!;

		const repository = await promiseFromEventState(
			this._scmService.onDidAddRepository,
			() => {
				const repository = [...this._scmService.repositories].find(r => r.provider.rootUri?.toString() === repositoryUri.toString());
				return repository ?? false;
			}
		);

		const group = await promiseFromEventState(
			repository.provider.onDidChangeResourceGroups,
			() => {
				const group = repository.provider.groups.find(g => g.id === groupId);
				return group ?? false;
			}
		);

		return {
			get resources() {
				return group.resources.map(e => ({
					original: e.multiFileDiffEditorOriginalUri,
					modified: e.multiFileDiffEditorModifiedUri
				}));
			},
			onDidChange: e => group.onDidChangeResources(() => e()),
			contextKeys: {
				scmResourceGroup: groupId,
				scmProvider: repository.provider.contextValue,
			},
		};
	}
}

interface UriFields {
	repositoryUri: string;
	groupId: string;
}

function promiseFromEventState<T>(event: Event<any>, checkState: () => T | false): Promise<T> {
	const state = checkState();
	if (state) {
		return Promise.resolve(state);
	}

	return new Promise<T>(resolve => {
		const listener = event(() => {
			const state = checkState();
			if (state) {
				listener.dispose();
				resolve(state);
			}
		});
	});
}

export class ScmMultiDiffSourceResolverContribution extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
	) {
		super();

		this._register(multiDiffSourceResolverService.registerResolver(instantiationService.createInstance(ScmMultiDiffSourceResolver)));
	}
}

export class OpenScmGroupAction extends Action2 {
	constructor() {
		super({
			id: 'multiDiffEditor.openScmDiff',
			title: localize2('viewChanges', 'View Changes'),
			icon: Codicon.diffMultiple,
			menu: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.has('config.multiDiffEditor.experimental.enabled'),
					ContextKeyExpr.has('multiDiffEditorEnableViewChanges'),
				),
				id: MenuId.SCMResourceGroupContext,
				group: 'inline',
			},
			f1: false,
		});
	}

	async run(accessor: ServicesAccessor, group: ISCMResourceGroup): Promise<void> {
		const editorService = accessor.get(IEditorService);
		if (!group.provider.rootUri) {
			return;
		}

		const multiDiffSource = ScmMultiDiffSourceResolver.getMultiDiffSourceUri(group.provider.rootUri.toString(), group.id);
		const label = localize('scmDiffLabel', '{0}: {1}', group.provider.label, group.label);
		await editorService.openEditor({ label, multiDiffSource });
	}
}
