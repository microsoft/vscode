/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./referencesWidget';
import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { getPathLabel } from 'vs/base/common/labels';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, IReference } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as strings from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { Color } from 'vs/base/common/color';
import { $, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { Sash, ISashEvent, IVerticalSashLayoutProvider } from 'vs/base/browser/ui/sash/sash';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { GestureEvent } from 'vs/base/browser/touch';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import * as tree from 'vs/base/parts/tree/browser/tree';
import { DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Range, IRange } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Model } from 'vs/editor/common/model/model';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/embeddedCodeEditorWidget';
import { PeekViewWidget, IPeekViewService } from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import { FileReferences, OneReference, ReferencesModel } from './referencesModel';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { registerColor, activeContrastBorder, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant, ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IModelDecorationsChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import URI from 'vs/base/common/uri';

class DecorationsManager implements IDisposable {

	private static DecorationOptions = ModelDecorationOptions.register({
		stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'reference-decoration'
	});

	private _decorations = new Map<string, OneReference>();
	private _decorationIgnoreSet = new Set<string>();
	private _callOnDispose: IDisposable[] = [];
	private _callOnModelChange: IDisposable[] = [];

	constructor(private _editor: ICodeEditor, private _model: ReferencesModel) {
		this._callOnDispose.push(this._editor.onDidChangeModel(() => this._onModelChanged()));
		this._onModelChanged();
	}

	public dispose(): void {
		this._callOnModelChange = dispose(this._callOnModelChange);
		this._callOnDispose = dispose(this._callOnDispose);
		this.removeDecorations();
	}

	private _onModelChanged(): void {
		this._callOnModelChange = dispose(this._callOnModelChange);
		const model = this._editor.getModel();
		if (model) {
			for (const ref of this._model.groups) {
				if (ref.uri.toString() === model.uri.toString()) {
					this._addDecorations(ref);
					return;
				}
			}
		}
	}

	private _addDecorations(reference: FileReferences): void {
		this._callOnModelChange.push(this._editor.getModel().onDidChangeDecorations((event) => this._onDecorationChanged(event)));

		this._editor.changeDecorations(accessor => {

			const newDecorations: editorCommon.IModelDeltaDecoration[] = [];
			const newDecorationsActualIndex: number[] = [];

			for (let i = 0, len = reference.children.length; i < len; i++) {
				let oneReference = reference.children[i];
				if (this._decorationIgnoreSet.has(oneReference.id)) {
					continue;
				}
				newDecorations.push({
					range: oneReference.range,
					options: DecorationsManager.DecorationOptions
				});
				newDecorationsActualIndex.push(i);
			}

			const decorations = accessor.deltaDecorations([], newDecorations);
			for (let i = 0; i < decorations.length; i++) {
				this._decorations.set(decorations[i], reference.children[newDecorationsActualIndex[i]]);
			}
		});
	}

	private _onDecorationChanged(event: IModelDecorationsChangedEvent): void {
		const changedDecorations = event.changedDecorations,
			toRemove: string[] = [];

		for (let i = 0, len = changedDecorations.length; i < len; i++) {
			let reference = this._decorations.get(changedDecorations[i]);
			if (!reference) {
				continue;
			}

			const newRange = this._editor.getModel().getDecorationRange(changedDecorations[i]);
			let ignore = false;

			if (Range.equalsRange(newRange, reference.range)) {
				continue;

			} else if (Range.spansMultipleLines(newRange)) {
				ignore = true;

			} else {
				const lineLength = reference.range.endColumn - reference.range.startColumn;
				const newLineLength = newRange.endColumn - newRange.startColumn;

				if (lineLength !== newLineLength) {
					ignore = true;
				}
			}

			if (ignore) {
				this._decorationIgnoreSet.add(reference.id);
				toRemove.push(changedDecorations[i]);
			} else {
				reference.range = newRange;
			}
		}

		this._editor.changeDecorations((accessor) => {
			for (let i = 0, len = toRemove.length; i < len; i++) {
				this._decorations.delete(toRemove[i]);
			}
			accessor.deltaDecorations(toRemove, []);
		});
	}

	public removeDecorations(): void {
		this._editor.changeDecorations(accessor => {
			this._decorations.forEach((value, key) => {
				accessor.removeDecoration(key);
			});
			this._decorations.clear();
		});
	}
}

class DataSource implements tree.IDataSource {

	constructor(
		@ITextModelService private _textModelResolverService: ITextModelService
	) {
		//
	}

	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof ReferencesModel) {
			return 'root';
		} else if (element instanceof FileReferences) {
			return (<FileReferences>element).id;
		} else if (element instanceof OneReference) {
			return (<OneReference>element).id;
		}
		return undefined;
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		if (element instanceof ReferencesModel) {
			return true;
		}
		if (element instanceof FileReferences && !(<FileReferences>element).failure) {
			return true;
		}
		return false;
	}

	public getChildren(tree: tree.ITree, element: ReferencesModel | FileReferences): TPromise<any[]> {
		if (element instanceof ReferencesModel) {
			return TPromise.as(element.groups);
		} else if (element instanceof FileReferences) {
			return element.resolve(this._textModelResolverService).then(val => {
				if (element.failure) {
					// refresh the element on failure so that
					// we can update its rendering
					return tree.refresh(element).then(() => val.children);
				}
				return val.children;
			});
		} else {
			return TPromise.as([]);
		}
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		var result: any = null;
		if (element instanceof FileReferences) {
			result = (<FileReferences>element).parent;
		} else if (element instanceof OneReference) {
			result = (<OneReference>element).parent;
		}
		return TPromise.as(result);
	}
}

