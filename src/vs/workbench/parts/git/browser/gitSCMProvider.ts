/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import * as path from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ISCMResourceGroup, ISCMResource } from 'vs/workbench/services/scm/common/scm';
import { SCMProvider } from 'vs/workbench/services/scm/common/scmProvider';
import { IGitService, ModelEvents } from 'vs/workbench/parts/git/common/git';

export class GitSCMProvider extends SCMProvider {

	private merge: ISCMResourceGroup;
	private index: ISCMResourceGroup;
	private workingTree: ISCMResourceGroup;

	constructor(
		@IGitService private gitService: IGitService
	) {
		super('git', 'Git');

		this.merge = this.createResourceGroup('merge', localize('merge conflicts', "Merge Conflicts"));
		this.index = this.createResourceGroup('index', localize('staged changes', "Staged Changes"));
		this.workingTree = this.createResourceGroup('workingtree', localize('changes', "Changes"));

		const model = gitService.getModel();
		model.addListener2(ModelEvents.MODEL_UPDATED, () => this.onModelChange());
	}

	private onModelChange(): void {
		const model = this.gitService.getModel();
		const root = model.getRepositoryRoot();

		const status = model.getStatus();
		const mergeStatus = status.getMergeStatus();
		const indexStatus = status.getIndexStatus();
		const workingTreeStatus = status.getWorkingTreeStatus();

		const toResource = status => ({ uri: URI.file(path.join(root, status.getPath())) });

		const mergeResources = mergeStatus.all().map(toResource);
		const indexResources = indexStatus.all().map(toResource);
		const workingTreeResources = workingTreeStatus.all().map(toResource);

		this.merge.set(...mergeResources);
		this.index.set(...indexResources);
		this.workingTree.set(...workingTreeResources);
	}

	commit(message: string): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	open(resource: ISCMResource): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	drag(from: ISCMResource, to: ISCMResource): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		return TPromise.wrapError<URI>('getOriginalResource not implemented');
	}
}