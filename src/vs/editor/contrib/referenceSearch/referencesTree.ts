/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { ReferencesModel, FileReferences, OneReference } from './referencesModel';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITreeRenderer, ITreeNode, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ILabelService } from 'vs/platform/label/common/label';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { getBaseLabel } from 'vs/base/common/labels';
import { dirname } from 'vs/base/common/resources';
import { escape } from 'vs/base/common/strings';
import { Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IListVirtualDelegate, IKeyboardNavigationLabelProvider } from 'vs/base/browser/ui/list/list';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { basename } from 'vs/base/common/paths';

//#region data source

export type TreeElement = FileReferences | OneReference;

export class DataSource implements IAsyncDataSource<ReferencesModel | FileReferences, TreeElement> {

	constructor(@ITextModelService private readonly _resolverService: ITextModelService) { }

	hasChildren(element: ReferencesModel | FileReferences | TreeElement): boolean {
		if (element instanceof ReferencesModel) {
			return true;
		}
		if (element instanceof FileReferences && !element.failure) {
			return true;
		}
		return false;
	}

	getChildren(element: ReferencesModel | FileReferences | TreeElement): TreeElement[] | Promise<TreeElement[]> {
		if (element instanceof ReferencesModel) {
			return element.groups;
		}

		if (element instanceof FileReferences) {
			return element.resolve(this._resolverService).then(val => {
				// if (element.failure) {
				// 	// refresh the element on failure so that
				// 	// we can update its rendering
				// 	return tree.refresh(element).then(() => val.children);
				// }
				return val.children;
			});
		}

		throw new Error('bad tree');
	}
}

//#endregion

export class Delegate implements IListVirtualDelegate<TreeElement> {
	getHeight(): number {
		return 23;
	}
	getTemplateId(element: FileReferences | OneReference): string {
		if (element instanceof FileReferences) {
			return FileReferencesRenderer.id;
		} else {
			return OneReferenceRenderer.id;
		}
	}
}

export class StringRepresentationProvider implements IKeyboardNavigationLabelProvider<TreeElement> {

	constructor(@IKeybindingService private readonly _keybindingService: IKeybindingService) { }

	getKeyboardNavigationLabel(element: TreeElement): { toString(): string; } {
		// todo@joao `OneReference` elements are lazy and their "real" label
		// isn't known yet
		return basename(element.uri.path);
	}

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		return this._keybindingService.mightProducePrintableCharacter(event);
	}
}

//#region render: File

class FileReferencesTemplate extends Disposable {

	readonly file: IconLabel;
	readonly badge: CountBadge;

	constructor(
		container: HTMLElement,
		@ILabelService private readonly _uriLabel: ILabelService,
		@IThemeService themeService: IThemeService,
	) {
		super();
		const parent = document.createElement('div');
		dom.addClass(parent, 'reference-file');
		this.file = this._register(new IconLabel(parent));

		this.badge = new CountBadge(dom.append(parent, dom.$('.count')));
		this._register(attachBadgeStyler(this.badge, themeService));

		container.appendChild(parent);
	}

	set(element: FileReferences) {
		let parent = dirname(element.uri);
		this.file.setLabel(getBaseLabel(element.uri), parent ? this._uriLabel.getUriLabel(parent, { relative: true }) : undefined, { title: this._uriLabel.getUriLabel(element.uri) });
		const len = element.children.length;
		this.badge.setCount(len);
		if (element.failure) {
			this.badge.setTitleFormat(localize('referencesFailre', "Failed to resolve file."));
		} else if (len > 1) {
			this.badge.setTitleFormat(localize('referencesCount', "{0} references", len));
		} else {
			this.badge.setTitleFormat(localize('referenceCount', "{0} reference", len));
		}
	}
}

export class FileReferencesRenderer implements ITreeRenderer<FileReferences, void, FileReferencesTemplate> {

	static readonly id = 'FileReferencesRenderer';

	readonly templateId: string = FileReferencesRenderer.id;

	constructor(@IInstantiationService private readonly _instantiationService: IInstantiationService) { }

	renderTemplate(container: HTMLElement): FileReferencesTemplate {
		return this._instantiationService.createInstance(FileReferencesTemplate, container);
	}
	renderElement(node: ITreeNode<FileReferences, void>, index: number, template: FileReferencesTemplate): void {
		template.set(node.element);
	}
	disposeTemplate(templateData: FileReferencesTemplate): void {
		templateData.dispose();
	}
}

//#endregion

//#region render: Reference
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
		const filePreview = element.parent.preview;
		const preview = filePreview && filePreview.preview(element.range);
		if (preview) {
			const { before, inside, after } = preview;
			this.before.innerHTML = escape(before);
			this.inside.innerHTML = escape(inside);
			this.after.innerHTML = escape(after);
		}
	}
}

export class OneReferenceRenderer implements ITreeRenderer<OneReference, void, OneReferenceTemplate> {

	static readonly id = 'OneReferenceRenderer';

	readonly templateId: string = OneReferenceRenderer.id;

	renderTemplate(container: HTMLElement): OneReferenceTemplate {
		return new OneReferenceTemplate(container);
	}
	renderElement(element: ITreeNode<OneReference, void>, index: number, templateData: OneReferenceTemplate): void {
		templateData.set(element.element);
	}
	disposeTemplate(): void {
		//
	}
}

//#endregion


export class AriaProvider implements IAccessibilityProvider<FileReferences | OneReference> {

	getAriaLabel(element: FileReferences | OneReference): string | null {
		if (element instanceof FileReferences) {
			return element.getAriaMessage();
		} else if (element instanceof OneReference) {
			return element.getAriaMessage();
		} else {
			return null;
		}
	}
}
