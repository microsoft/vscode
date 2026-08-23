/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IEditorService, PreferredGroup } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionChangeset } from '../../../services/sessions/common/session.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { SessionChangesEditorInput } from './sessionChangesEditorInput.js';

export const ISessionChangesService = createDecorator<ISessionChangesService>('sessionChangesService');

/** Options for opening a session Changes editor with an optional changeset selection. */
export interface ISessionChangesEditorOptions extends IMultiDiffEditorOptions {
	readonly changesetSelection?:
	| { readonly kind: 'id'; readonly id: string | undefined }
	| { readonly kind: 'transient'; readonly changeset: ISessionChangeset };
}

/**
 * Owns the identity of a session's **Changes** (multi-file diff) editor. It is
 * the single source of truth for the `changes-multi-diff-source:` resource that
 * the multi-diff editor is opened with, so callers don't have to know the URI
 * shape: the session header action and the Changes view open the editor with
 * {@link openChangesEditor}, the layout controller recognizes the active
 * editor as a Changes editor with {@link getSessionResource}, and the
 * multi-diff source resolver uses both.
 */
export interface ISessionChangesService {
	readonly _serviceBrand: undefined;

	/**
	 * Build the multi-diff source URI that identifies the Changes editor for a
	 * session. Opening an editor with this resource shows the session's changes;
	 * reusing the same URI reuses the same editor input while the resource list
	 * updates reactively.
	 */
	getChangesEditorResource(sessionResource: URI): URI;

	/**
	 * If the given editor resource identifies a session Changes editor (one built
	 * by {@link getChangesEditorResource}), return the session it belongs to;
	 * otherwise `undefined`.
	 */
	getSessionResource(editorResource: URI): URI | undefined;

	/**
	 * Open the Changes editor for a session. In the single-pane layout this opens
	 * the custom {@link SessionChangesEditorInput}; otherwise a plain multi-diff editor.
	 */
	openChangesEditor(sessionResource: URI, options?: ISessionChangesEditorOptions, group?: PreferredGroup): Promise<IEditorGroup | undefined>;
}

const CHANGES_MULTI_DIFF_SOURCE_SCHEME = 'changes-multi-diff-source';

interface IChangesMultiDiffUriFields {
	readonly sessionResource: string;
}

export class SessionChangesService implements ISessionChangesService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
	) { }

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
