/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IModelService } from 'vs/editor/common/services/modelService';
import URI from 'vs/base/common/uri';
import { dispose } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IModel } from 'vs/editor/common/editorCommon';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/platform/textmodelResolver/common/resolver';
import { IDirtyDiffTextDocumentProvider, IDirtyDiffService } from 'vs/workbench/services/scm/common/dirtydiff';
import { IGitService, StatusType, ServiceEvents, ServiceOperations, ServiceState } from 'vs/workbench/parts/git/common/git';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class GitContentProvider implements IWorkbenchContribution, ITextModelContentProvider, IDirtyDiffTextDocumentProvider {

	constructor(
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IModelService private modelService: IModelService,
		@IDirtyDiffService private dirtyDiffService: IDirtyDiffService,
		@IGitService private gitService: IGitService
	) {
		this.dirtyDiffService.registerDirtyDiffTextDocumentProvider(this);
		textModelResolverService.registerTextModelContentProvider('git-index', this);
	}

	getDirtyDiffTextDocument(resource: URI): TPromise<URI> {
		return TPromise.as(resource.with({ scheme: 'git-index' }));
	}

	provideTextContent(uri: URI): TPromise<IModel> {
		if (uri.scheme !== 'git-index') {
			return null;
		}

		const gitModel = this.gitService.getModel();
		const path = uri.fsPath;
		const treeish = gitModel.getStatus().find(path, StatusType.INDEX) ? '~' : 'HEAD';

		return this.gitService.buffer(path, treeish)
			.then(contents => this.modelService.createModel(contents, null, uri))
			.then(model => {
				const trigger = () => {
					this.gitService.buffer(path, treeish).
						then(contents => model.setValue(contents))
						.done(null, onUnexpectedError);
				};

				const onChanges = () => {
					if (this.gitService.getState() !== ServiceState.OK) {
						return;
					}

					trigger();
				};

				const disposables = [
					this.gitService.addListener2(ServiceEvents.STATE_CHANGED, onChanges),
					this.gitService.addListener2(ServiceEvents.OPERATION_END, e => {
						if (e.operation.id !== ServiceOperations.BACKGROUND_FETCH) {
							onChanges();
						}
					})
				];

				model.onWillDispose(() => {
					dispose(disposables);
				});

				return model;
			});
	}

	getId(): string {
		return 'git.contentprovider';
	}
}