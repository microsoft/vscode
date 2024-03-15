/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, h } from 'vs/base/browser/dom';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EmbeddedCodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/embeddedCodeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import * as editorColorRegistry from 'vs/editor/common/core/editorColorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INLINE_CHAT_ID, inlineChatRegionHighlight } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Position } from 'vs/editor/common/core/position';
import { EditorExtensionsRegistry } from 'vs/editor/browser/editorExtensions';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { FileKind } from 'vs/platform/files/common/files';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ButtonBar, IButton } from 'vs/base/browser/ui/button/button';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { SaveReason, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IAction, toAction } from 'vs/base/common/actions';
import { IUntitledTextEditorModel } from 'vs/workbench/services/untitled/common/untitledTextEditorModel';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { TAB_ACTIVE_MODIFIED_BORDER } from 'vs/workbench/common/theme';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';

export class InlineChatFileCreatePreviewWidget extends ZoneWidget {

	private static TitleHeight = 35;

	private readonly _elements = h('div.inline-chat-newfile-widget@domNode', [
		h('div.title@title', [
			h('span.name.show-file-icons@name'),
			h('span.detail@detail'),
		]),
		h('div.editor@editor'),
	]);

	private readonly _name: ResourceLabel;
	private readonly _previewEditor: ICodeEditor;
	private readonly _previewStore = new MutableDisposable();
	private readonly _buttonBar: ButtonBarWidget;
	private _dim: Dimension | undefined;

	constructor(
		parentEditor: ICodeEditor,
		@IInstantiationService instaService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ITextModelService private readonly _textModelResolverService: ITextModelService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(parentEditor, {
			showArrow: false,
			showFrame: true,
			frameColor: colorRegistry.asCssVariable(TAB_ACTIVE_MODIFIED_BORDER),
			frameWidth: 1,
			isResizeable: true,
			isAccessible: true,
			showInHiddenAreas: true,
			ordinal: 10000 + 2
		});
		super.create();

		this._name = instaService.createInstance(ResourceLabel, this._elements.name, { supportIcons: true });
		this._elements.detail.appendChild(renderIcon(Codicon.circleFilled));

		const contributions = EditorExtensionsRegistry
			.getEditorContributions()
			.filter(c => c.id !== INLINE_CHAT_ID);

		this._previewEditor = instaService.createInstance(EmbeddedCodeEditorWidget, this._elements.editor, {
			scrollBeyondLastLine: false,
			stickyScroll: { enabled: false },
			minimap: { enabled: false },
			scrollbar: { alwaysConsumeMouseWheel: false, useShadows: true, ignoreHorizontalScrollbarInContentHeight: true, },
		}, { isSimpleWidget: true, contributions }, parentEditor);

		const doStyle = () => {
			const theme = themeService.getColorTheme();
			const overrides: [target: string, source: string][] = [
				[colorRegistry.editorBackground, inlineChatRegionHighlight],
				[editorColorRegistry.editorGutter, inlineChatRegionHighlight],
			];

			for (const [target, source] of overrides) {
				const value = theme.getColor(source);
				if (value) {
					this._elements.domNode.style.setProperty(colorRegistry.asCssVariableName(target), String(value));
				}
			}
		};
		doStyle();
		this._disposables.add(themeService.onDidColorThemeChange(doStyle));

		this._buttonBar = instaService.createInstance(ButtonBarWidget);
		this._elements.title.appendChild(this._buttonBar.domNode);
	}

