/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChangesEditorInput.css';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent, runOnChange } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { DockedEditorInput } from '../../../browser/parts/editor/dockedEditorInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { getSessionChangesFileCountLabel } from '../../sessions/common/changes.js';
import { ISessionChangesService } from '../../../services/sessions/common/sessionChangesService.js';
import { ISessionsManagementService } from '../../sessions/common/sessionsManagement.js';

/**
 * Editor input for the Agents window Changes tab. It wraps the session's
 * multi-diff source and exposes the resolved multi-diff view model so the
 * {@link SessionChangesEditor} can render the diffs beneath its own header.
 */
export class SessionChangesEditorInput extends DockedEditorInput {

	static readonly ID = 'workbench.input.agentSessions.sessionChanges';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.sessionChanges';

	private readonly _innerInput = new MutableDisposable<MultiDiffEditorInput>();
	private _viewModelRetainers = 0;
	/** The title of the chat whose changes this editor shows, for an editor of a chat; `undefined` for one of a session. */
	private readonly _chatTitle: IObservable<string | undefined>;

	constructor(
		readonly multiDiffSource: URI,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISessionChangesService private readonly sessionChangesService: ISessionChangesService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super(editorGroupsService, layoutService);

		const onDidChangeCount = Event.fromObservableLight(sessionChangesService.activeSessionUncommittedChangesCountObs);
		this._register(onDidChangeCount(() => this._onDidChangeLabel.fire()));

		const sessionResource = sessionChangesService.getSessionResource(multiDiffSource);
		const chatResource = sessionChangesService.getChatResource(multiDiffSource);
		if (sessionResource && chatResource) {
			const session = observableFromEvent(this, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSession(sessionResource));
			this._chatTitle = derived(this, reader => session.read(reader)?.chats.read(reader).find(chat => isEqual(chat.resource, chatResource))?.title.read(reader) || undefined);
			// The label follows the chat as it is renamed.
			this._register(runOnChange(this._chatTitle, () => this._onDidChangeLabel.fire()));
		} else {
			this._chatTitle = constObservable(undefined);
		}
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
		return super.capabilities | EditorInputCapabilities.Singleton | EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return localize('sessionChangesEditor.name', "Changes");
	}

	/**
	 * Tells the Changes tabs of a session apart: the title of the chat for an editor of a chat, "Session" for one of the
	 * session. Tabs show descriptions only of editors whose names collide, so a Changes tab on its own reads "Changes".
	 */
	override getDescription(_verbosity?: Verbosity): string | undefined {
		return this._chatTitle.get() ?? localize('sessionChangesEditor.sessionDescription', "Session");
	}

	override getAriaLabel(): string {
		const changeCount = this.sessionChangesService.activeSessionUncommittedChangesCountObs.get();
		return !changeCount
			? this.getTitle()
			: localize('sessionChangesEditor.ariaLabel', "{0}, {1}", this.getTitle(), getSessionChangesFileCountLabel(changeCount));
	}

	override getLabelExtraClasses(): string[] {
		return ['session-changes-editor-label'];
	}

	override getIcon(): ThemeIcon {
		return Codicon.diffMultiple;
	}

	override getTitle(_verbosity?: Verbosity): string {
		const chatTitle = this._chatTitle.get();
		return chatTitle
			? localize('sessionChangesEditor.chatTitle', "Changes · {0}", chatTitle)
			: this.getName();
	}

	private get innerInput(): MultiDiffEditorInput {
		if (!this._innerInput.value) {
			this._innerInput.value = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
				multiDiffSource: this.multiDiffSource,
				label: this.getName(),
			}, this.instantiationService);
		}
		return this._innerInput.value;
	}

	/**
	 * The wrapped multi-diff input, whose {@link MultiDiffEditorInput.resources}
	 * expose the session's individual file diffs. Used to resolve the session's
	 * files (e.g. for the agent feedback affordances) from this editor input.
	 */
	get multiDiffInput(): MultiDiffEditorInput {
		return this.innerInput;
	}

	async getViewModel(): Promise<MultiDiffEditorViewModel> {
		return this.innerInput.getViewModel();
	}

	clear(): void {
		this._innerInput.clear();
	}

	/**
	 * Keeps the resolved view model alive, even after this input is disposed, until the
	 * returned handle is disposed. The Changes editor retains the input it is showing
	 * while it is cleared, so setting the same input again does not blank the diffs.
	 */
	retainViewModel(): IDisposable {
		this._viewModelRetainers++;
		let released = false;
		return toDisposable(() => {
			if (released) {
				return;
			}
			released = true;
			if (--this._viewModelRetainers === 0 && this.isDisposed()) {
				this._innerInput.dispose();
			}
		});
	}

	override dispose(): void {
		super.dispose();
		if (this._viewModelRetainers === 0) {
			this._innerInput.dispose();
		}
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
