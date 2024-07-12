/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { observableFromEvent, waitForState } from 'vs/base/common/observable';
import { ValueWithChangeEventFromObservable } from 'vs/base/common/observableInternal/utils';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl';
import { localize2 } from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyValue } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
import { ISCMRepository, ISCMResourceGroup, ISCMService } from 'vs/workbench/contrib/scm/common/scm';
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

		let query: UriFields;
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
		const repository = await waitForState(observableFromEvent(this,
			this._scmService.onDidAddRepository,
			() => [...this._scmService.repositories].find(r => r.provider.rootUri?.toString() === repositoryUri.toString()))
		);
		const group = await waitForState(observableFromEvent(this,
			repository.provider.onDidChangeResourceGroups,
			() => repository.provider.groups.find(g => g.id === groupId)
		));
		return new ScmResolvedMultiDiffSource(group, repository);
	}
}

class ScmResolvedMultiDiffSource implements IResolvedMultiDiffSource {
	private readonly _resources = observableFromEvent<MultiDiffEditorItem[]>(
		this._group.onDidChangeResources,
		() => /** @description resources */ this._group.resources.map(e => new MultiDiffEditorItem(e.multiDiffEditorOriginalUri, e.multiDiffEditorModifiedUri, e.sourceUri))
	);
	readonly resources = new ValueWithChangeEventFromObservable(this._resources);

	public readonly contextKeys: Record<string, ContextKeyValue> = {
		scmResourceGroup: this._group.id,
		scmProvider: this._repository.provider.contextValue,
	};

	constructor(
		private readonly _group: ISCMResourceGroup,
		private readonly _repository: ISCMRepository,
	) { }
}

interface UriFields {
	repositoryUri: string;
	groupId: string;
}

export class ScmMultiDiffSourceResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.scmMultiDiffSourceResolver';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
	) {
		super();

		this._register(multiDiffSourceResolverService.registerResolver(instantiationService.createInstance(ScmMultiDiffSourceResolver)));
	}
}

interface OpenScmGroupActionOptions {
	title: string;
	repositoryUri: UriComponents;
	resourceGroupId: string;
}

export class OpenScmGroupAction extends Action2 {
	public static async openMultiFileDiffEditor(editorService: IEditorService, label: string, repositoryRootUri: URI | undefined, resourceGroupId: string, options?: IMultiDiffEditorOptions) {
		if (!repositoryRootUri) {
			return;
		}

		const multiDiffSource = ScmMultiDiffSourceResolver.getMultiDiffSourceUri(repositoryRootUri.toString(), resourceGroupId);
		return await editorService.openEditor({ label, multiDiffSource, options });
	}

	constructor() {
		super({
			id: '_workbench.openScmMultiDiffEditor',
			title: localize2('viewChanges', 'View Changes'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, options: OpenScmGroupActionOptions): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await OpenScmGroupAction.openMultiFileDiffEditor(editorService, options.title, URI.revive(options.repositoryUri), options.resourceGroupId);
	}
}
