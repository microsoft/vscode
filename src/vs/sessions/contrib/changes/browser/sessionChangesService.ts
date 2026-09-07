/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IMultiDiffEditorOptions } from '../../../../editor/common/multiDiffEditor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../workbench/services/decorations/common/decorations.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { getSessionChangesFileCountLabel } from '../common/changes.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { SessionChangesEditorInput } from './sessionChangesEditorInput.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../common/sessionChangesService.js';
import { UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../services/sessions/common/session.js';

export { ISessionChangesService } from '../common/sessionChangesService.js';
export type { ISessionChangesEditorOptions } from '../common/sessionChangesService.js';

const CHANGES_MULTI_DIFF_SOURCE_SCHEME = 'changes-multi-diff-source';

interface IChangesMultiDiffUriFields {
	readonly sessionResource: string;
}

export class SessionChangesService extends Disposable implements ISessionChangesService {

	declare readonly _serviceBrand: undefined;
	readonly activeSessionUncommittedChangesCountObs: IObservable<number | undefined>;

	private readonly _onDidChangeDecorations = this._register(new Emitter<readonly URI[]>());

	private _decoratedResource: URI | undefined;
	private _decoratedChangeCount: number | undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IDecorationsService decorationsService: IDecorationsService,
	) {
		super();

		this.activeSessionUncommittedChangesCountObs = derived(this, reader => {
			if (changesViewService.activeSessionChangesetObs.read(reader)?.id !== UNCOMMITTED_CHANGES_CHANGESET_ID) {
				return undefined;
			}

			return changesViewService.activeSessionChangesObs.read(reader).length;
		});

		if (!layoutService.isSinglePaneLayoutEnabled) {
			return;
		}

		const provider = {
			label: localize('sessionChangesEditor.decorations', "Changes"),
			onDidChange: this._onDidChangeDecorations.event,
			provideDecorations: resource => this._provideDecoration(resource),
		} satisfies IDecorationsProvider;
		this._register(decorationsService.registerDecorationsProvider(provider));

		this._register(autorun(reader => {
			const activeSessionResource = changesViewService.activeSessionResourceObs.read(reader);
			const changeCount = this.activeSessionUncommittedChangesCountObs.read(reader);
			const resource = activeSessionResource ? this.getChangesEditorResource(activeSessionResource) : undefined;
			if (isEqual(this._decoratedResource, resource) && this._decoratedChangeCount === changeCount) {
				return;
			}

			const affectedResources: URI[] = [];
			if (this._decoratedResource) {
				affectedResources.push(this._decoratedResource);
			}
			if (resource && !isEqual(this._decoratedResource, resource)) {
				affectedResources.push(resource);
			}

			this._decoratedResource = resource;
			this._decoratedChangeCount = changeCount;
			if (affectedResources.length > 0) {
				this._onDidChangeDecorations.fire(affectedResources);
			}
		}));
	}

	getChangesEditorResource(sessionResource: URI): URI {
		return URI.from({
			scheme: CHANGES_MULTI_DIFF_SOURCE_SCHEME,
			query: JSON.stringify({ sessionResource: sessionResource.toString() } satisfies IChangesMultiDiffUriFields),
		});
	}

	getSessionResource(editorResource: URI): URI | undefined {
		if (editorResource.scheme !== CHANGES_MULTI_DIFF_SOURCE_SCHEME) {
			return undefined;
		}

		let fields: IChangesMultiDiffUriFields;
		try {
			fields = JSON.parse(editorResource.query) as IChangesMultiDiffUriFields;
		} catch {
			return undefined;
		}

		if (typeof fields !== 'object' || fields === null || typeof fields.sessionResource !== 'string') {
			return undefined;
		}

		return URI.parse(fields.sessionResource);
	}

	async openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions, group?: PreferredGroup): Promise<IEditorGroup | undefined> {
		if (options?.changesetSelection) {
			if (options.changesetSelection.kind === 'transient') {
				this.changesViewService.showChangeset(options.changesetSelection.changeset);
			} else {
				this.changesViewService.setChangesetId(options.changesetSelection.id);
			}
		}
		let editorOptions: IMultiDiffEditorOptions | undefined;
		if (options) {
			const { changesetSelection: _, ...optionsWithoutSelection } = options;
			editorOptions = optionsWithoutSelection;
		}
		const multiDiffSource = this.getChangesEditorResource(sessionResource);

		if (this.layoutService.isSinglePaneLayoutEnabled) {
			const input = this.instantiationService.createInstance(SessionChangesEditorInput, multiDiffSource);
			const pane = await this.editorService.openEditor(input, { ...editorOptions, pinned: true }, group);
			await this.expandRevealTarget(pane?.input, editorOptions);
			return pane?.group;
		}

		const pane = await this.editorService.openEditor({
			multiDiffSource,
			label: localize('sessions.changes.title', 'Session Changes'),
			options: editorOptions,
		}, group);
		await this.expandRevealTarget(pane?.input, editorOptions);
		return pane?.group;
	}

	private _provideDecoration(resource: URI): IDecorationData | undefined {
		if (!this._decoratedChangeCount || !isEqual(resource, this._decoratedResource)) {
			return undefined;
		}

		return {
			weight: 100,
			letter: this._decoratedChangeCount < 10 ? this._decoratedChangeCount.toString() : '9+',
			tooltip: getSessionChangesFileCountLabel(this._decoratedChangeCount),
		};
	}

	private async expandRevealTarget(input: EditorInput | undefined, options: IMultiDiffEditorOptions | undefined): Promise<void> {
		const resource = options?.viewState?.revealData?.resource;
		if (!resource || !(input instanceof SessionChangesEditorInput || input instanceof MultiDiffEditorInput)) {
			return;
		}

		const viewModel = await input.getViewModel();
		const item = viewModel.items.get().find(item =>
			isEqual(item.originalUri, resource.original) && isEqual(item.modifiedUri, resource.modified));
		if (item) {
			viewModel.expand(item);
		}
	}
}
