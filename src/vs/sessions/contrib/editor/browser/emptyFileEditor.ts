/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emptyFileEditor.css';
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventType, isHTMLElement } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { NEW_UNTITLED_FILE_COMMAND_ID } from '../../../../workbench/contrib/files/browser/fileConstants.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsEmptyStateActions } from '../../../browser/parts/sessionsEmptyStateActions.js';
import { SessionsEmptyStateLayout } from '../../../browser/parts/sessionsEmptyStateLayout.js';
import { renderSessionsEmptyState } from '../../../browser/parts/sessionsEmptyState.js';
import { SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING } from '../../../common/sessionConfig.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { EmptyFileEditorSearch } from './emptyFileEditorSearch.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

export const EmptyFileEditorFocusedContext = new RawContextKey<boolean>('emptyFileEditorFocused', false, localize('emptyFileEditorFocused', "Whether focus is in the empty Files editor."));
export const OPEN_FILE_IN_EMPTY_EDITOR_COMMAND_ID = 'workbench.action.agentSessions.openFileInEmptyEditor';

export class EmptyFileEditor extends EditorPane {

	static readonly ID = EmptyFileEditorInput.EDITOR_ID;
	private readonly inputDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly featureDisposables = this._register(new MutableDisposable<DisposableStore>());
	private container: HTMLElement | undefined;
	private content: HTMLElement | undefined;
	private search: EmptyFileEditorSearch | undefined;
	private emptyStateLayout: SessionsEmptyStateLayout | undefined;
	private workspace: ISessionWorkspace | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(EmptyFileEditor.ID, group, telemetryService, themeService, storageService);
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING)) {
				this.renderContent();
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		// Focusable so the editor area owns keyboard focus (e.g. for Cmd+N) once the editor is focused.
		const container = this.container = append(parent, $('.empty-file-editor', {
			tabIndex: 0,
			role: 'group',
			'aria-label': localize('emptyFileEditor.ariaLabel', "Files editor"),
		}));
		container.style.outline = 'none';
		this.content = append(container, $('.empty-file-editor-content'));
		this.renderContent();
	}

	private renderContent(): void {
		if (!this.content || !this.container) {
			return;
		}

		this.featureDisposables.clear();
		this.search = undefined;
		this.emptyStateLayout = undefined;
		clearNode(this.content);
		logSettingExperimentTrigger(this.telemetryService, SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING);
		const showActions = this.configurationService.getValue<boolean>(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING);
		this.content.classList.toggle('has-actions', showActions);
		if (!showActions) {
			renderSessionsEmptyState(
				this.content,
				localize('emptyFileEditor.title', "Files"),
				localize('emptyFileEditor.description', "Select a file from the Files view"),
			);
			return;
		}

		const featureDisposables = new DisposableStore();
		this.featureDisposables.value = featureDisposables;
		// Like an empty editor group, double-clicking empty space opens an untitled file.
		featureDisposables.add(addDisposableListener(this.container, EventType.DBLCLICK, event => {
			if (isHTMLElement(event.target) && event.target.closest('.empty-file-editor-search, .empty-file-editor-actions')) {
				return;
			}
			EventHelper.stop(event);
			void this.commandService.executeCommand(NEW_UNTITLED_FILE_COMMAND_ID);
		}));
		const searchContainer = append(this.content, $('.empty-file-editor-search'));
		this.search = featureDisposables.add(this.instantiationService.createInstance(EmptyFileEditorSearch, searchContainer));
		this.search.setWorkspace(this.workspace);

		const actions = append(this.content, $('.empty-file-editor-actions.sessions-watermark-actions'));
		const scopedContextKeyService = featureDisposables.add(this.contextKeyService.createScoped(this.container));
		EmptyFileEditorFocusedContext.bindTo(scopedContextKeyService).set(true);
		const scopedInstantiationService = featureDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		featureDisposables.add(scopedInstantiationService.createInstance(SessionsEmptyStateActions, actions, Menus.EmptyFileEditorActions, {
			ariaLabel: localize('emptyFileEditor.actions', "Files"),
			telemetrySource: 'emptyFileEditor.actions',
			menuOptions: { arg: this },
		}));
		this.emptyStateLayout = featureDisposables.add(new SessionsEmptyStateLayout(this.container, [this.content], actions));
	}

	openFile(): void {
		this.search?.show();
	}

	override async setInput(input: EmptyFileEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		const store = new DisposableStore();
		this.inputDisposables.value = store;
		const updateWorkspace = () => {
			this.workspace = input.workspace;
			this.search?.setWorkspace(this.workspace);
		};
		store.add(input.onDidChangeLabel(updateWorkspace));
		updateWorkspace();
	}

	override focus(): void {
		super.focus();

		this.container?.focus();
	}

	override layout(dimension: Dimension): void {
		this.emptyStateLayout?.layout();
	}
}
