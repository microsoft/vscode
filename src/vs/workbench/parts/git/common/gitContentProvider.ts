/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IModelService } from 'vs/editor/common/services/modelService';
import URI from 'vs/base/common/uri';
import { dispose } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/paths';
import { Throttler } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IBaselineResourceProvider, ISCMService } from 'vs/workbench/services/scm/common/scm';
import { IGitService, StatusType, ServiceEvents, ServiceOperations, ServiceState } from 'vs/workbench/parts/git/common/git';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class GitContentProvider implements IWorkbenchContribution, ITextModelContentProvider, IBaselineResourceProvider {

	constructor(
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IModelService private modelService: IModelService,
		@ISCMService private scmService: ISCMService,
		@IGitService private gitService: IGitService
	) {
		this.scmService.registerBaselineResourceProvider(this);
		textModelResolverService.registerTextModelContentProvider('git-index', this);
	}

	getBaselineResource(resource: URI): TPromise<URI> {
		return TPromise.as(resource.with({ scheme: 'git-index' }));
	}

	provideTextContent(uri: URI): TPromise<IModel> {
		const model = this.modelService.createModel('', null, uri);
		const throttler = new Throttler();

		const updateModel = () => {
			const gitModel = this.gitService.getModel();
			const root = gitModel.getRepositoryRoot();

			if (!root) {
				return TPromise.as(null);
			}

			const path = uri.fsPath;
			const relativePath = paths.relative(root, path);
			const treeish = gitModel.getStatus().find(relativePath, StatusType.INDEX) ? '~' : 'HEAD';

			return this.gitService.buffer(path, treeish)
				.then(contents => model.setValue(contents || ''));
		};

		const triggerModelUpdate = () => {
			if (this.gitService.getState() !== ServiceState.OK) {
				return;
			}

			throttler.queue(updateModel);
		};

		const disposables = [
			this.gitService.addListener2(ServiceEvents.STATE_CHANGED, triggerModelUpdate),
			this.gitService.addListener2(ServiceEvents.OPERATION_END, e => {
				if (e.operation.id !== ServiceOperations.BACKGROUND_FETCH) {
					triggerModelUpdate();
				}
			})
		];

		model.onWillDispose(() => dispose(disposables));
		triggerModelUpdate();

		return TPromise.as(model);
	}

	getId(): string {
		return 'git.contentprovider';
	}
}