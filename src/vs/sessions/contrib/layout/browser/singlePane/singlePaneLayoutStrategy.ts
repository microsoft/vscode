/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../../../workbench/common/editor.js';
import { ISessionChangesService } from '../../../changes/browser/sessionChangesService.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { ISessionViewState } from '../baseSessionLayoutController.js';

/**
 * Shared controller state that single-pane layout strategies read/coordinate
 * through. Implemented by the single-pane layout controller; the concrete
 * services each strategy needs are injected into the strategy directly via DI.
 */
export interface ISinglePaneLayoutContext {
	/** `> 0` while a session-switch layout restore is in progress. */
	readonly isRestoringSessionLayout: boolean;
	/** Runs `work` while a session-switch layout restore is held. */
	withSessionLayoutRestore(work: () => void | Promise<unknown>): void;
	/** `true` while the whole side pane (editor + aux bar) is being toggled together. */
	readonly togglingSidePane: boolean;
	readonly multipleSessionsVisibleObs: IObservable<boolean>;
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	/** [B3] Per-session aux-bar view state, persisted by the base controller. */
	readonly viewStateBySession: ResourceMap<ISessionViewState>;
	/** `true` while a restore-driven aux-bar hide is in progress, so the [D2] capture ignores it. */
	readonly hidingAuxiliaryBarForRestore: boolean;
	/** Hides the aux bar as part of restoring remembered state; the [D2] capture ignores the resulting change. */
	hideAuxiliaryBarForRestore(): void;
}

/** Base class for a single-pane layout behaviour, owning its own disposables. */
export abstract class SinglePaneLayoutStrategy extends Disposable {
	constructor(protected readonly _ctx: ISinglePaneLayoutContext) {
		super();
	}
}

/**
 * Shared state for the two docked-tab strategies (managed Changes/Files tabs and
 * editor-area tab collapse): they serialize on one sequencer, share the set of
 * editors the controller itself is closing (so those closes aren't mistaken for
 * user dismissals), and share the captured collapsed editors.
 */
export class SinglePaneDockedTabsCoordinator extends Disposable {

	readonly sequencer = new Sequencer();

	/** Editors the controller itself is closing, so their close is not a user dismissal. */
	readonly internallyClosingEditors = new Set<EditorInput>();

	/** Non-managed editors closed (as reopenable inputs + tab index) while the editor area is hidden. */
	collapsedEditors: { readonly editor: IUntypedEditorInput; readonly index: number }[] | undefined;

	constructor(private readonly _sessionChangesService: ISessionChangesService) {
		super();
	}

	isManagedEditor(editor: EditorInput): boolean {
		return editor instanceof EmptyFileEditorInput || this.getChangesEditorResource(editor) !== undefined;
	}

	getChangesEditorResource(editor: EditorInput): URI | undefined {
		const resource = editor.resource;
		return resource && this._sessionChangesService.getSessionResource(resource) ? resource : undefined;
	}
}
