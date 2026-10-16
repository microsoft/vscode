/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/emptyFileEditor.css';
import { $, append, clearNode, Dimension } from '../../../../base/browser/dom.js';
import { IAction } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
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
import { renderSessionsEmptyState } from '../../../browser/parts/sessionsEmptyState.js';
import { SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING } from '../../../common/sessionConfig.js';
import { ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { CompactButtonActionViewItem } from '../../sessions/browser/sessionsActions.js';
import { EmptyFileEditorSearch } from './emptyFileEditorSearch.js';
import { EmptyFileEditorInput } from './emptyFileEditorInput.js';

class EmptyFileEditorActionViewItem extends CompactButtonActionViewItem {

	constructor(
		action: IAction,
		private readonly actionCommandId: string,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(action, keybindingService, hoverService, contextKeyService);
	}

	protected override get commandId(): string {
		return this.actionCommandId;
	}

	protected override get label(): string {
		return this.action.label;
	}

	protected override get icon() {
		return Codicon.newFile;
	}

	protected override getHoverContent(keybindingLabel: string | undefined): string {
		return keybindingLabel
			? localize('emptyFileEditor.actionTooltip', "{0} ({1})", this.action.label, keybindingLabel)
			: this.action.label;
	}

	protected override getAriaLabel(keybindingAriaLabel: string | undefined): string {
		return keybindingAriaLabel
			? localize('emptyFileEditor.actionAria', "{0} ({1})", this.action.label, keybindingAriaLabel)
			: this.action.label;
	}

}

export class EmptyFileEditor extends EditorPane {

	static readonly ID = EmptyFileEditorInput.EDITOR_ID;
	private readonly inputDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly featureDisposables = this._register(new MutableDisposable<DisposableStore>());
	private content: HTMLElement | undefined;
	private search: EmptyFileEditorSearch | undefined;
	private workspace: ISessionWorkspace | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(EmptyFileEditor.ID, group, telemetryService, themeService, storageService);
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING)) {
				this.renderContent();
			}
		}));
	}

	protected override createEditor(parent: HTMLElement): void {
		const container = append(parent, $('.empty-file-editor'));
		this.content = append(container, $('.empty-file-editor-content'));
		this.renderContent();
	}

	private renderContent(): void {
		if (!this.content) {
			return;
		}

		this.featureDisposables.clear();
		this.search = undefined;
		clearNode(this.content);
		renderSessionsEmptyState(
			this.content,
			localize('emptyFileEditor.title', "Files"),
			localize('emptyFileEditor.description', "Select a file from the Files view"),
		);

		logSettingExperimentTrigger(this.telemetryService, SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING);
		if (!this.configurationService.getValue<boolean>(SESSIONS_EMPTY_FILE_EDITOR_ACTIONS_SETTING)) {
			return;
		}

		const featureDisposables = new DisposableStore();
		this.featureDisposables.value = featureDisposables;
		const searchContainer = append(this.content, $('.empty-file-editor-search'));
		this.search = featureDisposables.add(this.instantiationService.createInstance(EmptyFileEditorSearch, searchContainer));
		this.search.setWorkspace(this.workspace);

		const actions = append(this.content, $('.empty-file-editor-actions'));
		const scopedContextKeyService = featureDisposables.add(this.contextKeyService.createScoped(actions));
		const scopedInstantiationService = featureDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		featureDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actions, Menus.EmptyFileEditorActions, {
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			telemetrySource: 'emptyFileEditor.actions',
			toolbarOptions: { primaryGroup: group => group === 'navigation' },
			actionViewItemProvider: action => action.id === NEW_UNTITLED_FILE_COMMAND_ID
				? scopedInstantiationService.createInstance(EmptyFileEditorActionViewItem, action, NEW_UNTITLED_FILE_COMMAND_ID)
				: undefined,
		}));
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
		// Do not steal focus to the search button when the editor opens.
	}

	override layout(dimension: Dimension): void {
	}
}