class Controller extends DefaultController {

	static Events = {
		FOCUSED: 'events/custom/focused',
		SELECTED: 'events/custom/selected',
		OPEN_TO_SIDE: 'events/custom/opentoside'
	};

	public onTap(tree: tree.ITree, element: any, event: GestureEvent): boolean {
		if (element instanceof FileReferences) {
			event.preventDefault();
			event.stopPropagation();
			return this._expandCollapse(tree, element);
		}

		var result = super.onTap(tree, element, event);
		tree.emit(Controller.Events.FOCUSED, element);
		return result;
	}

	public onMouseDown(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (event.leftButton) {
			if (element instanceof FileReferences) {
				event.preventDefault();
				event.stopPropagation();
				return this._expandCollapse(tree, element);
			}

			var result = super.onClick(tree, element, event);
			if (event.ctrlKey || event.metaKey) {
				tree.emit(Controller.Events.OPEN_TO_SIDE, element);
			} else if (event.detail === 2) {
				tree.emit(Controller.Events.SELECTED, element);
			} else {
				tree.emit(Controller.Events.FOCUSED, element);
			}
			return result;
		}

		return false;
	}

	public onClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		if (event.leftButton) {
			return false; // Already handled by onMouseDown
		}

		return super.onClick(tree, element, event);
	}

	private _expandCollapse(tree: tree.ITree, element: any): boolean {

		if (tree.isExpanded(element)) {
			tree.collapse(element).done(null, onUnexpectedError);
		} else {
			tree.expand(element).done(null, onUnexpectedError);
		}
		return true;
	}

	public onEscape(tree: tree.ITree, event: IKeyboardEvent): boolean {
		return false;
	}

	public onEnter(tree: tree.ITree, event: IKeyboardEvent): boolean {
		var element = tree.getFocus();
		if (element instanceof FileReferences) {
			return this._expandCollapse(tree, element);
		}

		var result = super.onEnter(tree, event);
		if (event.ctrlKey || event.metaKey) {
			tree.emit(Controller.Events.OPEN_TO_SIDE, element);
		} else {
			tree.emit(Controller.Events.SELECTED, element);
		}
		return result;
	}

	public onUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageUp(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageUp(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onLeft(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onLeft(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onPageDown(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onPageDown(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	public onRight(tree: tree.ITree, event: IKeyboardEvent): boolean {
		super.onRight(tree, event);
		this._fakeFocus(tree, event);
		return true;
	}

	private _fakeFocus(tree: tree.ITree, event: IKeyboardEvent): void {
		// focus next item
		var focus = tree.getFocus();
		tree.setSelection([focus]);
		// send out event
		tree.emit(Controller.Events.FOCUSED, focus);
	}
}

class FileReferencesTemplate {

	readonly file: FileLabel;
	readonly badge: CountBadge;
	readonly dispose: () => void;

	constructor(
		container: HTMLElement,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@optional(IEnvironmentService) private _environmentService: IEnvironmentService,
		@IThemeService themeService: IThemeService,
	) {
		const parent = document.createElement('div');
		dom.addClass(parent, 'reference-file');
		container.appendChild(parent);

		this.file = new FileLabel(parent, URI.parse('no:file'), this._contextService, this._environmentService);
		this.badge = new CountBadge(parent);
		const styler = attachBadgeStyler(this.badge, themeService);
		this.dispose = () => styler.dispose();
	}

	set(element: FileReferences) {
		this.file.setFile(element.uri, this._contextService, this._environmentService);
		const len = element.children.length;
		this.badge.setCount(len);
		if (element.failure) {
			this.badge.setTitleFormat(nls.localize('referencesFailre', "Failed to resolve file."));
		} else if (len > 1) {
			this.badge.setTitleFormat(nls.localize('referencesCount', "{0} references", len));
		} else {
			this.badge.setTitleFormat(nls.localize('referenceCount', "{0} reference", len));
		}
	}
}

class OneReferenceTemplate {

	readonly before: HTMLSpanElement;
	readonly inside: HTMLSpanElement;
	readonly after: HTMLSpanElement;

	constructor(container: HTMLElement) {
		const parent = document.createElement('div');
		this.before = document.createElement('span');
		this.inside = document.createElement('span');
		this.after = document.createElement('span');
		dom.addClass(this.inside, 'referenceMatch');
		dom.addClass(parent, 'reference');
		parent.appendChild(this.before);
		parent.appendChild(this.inside);
		parent.appendChild(this.after);
		container.appendChild(parent);
	}

	set(element: OneReference): void {
		const { before, inside, after } = element.parent.preview.preview(element.range);
		this.before.innerHTML = strings.escape(before);
		this.inside.innerHTML = strings.escape(inside);
		this.after.innerHTML = strings.escape(after);
	}
}

class Renderer implements tree.IRenderer {

	private static _ids = {
		FileReferences: 'FileReferences',
		OneReference: 'OneReference'
	};

	constructor(
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IThemeService private _themeService: IThemeService,
		@optional(IEnvironmentService) private _environmentService: IEnvironmentService,
	) {
		//
	}

	getHeight(tree: tree.ITree, element: FileReferences | OneReference): number {
		return 22;
	}

	getTemplateId(tree: tree.ITree, element: FileReferences | OneReference): string {
		if (element instanceof FileReferences) {
			return Renderer._ids.FileReferences;
		} else if (element instanceof OneReference) {
			return Renderer._ids.OneReference;
		}
		throw element;
	}

	renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement) {
		if (templateId === Renderer._ids.FileReferences) {
			return new FileReferencesTemplate(container, this._contextService, this._environmentService, this._themeService);
		} else if (templateId === Renderer._ids.OneReference) {
			return new OneReferenceTemplate(container);
		}
		throw templateId;
	}

	renderElement(tree: tree.ITree, element: FileReferences | OneReference, templateId: string, templateData: any): void {
		if (element instanceof FileReferences) {
			(<FileReferencesTemplate>templateData).set(element);
		} else if (element instanceof OneReference) {
			(<OneReferenceTemplate>templateData).set(element);
		} else {
			throw templateId;
		}
	}

	disposeTemplate(tree: tree.ITree, templateId: string, templateData: FileReferencesTemplate | OneReferenceTemplate): void {
		if (templateData instanceof FileReferencesTemplate) {
			templateData.dispose();
		}
	}
}

class AriaProvider implements tree.IAccessibilityProvider {

	getAriaLabel(tree: tree.ITree, element: FileReferences | OneReference): string {
		if (element instanceof FileReferences) {
			return element.getAriaMessage();
		} else if (element instanceof OneReference) {
			return element.getAriaMessage();
		} else {
			return undefined;
		}
	}
}

class VSash {

	private _disposables: IDisposable[] = [];
	private _sash: Sash;
	private _ratio: number;
	private _height: number;
	private _width: number;
	private _onDidChangePercentages = new Emitter<VSash>();

	constructor(container: HTMLElement, ratio: number) {
		this._ratio = ratio;
		this._sash = new Sash(container, <IVerticalSashLayoutProvider>{
			getVerticalSashLeft: () => this._width * this._ratio,
			getVerticalSashHeight: () => this._height
		});

		// compute the current widget clientX postion since
		// the sash works with clientX when dragging
		let clientX: number;
		this._disposables.push(this._sash.addListener('start', (e: ISashEvent) => {
			clientX = e.startX - (this._width * this.ratio);
		}));

		this._disposables.push(this._sash.addListener('change', (e: ISashEvent) => {
			// compute the new position of the sash and from that
			// compute the new ratio that we are using
			let newLeft = e.currentX - clientX;
			if (newLeft > 20 && newLeft + 20 < this._width) {
				this._ratio = newLeft / this._width;
				this._sash.layout();
				this._onDidChangePercentages.fire(this);
			}
		}));
	}

	dispose() {
		this._sash.dispose();
		this._onDidChangePercentages.dispose();
		dispose(this._disposables);
	}

	get onDidChangePercentages() {
		return this._onDidChangePercentages.event;
	}

	set width(value: number) {
		this._width = value;
		this._sash.layout();
	}

	set height(value: number) {
		this._height = value;
		this._sash.layout();
	}

	get percentages() {
		let left = 100 * this._ratio;
		let right = 100 - left;
		return [`${left}%`, `${right}%`];
	}

	get ratio() {
		return this._ratio;
	}
}

export interface LayoutData {
	ratio: number;
	heightInLines: number;
}

export interface SelectionEvent {
	kind: 'goto' | 'show' | 'side' | 'open';
	source: 'editor' | 'tree' | 'title';
	element: OneReference;
}

/**
 * ZoneWidget that is shown inside the editor
 */
export class ReferenceWidget extends PeekViewWidget {

	private _model: ReferencesModel;
	private _decorationsManager: DecorationsManager;

	private _disposeOnNewModel: IDisposable[] = [];
	private _callOnDispose: IDisposable[] = [];
	private _onDidSelectReference = new Emitter<SelectionEvent>();

	private _tree: Tree;
	private _treeContainer: Builder;
	private _sash: VSash;
	private _preview: ICodeEditor;
	private _previewModelReference: IReference<ITextEditorModel>;
	private _previewNotAvailableMessage: Model;
	private _previewContainer: Builder;
	private _messageContainer: Builder;

	constructor(
		editor: ICodeEditor,
		public layoutData: LayoutData,
		private _textModelResolverService: ITextModelService,
		private _contextService: IWorkspaceContextService,
		private _themeService: IThemeService,
		private _instantiationService: IInstantiationService,
		private _environmentService: IEnvironmentService
	) {
		super(editor, { showFrame: false, showArrow: true, isResizeable: true, isAccessible: true });

		this._applyTheme(_themeService.getTheme());
		this._callOnDispose.push(_themeService.onThemeChange(this._applyTheme.bind(this)));

		this._instantiationService = this._instantiationService.createChild(new ServiceCollection([IPeekViewService, this]));
		this.create();
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	public dispose(): void {
		this.setModel(null);
		this._callOnDispose = dispose(this._callOnDispose);
		dispose<IDisposable>(this._preview, this._previewNotAvailableMessage, this._tree, this._sash, this._previewModelReference);
		super.dispose();
	}

	get onDidSelectReference(): Event<SelectionEvent> {
		return this._onDidSelectReference.event;
	}

	show(where: IRange) {
		this.editor.revealRangeInCenterIfOutsideViewport(where, editorCommon.ScrollType.Smooth);
		super.show(where, this.layoutData.heightInLines || 18);
	}

	focus(): void {
		this._tree.DOMFocus();
	}

	protected _onTitleClick(e: MouseEvent): void {
		if (this._preview && this._preview.getModel()) {
			this._onDidSelectReference.fire({
				element: this._getFocusedReference(),
				kind: e.ctrlKey || e.metaKey ? 'side' : 'open',
				source: 'title'
			});
		}
	}

	protected _fillBody(containerElement: HTMLElement): void {
		var container = $(containerElement);

		this.setCssClass('reference-zone-widget');

		// message pane
		container.div({ 'class': 'messages' }, div => {
			this._messageContainer = div.hide();
		});

		// editor
		container.div({ 'class': 'preview inline' }, (div: Builder) => {

			var options: IEditorOptions = {
				scrollBeyondLastLine: false,
				scrollbar: {
					verticalScrollbarSize: 14,
					horizontal: 'auto',
					useShadows: true,
					verticalHasArrows: false,
					horizontalHasArrows: false
				},
				overviewRulerLanes: 2,
				fixedOverflowWidgets: true,
				minimap: {
					enabled: false
				}
			};

			this._preview = this._instantiationService.createInstance(EmbeddedCodeEditorWidget, div.getHTMLElement(), options, this.editor);
			this._previewContainer = div.hide();
			this._previewNotAvailableMessage = Model.createFromString(nls.localize('missingPreviewMessage', "no preview available"));
		});

		// sash
		this._sash = new VSash(containerElement, this.layoutData.ratio || .8);
		this._sash.onDidChangePercentages(() => {
			let [left, right] = this._sash.percentages;
			this._previewContainer.style({ width: left });
			this._treeContainer.style({ width: right });
			this._preview.layout();
			this._tree.layout();
			this.layoutData.ratio = this._sash.ratio;
		});

		// tree
		container.div({ 'class': 'ref-tree inline' }, (div: Builder) => {
			var config = <tree.ITreeConfiguration>{
				dataSource: this._instantiationService.createInstance(DataSource),
				renderer: this._instantiationService.createInstance(Renderer),
				controller: new Controller(),
				accessibilityProvider: new AriaProvider()
			};

			var options = {
				allowHorizontalScroll: false,
				twistiePixels: 20,
				ariaLabel: nls.localize('treeAriaLabel', "References")
			};
			this._tree = new Tree(div.getHTMLElement(), config, options);
			this._callOnDispose.push(attachListStyler(this._tree, this._themeService));

			this._treeContainer = div.hide();
		});
	}

	protected _doLayoutBody(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutBody(heightInPixel, widthInPixel);

		const height = heightInPixel + 'px';
		this._sash.height = heightInPixel;
		this._sash.width = widthInPixel;

		// set height/width
		const [left, right] = this._sash.percentages;
		this._previewContainer.style({ height, width: left });
		this._treeContainer.style({ height, width: right });

		// forward
		this._tree.layout(heightInPixel);
		this._preview.layout();

		// store layout data
		this.layoutData = {
			heightInLines: this._viewZone.heightInLines,
			ratio: this._sash.ratio
		};
	}

	public _onWidth(widthInPixel: number): void {
		this._sash.width = widthInPixel;
		this._preview.layout();
	}

	public setSelection(selection: OneReference): TPromise<any> {
		return this._revealReference(selection);
	}

	public setModel(newModel: ReferencesModel): TPromise<any> {
		// clean up
		this._disposeOnNewModel = dispose(this._disposeOnNewModel);
		this._model = newModel;
		if (this._model) {
			return this._onNewModel();
		}
		return undefined;
	}

	private _onNewModel(): TPromise<any> {

		if (this._model.empty) {
			this.setTitle('');
			this._messageContainer.innerHtml(nls.localize('noResults', "No results")).show();
			return TPromise.as(void 0);
		}

		this._messageContainer.hide();
		this._decorationsManager = new DecorationsManager(this._preview, this._model);
		this._disposeOnNewModel.push(this._decorationsManager);

		// listen on model changes
		this._disposeOnNewModel.push(this._model.onDidChangeReferenceRange(reference => this._tree.refresh(reference)));

		// listen on selection and focus
		this._disposeOnNewModel.push(this._tree.addListener(Controller.Events.FOCUSED, (element) => {
			if (element instanceof OneReference) {
				this._revealReference(element);
				this._onDidSelectReference.fire({ element, kind: 'show', source: 'tree' });
			}
		}));

		this._disposeOnNewModel.push(this._tree.addListener(Controller.Events.SELECTED, (element: any) => {
			if (element instanceof OneReference) {
				this._onDidSelectReference.fire({ element, kind: 'goto', source: 'tree' });
			}
		}));
		this._disposeOnNewModel.push(this._tree.addListener(Controller.Events.OPEN_TO_SIDE, (element: any) => {
			if (element instanceof OneReference) {
				this._onDidSelectReference.fire({ element, kind: 'side', source: 'tree' });
			}
		}));

		// listen on editor
		this._disposeOnNewModel.push(this._preview.onMouseDown((e) => {
			if (e.event.detail === 2) {
				this._onDidSelectReference.fire({
					element: this._getFocusedReference(),
					kind: (e.event.ctrlKey || e.event.metaKey) ? 'side' : 'open',
					source: 'editor'
				});
			}
		}));

		// make sure things are rendered
		dom.addClass(this.container, 'results-loaded');
		this._treeContainer.show();
		this._previewContainer.show();
		this._preview.layout();
		this._tree.layout();
		this.focus();

		// pick input and a reference to begin with
		const input = this._model.groups.length === 1 ? this._model.groups[0] : this._model;
		return this._tree.setInput(input);
	}

	private _getFocusedReference(): OneReference {
		const element = this._tree.getFocus();
		if (element instanceof OneReference) {
			return element;
		} else if (element instanceof FileReferences) {
			if (element.children.length > 0) {
				return element.children[0];
			}
		}
		return undefined;
	}

	private _revealReference(reference: OneReference) {

		// Update widget header
		if (reference.uri.scheme !== Schemas.inMemory) {
			this.setTitle(reference.name, getPathLabel(reference.directory, this._contextService, this._environmentService));
		} else {
			this.setTitle(nls.localize('peekView.alternateTitle', "References"));
		}

		const promise = this._textModelResolverService.createModelReference(reference.uri);

		return TPromise.join([promise, this._tree.reveal(reference)]).then(values => {
			const ref = values[0];

			if (!this._model) {
				ref.dispose();
				// disposed
				return;
			}

			dispose(this._previewModelReference);

			// show in editor
			const model = ref.object;
			if (model) {
				this._previewModelReference = ref;
				let isSameModel = (this._preview.getModel() === model.textEditorModel);
				this._preview.setModel(model.textEditorModel);
				var sel = Range.lift(reference.range).collapseToStart();
				this._preview.setSelection(sel);
				this._preview.revealRangeInCenter(sel, isSameModel ? editorCommon.ScrollType.Smooth : editorCommon.ScrollType.Immediate);
			} else {
				this._preview.setModel(this._previewNotAvailableMessage);
				ref.dispose();
			}

			// show in tree
			this._tree.setSelection([reference]);
			this._tree.setFocus(reference);

		}, onUnexpectedError);
	}
}

// theming

export const peekViewTitleBackground = registerColor('peekViewTitle.background', { dark: '#1E1E1E', light: '#FFFFFF', hc: '#0C141F' }, nls.localize('peekViewTitleBackground', 'Background color of the peek view title area.'));
export const peekViewTitleForeground = registerColor('peekViewTitleLabel.foreground', { dark: '#FFFFFF', light: '#333333', hc: '#FFFFFF' }, nls.localize('peekViewTitleForeground', 'Color of the peek view title.'));
export const peekViewTitleInfoForeground = registerColor('peekViewTitleDescription.foreground', { dark: '#ccccccb3', light: '#6c6c6cb3', hc: '#FFFFFF99' }, nls.localize('peekViewTitleInfoForeground', 'Color of the peek view title info.'));
export const peekViewBorder = registerColor('peekView.border', { dark: '#007acc', light: '#007acc', hc: contrastBorder }, nls.localize('peekViewBorder', 'Color of the peek view borders and arrow.'));

export const peekViewResultsBackground = registerColor('peekViewResult.background', { dark: '#252526', light: '#F3F3F3', hc: Color.black }, nls.localize('peekViewResultsBackground', 'Background color of the peek view result list.'));
export const peekViewResultsMatchForeground = registerColor('peekViewResult.lineForeground', { dark: '#bbbbbb', light: '#646465', hc: Color.white }, nls.localize('peekViewResultsMatchForeground', 'Foreground color for line nodes in the peek view result list.'));
export const peekViewResultsFileForeground = registerColor('peekViewResult.fileForeground', { dark: Color.white, light: '#1E1E1E', hc: Color.white }, nls.localize('peekViewResultsFileForeground', 'Foreground color for file nodes in the peek view result list.'));
export const peekViewResultsSelectionBackground = registerColor('peekViewResult.selectionBackground', { dark: '#3399ff33', light: '#3399ff33', hc: null }, nls.localize('peekViewResultsSelectionBackground', 'Background color of the selected entry in the peek view result list.'));
export const peekViewResultsSelectionForeground = registerColor('peekViewResult.selectionForeground', { dark: Color.white, light: '#6C6C6C', hc: Color.white }, nls.localize('peekViewResultsSelectionForeground', 'Foreground color of the selected entry in the peek view result list.'));
export const peekViewEditorBackground = registerColor('peekViewEditor.background', { dark: '#001F33', light: '#F2F8FC', hc: Color.black }, nls.localize('peekViewEditorBackground', 'Background color of the peek view editor.'));
export const peekViewEditorGutterBackground = registerColor('peekViewEditorGutter.background', { dark: peekViewEditorBackground, light: peekViewEditorBackground, hc: peekViewEditorBackground }, nls.localize('peekViewEditorGutterBackground', 'Background color of the gutter in the peek view editor.'));

export const peekViewResultsMatchHighlight = registerColor('peekViewResult.matchHighlightBackground', { dark: '#ea5c004d', light: '#ea5c004d', hc: null }, nls.localize('peekViewResultsMatchHighlight', 'Match highlight color in the peek view result list.'));
export const peekViewEditorMatchHighlight = registerColor('peekViewEditor.matchHighlightBackground', { dark: '#ff8f0099', light: '#f5d802de', hc: null }, nls.localize('peekViewEditorMatchHighlight', 'Match highlight color in the peek view editor.'));


registerThemingParticipant((theme, collector) => {
	let findMatchHighlightColor = theme.getColor(peekViewResultsMatchHighlight);
	if (findMatchHighlightColor) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .referenceMatch { background-color: ${findMatchHighlightColor}; }`);
	}
	let referenceHighlightColor = theme.getColor(peekViewEditorMatchHighlight);
	if (referenceHighlightColor) {
		collector.addRule(`.monaco-editor .reference-zone-widget .preview .reference-decoration { background-color: ${referenceHighlightColor}; }`);
	}
	let hcOutline = theme.getColor(activeContrastBorder);
	if (hcOutline) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .referenceMatch { border: 1px dotted ${hcOutline}; box-sizing: border-box; }`);
		collector.addRule(`.monaco-editor .reference-zone-widget .preview .reference-decoration { border: 2px solid ${hcOutline}; box-sizing: border-box; }`);
	}
	let resultsBackground = theme.getColor(peekViewResultsBackground);
	if (resultsBackground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree { background-color: ${resultsBackground}; }`);
	}
	let resultsMatchForeground = theme.getColor(peekViewResultsMatchForeground);
	if (resultsMatchForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree { color: ${resultsMatchForeground}; }`);
	}
	let resultsFileForeground = theme.getColor(peekViewResultsFileForeground);
	if (resultsFileForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .reference-file { color: ${resultsFileForeground}; }`);
	}
	let resultsSelectedBackground = theme.getColor(peekViewResultsSelectionBackground);
	if (resultsSelectedBackground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .monaco-tree.focused .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { background-color: ${resultsSelectedBackground}; }`);
	}
	let resultsSelectedForeground = theme.getColor(peekViewResultsSelectionForeground);
	if (resultsSelectedForeground) {
		collector.addRule(`.monaco-editor .reference-zone-widget .ref-tree .monaco-tree.focused .monaco-tree-rows > .monaco-tree-row.selected:not(.highlighted) { color: ${resultsSelectedForeground} !important; }`);
	}
	let editorBackground = theme.getColor(peekViewEditorBackground);
	if (editorBackground) {
		collector.addRule(
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .monaco-editor-background,` +
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .inputarea.ime-input {` +
			`	background-color: ${editorBackground};` +
			`}`);
	}
	let editorGutterBackground = theme.getColor(peekViewEditorGutterBackground);
	if (editorGutterBackground) {
		collector.addRule(
			`.monaco-editor .reference-zone-widget .preview .monaco-editor .margin {` +
			`	background-color: ${editorGutterBackground};` +
			`}`);
	}
});
