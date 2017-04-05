/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { dispose } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { IModel } from 'vs/editor/common/editorCommon';
import { ISCMService, ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Throttler } from 'vs/base/common/async';
import * as paths from 'vs/base/common/paths';
import { IGitService, StatusType, ServiceEvents, ServiceOperations, ServiceState } from 'vs/workbench/parts/git/common/git';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

// TODO@Joao: remove
export class GitSCMProvider implements IWorkbenchContribution, ISCMProvider, ITextModelContentProvider {

	get id() { return 'git-internal'; }
	get label() { return 'Git'; }
	get resources() { return []; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	constructor(
		@ITextModelResolverService textModelResolverService: ITextModelResolverService,
		@IModelService private modelService: IModelService,
		@IGitService private gitService: IGitService,
		@ISCMService scmService: ISCMService
	) {
		scmService.registerSCMProvider(this);
		textModelResolverService.registerTextModelContentProvider('git', this);
	}

	getId(): string {
		return 'git.contentprovider';
	}

	open(uri: ISCMResource): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	acceptChanges(): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	drag(from: ISCMResource, to: ISCMResourceGroup): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (uri.scheme !== 'file') {
			return TPromise.as(null);
		}

		return TPromise.as(uri.with({ scheme: 'git' }));
	}

	provideTextContent(uri: URI): TPromise<IModel> {
		const model = this.modelService.createModel('', null, uri);
		const throttler = new Throttler();

		const setModelContents = contents => {
			if (model.isDisposed()) {
				return;
			}

			model.setValue(contents || '');
		};

		const updateModel = () => {
			const gitModel = this.gitService.getModel();
			const root = gitModel.getRepositoryRoot();

			if (!root) {
				return TPromise.as(null);
			}

			const path = uri.fsPath;
			const relativePath = paths.relative(root, path).replace(/\\/g, '/');

			if (/^\.\./.test(relativePath)) {
				return TPromise.as(null);
			}

			const treeish = gitModel.getStatus().find(relativePath, StatusType.INDEX) ? '~' : 'HEAD';

			return this.gitService.buffer(path, treeish).then(setModelContents);
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

	dispose(): void {

	}
}