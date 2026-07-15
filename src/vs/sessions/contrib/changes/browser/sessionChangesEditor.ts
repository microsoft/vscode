/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChangesEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { URI } from '../../../../base/common/uri.js';
import { IDiffEditor } from '../../../../editor/common/editorCommon.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { AbstractEditorWithViewState } from '../../../../workbench/browser/parts/editor/editorWithViewState.js';
import { ResourceLabel } from '../../../../workbench/browser/labels.js';
import { IEditorHeaderActions, IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { IDiffEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ActiveSessionContextKeys } from '../common/changes.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesActionsBar, ChangesActionsBarActionViewItem, CHANGES_HEADER_ACTIONS_ID } from './changesView.js';
import { SessionChangesEditorInput } from './sessionChangesEditorInput.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IAction } from '../../../../base/common/actions.js';
import { IActionViewItemOptions, IBaseActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { CheckboxActionViewItem } from '../../../../base/browser/ui/toggle/toggle.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';

const HEADER_HEIGHT = 35;

/**
 * Optimizes the embedded diffs for the narrow Agents window panel: in inline
 * view this hides the original file's line-number column, removing the wide
 * empty gutter that otherwise sits left of the modified line numbers. Unlike
 * `compactMode` it keeps the full expandable hidden-region widgets.
 */
const CHANGES_DIFF_EDITOR_OPTIONS: IDiffEditorOptions = {
	hideOriginalLineNumbers: true,
};

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

	createToolbarActionViewItem(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === CHANGESET_REVIEW_ACTION_ID && action instanceof MenuItemAction) {
			return this.instantiationService.createInstance(ChangesetReviewActionViewItem, action, options);
		}
		return undefined;
	}
}

/**
 * Changes editor for the Agents window: a "Branch Changes" versions dropdown and
 * diff stats header sitting above an embedded multi-diff editor showing the
 * session's file diffs.
 */
export class SessionChangesEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {

	static readonly ID = SessionChangesEditorInput.EDITOR_ID;

	private widget: MultiDiffEditorWidget | undefined;
	private viewModel: MultiDiffEditorViewModel | undefined;
	private bodyContainer: HTMLElement | undefined;

	private _singlePane = false;
	private _scopedInstantiationService: IInstantiationService | undefined;

