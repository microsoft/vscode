/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { DiffList, DiffListDelegate, DiffListResourceRenderer, IDiffListResource } from 'vs/workbench/contrib/diffListEditor/browser/diffList';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { getListStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';

export class DiffListEditorInputData {
	constructor(
		readonly resource: URI,
		readonly original: URI | undefined,
		readonly modified: URI | undefined
	) { }
}

export class DiffListEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.diffListEditor';

	get resource(): URI | undefined {
		return undefined;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override get typeId(): string {
		return DiffListEditorInput.ID;
	}

	override getName(): string {
		return localize('name', "Diff List Editor");
	}

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	constructor(readonly resources: DiffListEditorInputData[]) {
		super();
	}
}

export class DiffListEditor extends EditorPane {

	static readonly ID = 'diffListEditor';

	private _list!: DiffList;

	private _resourceRenderer!: DiffListResourceRenderer;

	private _rootHtmlElement: HTMLElement | undefined;
	private _listContainerHtmlElement: HTMLElement | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: InstantiationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService
	) {
		super(DiffListEditor.ID, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._rootHtmlElement = DOM.append(parent, DOM.$('.diff-list-editor'));
		this._listContainerHtmlElement = DOM.append(this._rootHtmlElement, DOM.$('.diff-list-container'));

		this._resourceRenderer = this.instantiationService.createInstance(DiffListResourceRenderer);

		this._list = this.instantiationService.createInstance(
			DiffList,
			'DiffList',
			this._listContainerHtmlElement,
			this.instantiationService.createInstance(DiffListDelegate),
			[this._resourceRenderer],
			{
				supportDynamicHeights: true,
			}
		);

		this._register(this._list);
		this._list.style(getListStyles({
			listHoverBackground: 'transparent',
			listHoverForeground: 'transparent',
			listFocusBackground: 'transparent',
			listInactiveFocusBackground: 'transparent',
			listInactiveFocusOutline: 'transparent',
			listInactiveSelectionBackground: 'transparent',
			listActiveSelectionBackground: 'transparent',
			listFocusAndSelectionOutline: 'transparent',
			listFocusAndSelectionBackground: 'transparent'
		}));

		this._list.onMouseClick(e => {
			e.browserEvent.preventDefault();

			if (!e.browserEvent.target) {
				return;
			}

			const target = e.browserEvent.target as HTMLElement;
			if (!target.parentElement?.parentElement?.classList.contains('resource-header')
			) {
				return;
			}

			const element = this._list.element(e.index!);
			this._list.splice(e.index!, 1, [{ ...element, expanded: !element.expanded }]);
		});
	}

	override async setInput(input: DiffListEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		const resources: IDiffListResource[] = [];

		for (const resource of input.resources) {
			const originalRef = await this.textModelService.createModelReference(resource.original!);
			const modifiedRef = await this.textModelService.createModelReference(resource.modified!);

			resources.push({
				resource: resource.resource,
				original: resource.original,
				originalTextModel: originalRef.object.textEditorModel,
				modified: resource.modified,
				modifiedTextModel: modifiedRef.object.textEditorModel,
				expanded: true
			});
		}

		this._list.splice(0, this._list.length, resources);
	}

	layout(dimension: DOM.Dimension, position?: DOM.IDomPosition | undefined): void {
		this._list.layout(dimension.height, dimension.width);
		this._resourceRenderer.layoutEditors(dimension.width);
	}
}
