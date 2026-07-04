/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChangesEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IAction } from '../../../../base/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { ResourceLabel } from '../../../../workbench/browser/labels.js';
import { IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { ActiveSessionContextKeys } from '../common/changes.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesActionsBar, SinglePaneChangesDiffStatsActionItem, ChangesPickerActionItem } from './changesView.js';
import { SessionChangesEditorInput } from './sessionChangesEditorInput.js';

const VERSIONS_PICKER_ACTION_ID = 'chatEditing.versionsPicker';
const DIFF_STATS_ACTION_ID = 'workbench.changesView.action.viewChanges';
const HEADER_HEIGHT = 35;

class SessionChangesUIElementFactory implements IWorkbenchUIElementFactory {

	readonly headerClickToCollapse = true;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this.instantiationService.createInstance(ResourceLabel, element, {});
		return {
			setUri(uri, options = {}) {
				if (!uri) {
					label.element.clear();
				} else {
					label.element.setFile(uri, { strikethrough: options.strikethrough });
				}
			},
			dispose() {
				label.dispose();
			}
		};
	}
}

/**
 * Changes editor for the Agents window: a "Branch Changes" versions dropdown and
 * diff stats header sitting above an embedded multi-diff editor showing the
 * session's file diffs.
 */
export class SessionChangesEditor extends EditorPane {

	static readonly ID = SessionChangesEditorInput.EDITOR_ID;

	private widget: MultiDiffEditorWidget | undefined;
	private bodyContainer: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
	) {
		super(SessionChangesEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		const root = append(parent, $('.session-changes-editor'));

		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(root));
		this._register(bindContextKey(ActiveSessionContextKeys.HasGitRepository, scopedContextKeyService, reader =>
			this.changesViewService.activeSessionHasGitRepositoryObs.read(reader)));
		this._register(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, reader =>
			this.changesViewService.activeSessionChangesObs.read(reader).length > 0));
		const scopedInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, scopedContextKeyService])));

		const header = append(root, $('.session-changes-editor-header'));

		const leftToolbarContainer = append(header, $('.session-changes-editor-header-left'));
		this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, leftToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action: IAction) => {
				if (action.id === VERSIONS_PICKER_ACTION_ID && action instanceof MenuItemAction) {
					return scopedInstantiationService.createInstance(ChangesPickerActionItem, action);
				}
				return undefined;
			},
		}));

		// Diff stats pill sits next to the Branch Changes dropdown.
		this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, leftToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderRightToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === DIFF_STATS_ACTION_ID && action instanceof MenuItemAction) {
					return scopedInstantiationService.createInstance(SinglePaneChangesDiffStatsActionItem, action, options);
				}
				return undefined;
			},
		}));

		// Create Pull Request (and related) actions render on the right of the header row.
		const rightToolbarContainer = append(header, $('.session-changes-editor-header-right'));
		this._register(scopedInstantiationService.createInstance(ChangesActionsBar, rightToolbarContainer));

		this.bodyContainer = append(root, $('.session-changes-editor-body'));
		this.widget = this._register(scopedInstantiationService.createInstance(
			MultiDiffEditorWidget,
			this.bodyContainer,
			scopedInstantiationService.createInstance(SessionChangesUIElementFactory),
		));
	}

	override async setInput(input: SessionChangesEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		const viewModel = await input.getViewModel();
		if (token.isCancellationRequested) {
			return;
		}
		this.widget?.setViewModel(viewModel, { preserveFocus: options?.preserveFocus });
		this._applyOptions(options);
	}

	override setOptions(options: IMultiDiffEditorOptions | undefined): void {
		this._applyOptions(options);
	}

	private _applyOptions(options: IMultiDiffEditorOptions | undefined): void {
		const revealData = options?.viewState?.revealData;
		if (!revealData) {
			return;
		}
		this.widget?.reveal(revealData.resource, {
			range: revealData.range ? Range.lift(revealData.range) : undefined,
			highlight: true,
		});
	}

	override clearInput(): void {
		this.widget?.setViewModel(undefined);
		super.clearInput();
	}

	override focus(): void {
		super.focus();
		this.widget?.getActiveControl()?.focus();
	}

	override layout(dimension: Dimension): void {
		const bodyHeight = Math.max(0, dimension.height - HEADER_HEIGHT);
		this.widget?.layout(new Dimension(dimension.width, bodyHeight));
	}
}
