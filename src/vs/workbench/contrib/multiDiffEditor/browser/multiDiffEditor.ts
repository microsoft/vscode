/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IResourceLabel, IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { FloatingClickMenu } from '../../../../platform/actions/browser/floatingMenu.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ResourceLabel } from '../../../browser/labels.js';
import { AbstractEditorWithViewState } from '../../../browser/parts/editor/editorWithViewState.js';
import { ICompositeControl } from '../../../common/composite.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IDocumentDiffItemWithMultiDiffEditorItem, MultiDiffEditorInput } from './multiDiffEditorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { URI } from '../../../../base/common/uri.js';
import { MultiDiffEditorViewModel } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { IMultiDiffEditorOptions, IMultiDiffEditorViewState } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IDiffEditor } from '../../../../editor/common/editorCommon.js';
import { Range } from '../../../../editor/common/core/range.js';
import { MultiDiffEditorItem } from './multiDiffSourceResolverService.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';

export class MultiDiffEditor extends AbstractEditorWithViewState<IMultiDiffEditorViewState> {
	static readonly ID = 'multiDiffEditor';

	private _multiDiffEditorWidget: MultiDiffEditorWidget | undefined = undefined;
	private _viewModel: MultiDiffEditorViewModel | undefined;
	private _sessionResourceContextKey: ResourceContextKey | undefined;
	private _contentOverlay: MultiDiffEditorContentMenuOverlay | undefined;

	public get viewModel(): MultiDiffEditorViewModel | undefined {
		return this._viewModel;
	}

	constructor(
		group: IEditorGroup,
		@IInstantiationService instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IEditorProgressService private editorProgressService: IEditorProgressService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super(
			MultiDiffEditor.ID,
			group,
			'multiDiffEditor',
			telemetryService,
			instantiationService,
			storageService,
			textResourceConfigurationService,
			themeService,
			editorService,
			editorGroupService
		);
	}

	protected createEditor(parent: HTMLElement): void {
		this._multiDiffEditorWidget = this._register(this.instantiationService.createInstance(
			MultiDiffEditorWidget,
			parent,
			this.instantiationService.createInstance(WorkbenchUIElementFactory),
		));

		this._register(this._multiDiffEditorWidget.onDidChangeActiveControl(() => {
			this._onDidChangeControl.fire();
		}));

		const scopedContextKeyService = this._multiDiffEditorWidget.getContextKeyService();
		const scopedInstantiationService = this._multiDiffEditorWidget.getScopedInstantiationService();
		this._sessionResourceContextKey = this._register(scopedInstantiationService.createInstance(ResourceContextKey));
		this._contentOverlay = this._register(new MultiDiffEditorContentMenuOverlay(
			this._multiDiffEditorWidget.getRootElement(),
			this._sessionResourceContextKey,
			scopedContextKeyService,
			this.menuService,
			scopedInstantiationService,
		));
	}

	override async setInput(input: MultiDiffEditorInput, options: IMultiDiffEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._viewModel = await input.getViewModel();
		this._sessionResourceContextKey?.set(input.resource);
		this._contentOverlay?.updateResource(input.resource);
		this._multiDiffEditorWidget!.setViewModel(this._viewModel);

		const viewState = this.loadEditorViewState(input, context);
		if (viewState) {
			this._multiDiffEditorWidget!.setViewState(viewState);
		}
		this._applyOptions(options);
	}

	override setOptions(options: IMultiDiffEditorOptions | undefined): void {
		this._applyOptions(options);
	}

	private _applyOptions(options: IMultiDiffEditorOptions | undefined): void {
		const viewState = options?.viewState;
		if (!viewState || !viewState.revealData) {
			return;
		}
		this._multiDiffEditorWidget?.reveal(viewState.revealData.resource, {
			range: viewState.revealData.range ? Range.lift(viewState.revealData.range) : undefined,
			highlight: true
		});
	}

	override async clearInput(): Promise<void> {
		await super.clearInput();
		this._sessionResourceContextKey?.set(null);
		this._contentOverlay?.updateResource(undefined);
		this._multiDiffEditorWidget!.setViewModel(undefined);
	}

	layout(dimension: DOM.Dimension): void {
		this._multiDiffEditorWidget!.layout(dimension);
	}

	override getControl(): ICompositeControl | undefined {
		return this._multiDiffEditorWidget!.getActiveControl();
	}

	override focus(): void {
		super.focus();

		this._multiDiffEditorWidget?.getActiveControl()?.focus();
	}

	override hasFocus(): boolean {
		return this._multiDiffEditorWidget?.getActiveControl()?.hasTextFocus() || super.hasFocus();
	}

	protected override computeEditorViewState(resource: URI): IMultiDiffEditorViewState | undefined {
		return this._multiDiffEditorWidget!.getViewState();
	}

	protected override tracksEditorViewState(input: EditorInput): boolean {
		return input instanceof MultiDiffEditorInput;
	}

	protected override toEditorViewStateResource(input: EditorInput): URI | undefined {
		return (input as MultiDiffEditorInput).resource;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this._multiDiffEditorWidget!.tryGetCodeEditor(resource);
	}

	public findDocumentDiffItem(resource: URI): MultiDiffEditorItem | undefined {
		const i = this._multiDiffEditorWidget!.findDocumentDiffItem(resource);
		if (!i) { return undefined; }
		const i2 = i as IDocumentDiffItemWithMultiDiffEditorItem;
		return i2.multiDiffEditorItem;
	}

	public goToNextChange(): void {
		this._multiDiffEditorWidget?.goToNextChange();
	}

	public goToPreviousChange(): void {
		this._multiDiffEditorWidget?.goToPreviousChange();
	}

	public async showWhile(promise: Promise<unknown>): Promise<void> {
		return this.editorProgressService.showWhile(promise);
	}
}

class MultiDiffEditorContentMenuOverlay extends Disposable {
	private readonly overlayStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly resourceContextKey: ResourceContextKey;
	private currentResource: URI | undefined;
	private readonly rebuild: () => void;

	constructor(
		root: HTMLElement,
		resourceContextKey: ResourceContextKey,
		contextKeyService: IContextKeyService,
		menuService: IMenuService,
		instantiationService: IInstantiationService,
	) {
		super();
		this.resourceContextKey = resourceContextKey;

		const menu = this._register(menuService.createMenu(MenuId.MultiDiffEditorContent, contextKeyService));

		this.rebuild = () => {
			this.overlayStore.clear();

			const container = DOM.h('div.floating-menu-overlay-widget.multi-diff-root-floating-menu');
			root.appendChild(container.root);
			const floatingMenu = instantiationService.createInstance(FloatingClickMenu, {
				container: container.root,
				menuId: MenuId.MultiDiffEditorContent,
				getActionArg: () => this.currentResource,
			});

			const store = new DisposableStore();
			store.add(floatingMenu);
			store.add(toDisposable(() => container.root.remove()));
			this.overlayStore.value = store;
		};

		this.rebuild();
		this._register(menu.onDidChange(() => {
			this.overlayStore.clear();
			this.rebuild();
		}));

		this._register(resourceContextKey);
	}

	public updateResource(resource: URI | undefined): void {
		this.currentResource = resource;
		// Update context key and rebuild so menu arg matches
		this.resourceContextKey.set(resource ?? null);
		this.overlayStore.clear();
		this.rebuild();
	}
}


class WorkbenchUIElementFactory implements IWorkbenchUIElementFactory {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	createResourceLabel(element: HTMLElement): IResourceLabel {
		const label = this._instantiationService.createInstance(ResourceLabel, element, {});
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
