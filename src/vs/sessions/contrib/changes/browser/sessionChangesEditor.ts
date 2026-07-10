/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionChangesEditor.css';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
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
import { EditorPane } from '../../../../workbench/browser/parts/editor/editorPane.js';
import { ResourceLabel } from '../../../../workbench/browser/labels.js';
import { IEditorHeaderActions, IEditorOpenContext } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorGroup } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { IDiffEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { Menus } from '../../../browser/menus.js';
import { shouldUseSinglePaneLayout } from '../../../browser/parts/singlePaneEditorPart.js';
import { ActiveSessionContextKeys } from '../common/changes.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesActionsBar } from './changesView.js';
import { SessionChangesEditorInput } from './sessionChangesEditorInput.js';

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
}

/**
 * Changes editor for the Agents window: a "Branch Changes" versions dropdown and
 * diff stats header sitting above an embedded multi-diff editor showing the
 * session's file diffs.
 */
export class SessionChangesEditor extends EditorPane {

	static readonly ID = SessionChangesEditorInput.EDITOR_ID;

	private widget: MultiDiffEditorWidget | undefined;
	private viewModel: MultiDiffEditorViewModel | undefined;
	private bodyContainer: HTMLElement | undefined;

	private _singlePane = false;
	private _scopedInstantiationService: IInstantiationService | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
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
		this._scopedInstantiationService = scopedInstantiationService;

		// In single-pane, the header (Branch Changes dropdown, diff stats and primary
		// actions) is hosted by the editor part's full-width header instead of inside
		// this editor, so it spans the editor content and the docked detail panel.
		this._singlePane = shouldUseSinglePaneLayout(this.configurationService);
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
		this.widget.setRenderSideBySide(this.configurationService.getValue<boolean>('diffEditor.renderSideBySide') ?? true);
	}

	toggleInlineView(): void {
		this.widget?.toggleRenderSideBySide();
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

	override async setInput(input: SessionChangesEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		const viewModel = await input.getViewModel();
		if (token.isCancellationRequested) {
			return;
		}
		this.viewModel = viewModel;
		this.widget?.setViewModel(viewModel, { preserveFocus: options?.preserveFocus });
		this._applyOptions(options);
	}

	collapseAllDiffs(): void {
		this.viewModel?.collapseAll();
	}

	expandAllDiffs(): void {
		this.viewModel?.expandAll();
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
		this.viewModel = undefined;
		this.widget?.setViewModel(undefined);
		super.clearInput();
	}

	override focus(): void {
		super.focus();
		this.widget?.getActiveControl()?.focus();
	}

	override layout(dimension: Dimension): void {
		// In single-pane the header is external (the editor part reserves a top inset),
		// so the diff fills the full dimension; otherwise reserve the internal header.
		const bodyHeight = this._singlePane ? dimension.height : Math.max(0, dimension.height - HEADER_HEIGHT);
		this.widget?.layout(new Dimension(dimension.width, bodyHeight));
	}
}
