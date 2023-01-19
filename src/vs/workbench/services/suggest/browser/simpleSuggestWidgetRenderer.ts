/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, show } from 'vs/base/browser/dom';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IListRenderer } from 'vs/base/browser/ui/list/list';
import { SimpleCompletionItem } from 'vs/workbench/services/suggest/browser/simpleCompletionItem';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { createMatches } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';

export function getAriaId(index: number): string {
	return `simple-suggest-aria-id:${index}`;
}

export interface ISimpleSuggestionTemplateData {
	root: HTMLElement;

	/**
	 * Flexbox
	 * < ------------- left ------------ >     < --- right -- >
	 * <icon><label><signature><qualifier>     <type><readmore>
	 */
	left: HTMLElement;
	right: HTMLElement;

	icon: HTMLElement;
	colorspan: HTMLElement;
	iconLabel: IconLabel;
	iconContainer: HTMLElement;
	parametersLabel: HTMLElement;
	qualifierLabel: HTMLElement;
	/**
	 * Showing either `CompletionItem#details` or `CompletionItemLabel#type`
	 */
	detailsLabel: HTMLElement;
	readMore: HTMLElement;
	disposables: DisposableStore;
}

export class SimpleSuggestWidgetItemRenderer implements IListRenderer<SimpleCompletionItem, ISimpleSuggestionTemplateData> {

	private readonly _onDidToggleDetails = new Emitter<void>();
	readonly onDidToggleDetails: Event<void> = this._onDidToggleDetails.event;

	readonly templateId = 'suggestion';

	dispose(): void {
		this._onDidToggleDetails.dispose();
	}

	renderTemplate(container: HTMLElement): ISimpleSuggestionTemplateData {
		const data = <ISimpleSuggestionTemplateData>Object.create(null);
		data.disposables = new DisposableStore();

		data.root = container;
		data.root.classList.add('show-file-icons');

		data.icon = append(container, $('.icon'));
		data.colorspan = append(data.icon, $('span.colorspan'));

		const text = append(container, $('.contents'));
		const main = append(text, $('.main'));

		data.iconContainer = append(main, $('.icon-label.codicon'));
		data.left = append(main, $('span.left'));
		data.right = append(main, $('span.right'));

		data.iconLabel = new IconLabel(data.left, { supportHighlights: true, supportIcons: true });
		data.disposables.add(data.iconLabel);

		data.parametersLabel = append(data.left, $('span.signature-label'));
		data.qualifierLabel = append(data.left, $('span.qualifier-label'));
		data.detailsLabel = append(data.right, $('span.details-label'));

		// data.readMore = append(data.right, $('span.readMore' + ThemeIcon.asCSSSelector(suggestMoreInfoIcon)));
		// data.readMore.title = localize('readMore', "Read More");

		const configureFont = () => {
			// TODO: Implement
			// const options = this._editor.getOptions();
			// const fontInfo = options.get(EditorOption.fontInfo);
			const fontFamily = 'Hack'; //fontInfo.getMassagedFontFamily();
			const fontFeatureSettings = ''; //fontInfo.fontFeatureSettings;
			const fontSize = '12'; // = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
			const lineHeight = '20'; // options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
			const fontWeight = 'normal'; //fontInfo.fontWeight;
			const letterSpacing = '0'; // fontInfo.letterSpacing;
			const fontSizePx = `${fontSize}px`;
			const lineHeightPx = `${lineHeight}px`;
			const letterSpacingPx = `${letterSpacing}px`;

			data.root.style.fontSize = fontSizePx;
			data.root.style.fontWeight = fontWeight;
			data.root.style.letterSpacing = letterSpacingPx;
			main.style.fontFamily = fontFamily;
			main.style.fontFeatureSettings = fontFeatureSettings;
			main.style.lineHeight = lineHeightPx;
			data.icon.style.height = lineHeightPx;
			data.icon.style.width = lineHeightPx;
			// data.readMore.style.height = lineHeightPx;
			// data.readMore.style.width = lineHeightPx;
		};

		configureFont();

		// data.disposables.add(this._editor.onDidChangeConfiguration(e => {
		// 	if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.suggestFontSize) || e.hasChanged(EditorOption.suggestLineHeight)) {
		// 		configureFont();
		// 	}
		// }));

		return data;
	}

