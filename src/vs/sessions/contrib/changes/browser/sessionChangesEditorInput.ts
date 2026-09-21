/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChangesEditorInput.css';
import { localize } from '../../../../nls.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { CancelablePromise, createCancelablePromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { DockedEditorInput } from '../../../common/dockedEditorInput.js';
import { getSessionChangesFileCountLabel } from '../common/changes.js';
import { ISessionChangesService } from '../common/sessionChangesService.js';
import { ISessionChangesModelService } from './sessionChangesModelService.js';

/**
 * Editor input for the Agents window Changes tab. It wraps the session's
 * multi-diff source and exposes the resolved multi-diff view model so the
 * {@link SessionChangesEditor} can render the diffs beneath its own header.
 */
export class SessionChangesEditorInput extends DockedEditorInput {

	static readonly ID = 'workbench.input.agentSessions.sessionChanges';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.sessionChanges';

	private readonly _innerInput = this._register(new MutableDisposable<IReference<MultiDiffEditorInput>>());
	private readonly _pendingResolutions = new Set<CancelablePromise<MultiDiffEditorViewModel>>();
	private _openCancellation: { readonly token: CancellationToken } | undefined;

	constructor(
		readonly multiDiffSource: URI,
		@ISessionChangesModelService private readonly modelService: ISessionChangesModelService,
		@ISessionChangesService private readonly sessionChangesService: ISessionChangesService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._register(layoutService.onDidChangePartVisibility(event => {
			if (event.partId === Parts.EDITOR_PART) {
				this._onDidChangeCapabilities.fire();
			}
		}));

		const onDidChangeCount = Event.fromObservableLight(sessionChangesService.activeSessionUncommittedChangesCountObs);
		this._register(onDidChangeCount(() => this._onDidChangeLabel.fire()));
	}

	override get resource(): URI {
		return this.multiDiffSource;
	}

	override get typeId(): string {
		return SessionChangesEditorInput.ID;
	}

	override get editorId(): string {
		return SessionChangesEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		const capabilities = super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
		return this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow) ? capabilities : capabilities | EditorInputCapabilities.CannotClose;
	}

	override getName(): string {
		return localize('sessionChangesEditor.name', "Changes");
	}

	override getAriaLabel(): string {
		const changeCount = this.sessionChangesService.activeSessionUncommittedChangesCountObs.get();
		return !changeCount
			? this.getName()
			: localize('sessionChangesEditor.ariaLabel', "{0}, {1}", this.getName(), getSessionChangesFileCountLabel(changeCount));
	}

	override getLabelExtraClasses(): string[] {
		return ['session-changes-editor-label'];
	}

	override getIcon(): ThemeIcon {
		return Codicon.diffMultiple;
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	private get innerInput(): MultiDiffEditorInput {
		if (this.isDisposed()) {
			throw new CancellationError();
		}
		if (!this._innerInput.value) {
			this._innerInput.value = this.modelService.acquire(this.multiDiffSource);
		}
		return this._innerInput.value.object;
	}

	/**
	 * The wrapped multi-diff input, whose {@link MultiDiffEditorInput.resources}
	 * expose the session's individual file diffs. Used to resolve the session's
	 * files (e.g. for the agent feedback affordances) from this editor input.
	 */
	get multiDiffInput(): MultiDiffEditorInput {
		return this.innerInput;
	}

	async getViewModel(token: CancellationToken = CancellationToken.None): Promise<MultiDiffEditorViewModel> {
		if (token.isCancellationRequested || this._openCancellation?.token.isCancellationRequested) {
			throw new CancellationError();
		}
		const input = this.innerInput;
		const resolution = createCancelablePromise(token => raceCancellationError(input.getViewModel(), token));
		this._pendingResolutions.add(resolution);
		try {
			return await raceCancellationError(resolution, token);
		} finally {
			this._pendingResolutions.delete(resolution);
			resolution.cancel();
		}
	}

	/** Scopes an opener's cancellation to this attempt without poisoning later restores of the input. */
	bindCancellationToken(token: CancellationToken): IDisposable {
		const scope = { token };
		this._openCancellation = scope;
		const listener = token.onCancellationRequested(() => {
			if (this._openCancellation === scope) {
				this.clear();
			}
		});
		if (token.isCancellationRequested) {
			this.clear();
		}
		return toDisposable(() => {
			listener.dispose();
			if (this._openCancellation === scope) {
				this._openCancellation = undefined;
			}
		});
	}

	clear(): void {
		const resolutions = [...this._pendingResolutions];
		this._pendingResolutions.clear();
		for (const resolution of resolutions) {
			resolution.cancel();
		}
		this._innerInput.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (this === otherInput) {
			return true;
		}
		return otherInput instanceof SessionChangesEditorInput
			&& otherInput.multiDiffSource.toString() === this.multiDiffSource.toString();
	}
}

interface ISerializedSessionChangesEditorInput {
	readonly multiDiffSourceUri: string;
}

export class SessionChangesEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): editorInput is SessionChangesEditorInput {
		return editorInput instanceof SessionChangesEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.canSerialize(editorInput)) {
			return undefined;
		}
		const data: ISerializedSessionChangesEditorInput = { multiDiffSourceUri: editorInput.multiDiffSource.toString() };
		return JSON.stringify(data);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditor: string): EditorInput | undefined {
		try {
			const data = JSON.parse(serializedEditor) as ISerializedSessionChangesEditorInput;
			return instantiationService.createInstance(SessionChangesEditorInput, URI.parse(data.multiDiffSourceUri));
		} catch {
			return undefined;
		}
	}
}