	/** Deferred focus request awaiting the active diff editor to be rendered. */
	private readonly _pendingFocus = this._register(new MutableDisposable());

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAgentWorkbenchLayoutService private readonly layoutService: IAgentWorkbenchLayoutService,
	) {
		super(
			SessionChangesEditor.ID,
			group,
			'sessionChangesEditorViewState',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService,
		);
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
		this._scopedInstantiationService = scopedInstantiationService;

		// In single-pane, the header (Branch Changes dropdown, diff stats and primary
		// actions) is hosted by the editor part's full-width header instead of inside
		// this editor, so it spans the editor content and the docked detail panel.
		this._singlePane = this.layoutService.isSinglePaneLayoutEnabled;
		if (!this._singlePane) {
			const header = append(root, $('.session-changes-editor-header'));
			const left = append(header, $('.session-changes-editor-header-left'));
			const right = append(header, $('.session-changes-editor-header-right'));
			this._register(this._buildHeaderToolbars(left, right, scopedInstantiationService));
		}

		this.bodyContainer = append(root, $('.session-changes-editor-body'));

		// Create the widget in the editor-pane context (not the deeper scoped one)
		// so its own multiDiffEditor* context keys (all-collapsed, render-side-by-side)
		// are visible to the EditorTitle menu that drives the collapse/expand-all and
		// inline-view toggle actions.
		const paneInstantiationService = this._register(this.instantiationService.createChild(
			new ServiceCollection([IContextKeyService, this.contextKeyService])));
		this.widget = this._register(paneInstantiationService.createInstance(
			MultiDiffEditorWidget,
			this.bodyContainer,
			paneInstantiationService.createInstance(SessionChangesUIElementFactory),
			CHANGES_DIFF_EDITOR_OPTIONS,
		));
		this._applyRenderSideBySide();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('diffEditor.renderSideBySide')) {
				this._applyRenderSideBySide();
			}
		}));
	}

	private _applyRenderSideBySide(): void {
		this.widget?.setRenderSideBySide(this.configurationService.getValue<boolean>('diffEditor.renderSideBySide') ?? true);
	}

	/**
	 * Resolves the diff editor and code editor showing the given file, mirroring
	 * {@link MultiDiffEditor.tryGetCodeEditor} so file-toolbar actions can operate
	 * on this editor and the plain multi-diff editor uniformly.
	 */
	tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this.widget?.tryGetCodeEditor(resource);
	}

	/** Creates the classic (non-single-pane) internal header toolbars. */
	private _buildHeaderToolbars(left: HTMLElement, right: HTMLElement, instantiationService: IInstantiationService): IDisposable {
		const store = new DisposableStore();

		// The Branch Changes picker + diff stats render as the leading header menu;
		// their custom action view items resolve globally via IActionViewItemService.
		store.add(instantiationService.createInstance(MenuWorkbenchToolBar, left, Menus.SessionsEditorHeaderPrimary, {
			menuOptions: { shouldForwardArgs: true },
		}));

		// Create Pull Request (and related) actions render on the right of the header row.
		store.add(instantiationService.createInstance(ChangesActionsBar, right));

		return store;
	}

	/**
	 * In single-pane, opt this editor in to the group's full-width header (spanning
	 * the editor content and docked detail), providing this editor's scoped context
	 * so the header actions' `when` clauses evaluate correctly.
	 */
	getHeaderActions(): IEditorHeaderActions | undefined {
		if (!this._singlePane || !this._scopedInstantiationService) {
			return undefined;
		}
		return { instantiationService: this._scopedInstantiationService };
	}

	/**
	 * In single-pane, render the Create Pull Request button bar ({@link ChangesActionsBar})
	 * as the editor tabs title anchor action ({@link CHANGES_HEADER_ACTIONS_ID}).
	 */
	override getActionViewItem(action: IAction, options: IBaseActionViewItemOptions): IActionViewItem | undefined {
		if (this._singlePane && action.id === CHANGES_HEADER_ACTIONS_ID) {
			return this.instantiationService.createInstance(ChangesActionsBarActionViewItem, action, options);
		}
		return super.getActionViewItem(action, options);
	}

	override async setInput(input: SessionChangesEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		const viewModel = await input.getViewModel();
		if (token.isCancellationRequested) {
			return;
		}
		this.viewModel = viewModel;

		// Apply the model and any restored view state together so the widget's
		// automatic first-change navigation sees the restored active item instead
		// of navigating to (and focusing) the first file.
		const viewState = this.loadEditorViewState(input, context);
		this.widget?.setViewModel(viewModel, { preserveFocus: options?.preserveFocus, viewState });
		this._applyOptions(options);
	}

	protected override setEditorVisible(visible: boolean): void {
		// The Changes editor can be backgrounded without being cleared or closed
		// (e.g. switching sessions makes another editor active, or the detail panel
		// switches to Files). Persist its view state on hide so collapsed/scroll
		// state survives regardless of the close/open ordering.
		if (!visible) {
			this._pendingFocus.clear();
			this.saveCurrentEditorViewState();
		}
		super.setEditorVisible(visible);
	}

	protected override computeEditorViewState(_resource: URI): IMultiDiffEditorViewState | undefined {
		if (!this.viewModel) {
			return undefined; // nothing loaded: don't overwrite a saved state with an empty snapshot
		}
		return this.widget?.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof SessionChangesEditorInput;
	}

	protected override tracksDisposedEditorViewState(): boolean {
		// The Changes editor is recreated from its per-session resource (e.g. when
		// switching sessions closes/disposes the tab), so keep the view state around
		// after the input is disposed and restore it when the editor reopens.
		return true;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return input instanceof SessionChangesEditorInput ? input.multiDiffSource : undefined;
	}

	collapseAllDiffs(): void {
		this.viewModel?.collapseAll();
	}

	expandAllDiffs(): void {
		this.viewModel?.expandAll();
	}

	public collapse(resource: URI): void {
		const item = this.viewModel?.items.read(undefined)
			.find(i => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
		if (!item) {
			return;
		}

		this.viewModel?.collapse(item);
	}

	public expand(resource: URI): void {
		const item = this.viewModel?.items.read(undefined)
			.find(i => isEqual(i.modifiedUri, resource) || isEqual(i.originalUri, resource));
		if (!item) {
			return;
		}

		this.viewModel?.expand(item);
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
		this._pendingFocus.clear();
		// Let the base capture the current view state (it reads the widget) before the
		// view model is torn down.
		super.clearInput();
		this.viewModel = undefined;
		this.widget?.setViewModel(undefined);
	}

	override focus(): void {
		super.focus();
		this._pendingFocus.clear();

		const widget = this.widget;
		if (!widget) {
			return;
		}

		const control = widget.getActiveControl();
		if (control) {
			control.focus();
			return;
		}

		// The active file's diff editor may not be rendered yet (e.g. the editor
		// part was just revealed from a hidden state), so getActiveControl() is
		// undefined. Focus it as soon as it becomes available.
		this._pendingFocus.value = widget.onDidChangeActiveControl(() => {
			const activeControl = widget.getActiveControl();
			if (activeControl) {
				this._pendingFocus.clear();
				activeControl.focus();
			}
		});
	}

	override layout(dimension: Dimension): void {
		// In single-pane the header is external (the editor part reserves a top inset),
		// so the diff fills the full dimension; otherwise reserve the internal header.
		const bodyHeight = this._singlePane ? dimension.height : Math.max(0, dimension.height - HEADER_HEIGHT);
		this.widget?.layout(new Dimension(dimension.width, bodyHeight));
	}
}

export const CHANGESET_REVIEW_ACTION_ID = 'changeset.review';

/**
 * Renders the per-file "Mark as Viewed" toggle in the Changes editor file header
 * as a checkbox with a static "Viewed" label (mirroring the GitHub pull request
 * "Viewed" checkbox), instead of the default icon-only toolbar button. The
 * command's toggling title ("Mark as Viewed" / "Mark as Not Viewed") is kept as
 * the accessible name so the action is announced, while the checkbox state
 * conveys the reviewed state.
 */
class ChangesetReviewActionViewItem extends CheckboxActionViewItem {

	constructor(action: MenuItemAction, options: IActionViewItemOptions) {
		super(undefined, action, { ...options, label: true, checkboxStyles: { ...defaultCheckboxStyles, size: 14 } });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('changeset-review-action');
	}

	override updateChecked(): void {
		super.updateChecked();

		this.updateAriaLabel();
		this.updateTooltip();
	}

	override getTooltip(): string {
		return this.action.checked
			? localize('changeset.viewed.tooltip', "Mark as Not Viewed")
			: localize('changeset.notViewed.tooltip', "Mark as Viewed");
	}
}