	override dispose(): void {
		this._name.dispose();
		this._buttonBar.dispose();
		this._previewEditor.dispose();
		this._previewStore.dispose();
		super.dispose();
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this._elements.domNode);
	}

	override show(): void {
		throw new Error('Use showFileCreation');
	}

	async showCreation(where: Position, untitledTextModel: IUntitledTextEditorModel): Promise<void> {

		const store = new DisposableStore();
		this._previewStore.value = store;

		this._name.element.setFile(untitledTextModel.resource, {
			fileKind: FileKind.FILE,
			fileDecorations: { badges: true, colors: true }
		});

		const actionSave = toAction({
			id: '1',
			label: localize('save', "Create"),
			run: () => untitledTextModel.save({ reason: SaveReason.EXPLICIT })
		});
		const actionSaveAs = toAction({
			id: '2',
			label: localize('saveAs', "Create As"),
			run: async () => {
				const ids = this._editorService.findEditors(untitledTextModel.resource, { supportSideBySide: SideBySideEditor.ANY });
				await this._editorService.save(ids.slice(), { saveAs: true, reason: SaveReason.EXPLICIT });
			}
		});

		this._buttonBar.update([
			[actionSave, actionSaveAs],
			[(toAction({ id: '3', label: localize('discard', "Discard"), run: () => untitledTextModel.revert() }))]
		]);

		store.add(Event.any(
			untitledTextModel.onDidRevert,
			untitledTextModel.onDidSave,
			untitledTextModel.onDidChangeDirty,
			untitledTextModel.onWillDispose
		)(() => this.hide()));

		await untitledTextModel.resolve();

		const ref = await this._textModelResolverService.createModelReference(untitledTextModel.resource);
		store.add(ref);

		const model = ref.object.textEditorModel;
		this._previewEditor.setModel(model);

		const lineHeight = this.editor.getOption(EditorOption.lineHeight);

		this._elements.title.style.height = `${InlineChatFileCreatePreviewWidget.TitleHeight}px`;
		const titleHightInLines = InlineChatFileCreatePreviewWidget.TitleHeight / lineHeight;

		const maxLines = Math.max(4, Math.floor((this.editor.getLayoutInfo().height / lineHeight) * .33));
		const lines = Math.min(maxLines, model.getLineCount());

		super.show(where, titleHightInLines + lines);
	}

	override hide(): void {
		this._previewStore.clear();
		super.hide();
	}

	// --- layout

	protected override revealRange(range: Range, isLastLine: boolean): void {
		// ignore
	}

	protected override _onWidth(widthInPixel: number): void {
		if (this._dim) {
			this._doLayout(this._dim.height, widthInPixel);
		}
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {

		const { lineNumbersLeft } = this.editor.getLayoutInfo();
		this._elements.title.style.marginLeft = `${lineNumbersLeft}px`;

		const newDim = new Dimension(widthInPixel, heightInPixel);
		if (!Dimension.equals(this._dim, newDim)) {
			this._dim = newDim;
			this._previewEditor.layout(this._dim.with(undefined, this._dim.height - InlineChatFileCreatePreviewWidget.TitleHeight));
		}
	}
}


class ButtonBarWidget {

	private readonly _domNode = h('div.buttonbar-widget');
	private readonly _buttonBar: ButtonBar;
	private readonly _store = new DisposableStore();

	constructor(
		@IContextMenuService private _contextMenuService: IContextMenuService,
	) {
		this._buttonBar = new ButtonBar(this.domNode);

	}

	update(allActions: IAction[][]): void {
		this._buttonBar.clear();
		let secondary = false;
		for (const actions of allActions) {
			let btn: IButton;
			const [first, ...rest] = actions;
			if (!first) {
				continue;
			} else if (rest.length === 0) {
				// single action
				btn = this._buttonBar.addButton({ ...defaultButtonStyles, secondary });
			} else {
				btn = this._buttonBar.addButtonWithDropdown({
					...defaultButtonStyles,
					addPrimaryActionToDropdown: false,
					actions: rest,
					contextMenuProvider: this._contextMenuService
				});
			}
			btn.label = first.label;
			this._store.add(btn.onDidClick(() => first.run()));
			secondary = true;
		}
	}

	dispose(): void {
		this._buttonBar.dispose();
		this._store.dispose();
	}

	get domNode() {
		return this._domNode.root;
	}
}
