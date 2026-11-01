/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INotebookService } from '../common/notebookService.js';

/** Minimal service contract for features that can run without notebook support. */
class DisabledNotebookService implements INotebookService {
	declare readonly _serviceBrand: undefined;

	readonly onAddViewType = Event.None;
	readonly onWillRemoveViewType = Event.None;
	readonly onDidChangeOutputRenderers = Event.None;
	readonly onWillAddNotebookDocument = Event.None;
	readonly onDidAddNotebookDocument = Event.None;
	readonly onWillRemoveNotebookDocument = Event.None;
	readonly onDidRemoveNotebookDocument = Event.None;

	canResolve(..._args: Parameters<INotebookService['canResolve']>): ReturnType<INotebookService['canResolve']> {
		return Promise.resolve(false);
	}

	registerNotebookSerializer(..._args: Parameters<INotebookService['registerNotebookSerializer']>): ReturnType<INotebookService['registerNotebookSerializer']> {
		return toDisposable(() => undefined);
	}

	withNotebookDataProvider(..._args: Parameters<INotebookService['withNotebookDataProvider']>): ReturnType<INotebookService['withNotebookDataProvider']> {
		return Promise.reject(new Error('Notebook support is disabled in this build.'));
	}

	tryGetDataProviderSync(..._args: Parameters<INotebookService['tryGetDataProviderSync']>): ReturnType<INotebookService['tryGetDataProviderSync']> {
		return undefined;
	}

	getOutputMimeTypeInfo(..._args: Parameters<INotebookService['getOutputMimeTypeInfo']>): ReturnType<INotebookService['getOutputMimeTypeInfo']> {
		return [];
	}

	getViewTypeProvider(..._args: Parameters<INotebookService['getViewTypeProvider']>): ReturnType<INotebookService['getViewTypeProvider']> {
		return undefined;
	}

	getRendererInfo(..._args: Parameters<INotebookService['getRendererInfo']>): ReturnType<INotebookService['getRendererInfo']> {
		return undefined;
	}

	getRenderers(..._args: Parameters<INotebookService['getRenderers']>): ReturnType<INotebookService['getRenderers']> {
		return [];
	}

	getStaticPreloads(..._args: Parameters<INotebookService['getStaticPreloads']>): ReturnType<INotebookService['getStaticPreloads']> {
		return [];
	}

	updateMimePreferredRenderer(..._args: Parameters<INotebookService['updateMimePreferredRenderer']>): ReturnType<INotebookService['updateMimePreferredRenderer']> { }
	saveMimeDisplayOrder(..._args: Parameters<INotebookService['saveMimeDisplayOrder']>): ReturnType<INotebookService['saveMimeDisplayOrder']> { }

	createNotebookTextModel(..._args: Parameters<INotebookService['createNotebookTextModel']>): ReturnType<INotebookService['createNotebookTextModel']> {
		return Promise.reject(new Error('Notebook support is disabled in this build.'));
	}

	createNotebookTextDocumentSnapshot(..._args: Parameters<INotebookService['createNotebookTextDocumentSnapshot']>): ReturnType<INotebookService['createNotebookTextDocumentSnapshot']> {
		return Promise.reject(new Error('Notebook support is disabled in this build.'));
	}

	restoreNotebookTextModelFromSnapshot(..._args: Parameters<INotebookService['restoreNotebookTextModelFromSnapshot']>): ReturnType<INotebookService['restoreNotebookTextModelFromSnapshot']> {
		return Promise.reject(new Error('Notebook support is disabled in this build.'));
	}

	getNotebookTextModel(..._args: Parameters<INotebookService['getNotebookTextModel']>): ReturnType<INotebookService['getNotebookTextModel']> {
		return undefined;
	}

	getNotebookTextModels(..._args: Parameters<INotebookService['getNotebookTextModels']>): ReturnType<INotebookService['getNotebookTextModels']> {
		return [];
	}

	listNotebookDocuments(..._args: Parameters<INotebookService['listNotebookDocuments']>): ReturnType<INotebookService['listNotebookDocuments']> {
		return [];
	}

	registerContributedNotebookType(..._args: Parameters<INotebookService['registerContributedNotebookType']>): ReturnType<INotebookService['registerContributedNotebookType']> {
		return toDisposable(() => undefined);
	}

	getContributedNotebookType(..._args: Parameters<INotebookService['getContributedNotebookType']>): ReturnType<INotebookService['getContributedNotebookType']> {
		return undefined;
	}

	getContributedNotebookTypes(..._args: Parameters<INotebookService['getContributedNotebookTypes']>): ReturnType<INotebookService['getContributedNotebookTypes']> {
		return [];
	}

	hasSupportedNotebooks(..._args: Parameters<INotebookService['hasSupportedNotebooks']>): ReturnType<INotebookService['hasSupportedNotebooks']> {
		return false;
	}

	getNotebookProviderResourceRoots(..._args: Parameters<INotebookService['getNotebookProviderResourceRoots']>): ReturnType<INotebookService['getNotebookProviderResourceRoots']> {
		return [];
	}

	setToCopy(..._args: Parameters<INotebookService['setToCopy']>): ReturnType<INotebookService['setToCopy']> { }

	getToCopy(..._args: Parameters<INotebookService['getToCopy']>): ReturnType<INotebookService['getToCopy']> {
		return undefined;
	}

	clearEditorCache(..._args: Parameters<INotebookService['clearEditorCache']>): ReturnType<INotebookService['clearEditorCache']> { }
}

registerSingleton(INotebookService, DisabledNotebookService, InstantiationType.Delayed);