	renderElement(element: SimpleCompletionItem, index: number, data: ISimpleSuggestionTemplateData): void {
		const { completion } = element;
		data.root.id = getAriaId(index);
		data.colorspan.style.backgroundColor = '';

		const labelOptions: IIconLabelValueOptions = {
			labelEscapeNewLines: true,
			matches: createMatches(element.score)
		};

		// const color: string[] = [];
		// if (completion.kind === CompletionItemKind.Color && _completionItemColor.extract(element, color)) {
		// 	// special logic for 'color' completion items
		// 	data.icon.className = 'icon customcolor';
		// 	data.iconContainer.className = 'icon hide';
		// 	data.colorspan.style.backgroundColor = color[0];

		// } else if (completion.kind === CompletionItemKind.File && this._themeService.getFileIconTheme().hasFileIcons) {
		// 	// special logic for 'file' completion items
		// 	data.icon.className = 'icon hide';
		// 	data.iconContainer.className = 'icon hide';
		// 	const labelClasses = getIconClasses(this._modelService, this._languageService, URI.from({ scheme: 'fake', path: element.textLabel }), FileKind.FILE);
		// 	const detailClasses = getIconClasses(this._modelService, this._languageService, URI.from({ scheme: 'fake', path: completion.detail }), FileKind.FILE);
		// 	labelOptions.extraClasses = labelClasses.length > detailClasses.length ? labelClasses : detailClasses;

		// } else if (completion.kind === CompletionItemKind.Folder && this._themeService.getFileIconTheme().hasFolderIcons) {
		// 	// special logic for 'folder' completion items
		// 	data.icon.className = 'icon hide';
		// 	data.iconContainer.className = 'icon hide';
		// 	labelOptions.extraClasses = [
		// 		getIconClasses(this._modelService, this._languageService, URI.from({ scheme: 'fake', path: element.textLabel }), FileKind.FOLDER),
		// 		getIconClasses(this._modelService, this._languageService, URI.from({ scheme: 'fake', path: completion.detail }), FileKind.FOLDER)
		// 	].flat();
		// } else {
		// normal icon
		data.icon.className = 'icon hide';
		data.iconContainer.className = '';
		data.iconContainer.classList.add('suggest-icon', ...ThemeIcon.asClassNameArray(completion.icon || Codicon.symbolText));
		// }

		// if (completion.tags && completion.tags.indexOf(CompletionItemTag.Deprecated) >= 0) {
		// 	labelOptions.extraClasses = (labelOptions.extraClasses || []).concat(['deprecated']);
		// 	labelOptions.matches = [];
		// }

		data.iconLabel.setLabel(completion.label, undefined, labelOptions);
		// if (typeof completion.label === 'string') {
		data.parametersLabel.textContent = '';
		data.detailsLabel.textContent = stripNewLines(completion.detail || '');
		data.root.classList.add('string-label');
		// } else {
		// 	data.parametersLabel.textContent = stripNewLines(completion.label.detail || '');
		// 	data.detailsLabel.textContent = stripNewLines(completion.label.description || '');
		// 	data.root.classList.remove('string-label');
		// }

		// if (this._editor.getOption(EditorOption.suggest).showInlineDetails) {
		show(data.detailsLabel);
		// } else {
		// 	hide(data.detailsLabel);
		// }

		// if (canExpandCompletionItem(element)) {
		// 	data.right.classList.add('can-expand-details');
		// 	show(data.readMore);
		// 	data.readMore.onmousedown = e => {
		// 		e.stopPropagation();
		// 		e.preventDefault();
		// 	};
		// 	data.readMore.onclick = e => {
		// 		e.stopPropagation();
		// 		e.preventDefault();
		// 		this._onDidToggleDetails.fire();
		// 	};
		// } else {
		data.right.classList.remove('can-expand-details');
		// hide(data.readMore);
		// data.readMore.onmousedown = null;
		// data.readMore.onclick = null;
		// }
	}

	disposeTemplate(templateData: ISimpleSuggestionTemplateData): void {
		templateData.disposables.dispose();
	}
}

function stripNewLines(str: string): string {
	return str.replace(/\r\n|\r|\n/g, '');
}
