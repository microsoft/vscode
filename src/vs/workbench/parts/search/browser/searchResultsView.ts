/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import platform = require('vs/base/common/platform');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import dom = require('vs/base/browser/dom');
import { $ } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { ActionsRenderer } from 'vs/base/parts/tree/browser/actionsRenderer';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel } from 'vs/base/browser/ui/fileLabel/fileLabel';
import { LeftRightWidget, IRenderer } from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import { ITree, IElementCallback, IDataSource, ISorter, IAccessibilityProvider, IFilter } from 'vs/base/parts/tree/browser/tree';
import {ClickBehavior, DefaultController} from 'vs/base/parts/tree/browser/treeDefaults';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { Match, EmptyMatch, SearchResult, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Range } from 'vs/editor/common/core/range';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { CommonKeybindings}  from 'vs/base/common/keyCodes';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { RemoveAction, ReplaceAllAction, ReplaceAction } from 'vs/workbench/parts/search/browser/searchActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class SearchDataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		if (element instanceof FileMatch) {
			return element.id();
		}

		if (element instanceof Match) {
			return element.id();
		}

		return 'root';
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		let value: any[] = [];

		if (element instanceof FileMatch) {
			value = element.matches();
		} else if (element instanceof SearchResult) {
			value = element.matches();
		}

		return TPromise.as(value);
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof FileMatch || element instanceof SearchResult;
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		let value: any = null;

		if (element instanceof Match) {
			value = element.parent();
		} else if (element instanceof FileMatch) {
			value = element.parent();
		}

		return TPromise.as(value);
	}
}

export class SearchSorter implements ISorter {

	public compare(tree: ITree, elementA: FileMatchOrMatch, elementB: FileMatchOrMatch): number {
		if (elementA instanceof FileMatch && elementB instanceof FileMatch) {
			return strings.localeCompare(elementA.resource().fsPath, elementB.resource().fsPath) || strings.localeCompare(elementA.name(), elementB.name());
		}

		if (elementA instanceof Match && elementB instanceof Match) {
			return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
		}
	}
}

class SearchActionProvider extends ContributableActionProvider {

	constructor(private viewlet: SearchViewlet, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(tree: ITree, element: any): boolean {
		return element instanceof FileMatch || (tree.getInput().isReplaceActive() || element instanceof Match) || super.hasActions(tree, element);
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getActions(tree, element).then(actions => {
			if (element instanceof FileMatch) {
				actions.unshift(new RemoveAction(tree, element));
				if (tree.getInput().isReplaceActive() && element.count() > 0) {
					actions.unshift(this.instantiationService.createInstance(ReplaceAllAction, tree, element, this.viewlet));
				}
			}
			if (element instanceof Match && !(element instanceof EmptyMatch)) {
				if (tree.getInput().isReplaceActive()) {
					actions.unshift(this.instantiationService.createInstance(ReplaceAction, tree, element, this.viewlet), new RemoveAction(tree, element));
				}
			}

			return actions;
		});
	}
}

export class SearchRenderer extends ActionsRenderer {

	constructor(actionRunner: IActionRunner, viewlet: SearchViewlet, @IWorkspaceContextService private contextService: IWorkspaceContextService,
											@IInstantiationService private instantiationService: IInstantiationService) {
		super({
			actionProvider: instantiationService.createInstance(SearchActionProvider, viewlet),
			actionRunner: actionRunner
		});
	}

	public getContentHeight(tree: ITree, element: any): number {
		return 22;
	}

	public renderContents(tree: ITree, element: FileMatchOrMatch, domElement: HTMLElement, previousCleanupFn: IElementCallback): IElementCallback {

		// File
		if (element instanceof FileMatch) {
			let fileMatch = <FileMatch>element;
			let container = $('.filematch');
			let leftRenderer: IRenderer;
			let rightRenderer: IRenderer;
			let widget: LeftRightWidget;

			leftRenderer = (left: HTMLElement): any => {
				new FileLabel(left, fileMatch.resource(), this.contextService);

				return null;
			};

			rightRenderer = (right: HTMLElement) => {
				let len = fileMatch.count();

				return new CountBadge(right, len, len > 1 ? nls.localize('searchMatches', "{0} matches found", len) : nls.localize('searchMatch', "{0} match found", len));
			};

			widget = new LeftRightWidget(container, leftRenderer, rightRenderer);

			container.appendTo(domElement);

			return widget.dispose.bind(widget);
		}

		// Empty
		else if (element instanceof EmptyMatch) {
			dom.addClass(domElement, 'linematch');
			$('a.plain.label').innerHtml(nls.localize('noMatches', "no matches")).appendTo(domElement);
		}

		// Match
		else if (element instanceof Match) {
			dom.addClass(domElement, 'linematch');

			let elements: string[] = [];
			let preview = element.preview();

			elements.push('<span>');
			elements.push(strings.escape(preview.before));

			let input= <SearchResult>tree.getInput();
			let showReplaceText= input.isReplaceActive() && !!input.replaceText;
			elements.push('</span><span class="' + (showReplaceText ? 'replace ' : '') + 'findInFileMatch">');
			elements.push(strings.escape(preview.inside));
			if (showReplaceText) {
				elements.push('</span><span class="replaceMatch">');
				elements.push(strings.escape(input.replaceText));
			}
			elements.push('</span><span>');
			elements.push(strings.escape(preview.after));
			elements.push('</span>');

			$('a.plain')
				.innerHtml(elements.join(strings.empty))
				.title((preview.before + (input.isReplaceActive() ? input.replaceText : preview.inside) + preview.after).trim().substr(0, 999))
				.appendTo(domElement);
		}

		return null;
	}
}

export class SearchAccessibilityProvider implements IAccessibilityProvider {

	constructor( @IWorkspaceContextService private contextService: IWorkspaceContextService) {
	}

	public getAriaLabel(tree: ITree, element: FileMatchOrMatch): string {
		if (element instanceof FileMatch) {
			const path = this.contextService.toWorkspaceRelativePath(element.resource()) || element.resource().fsPath;

			return nls.localize('fileMatchAriaLabel', "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
		}

		if (element instanceof EmptyMatch) {
			return nls.localize('emptyMatchAriaLabel', "No matches");
		}

		if (element instanceof Match) {
			let input= <SearchResult>tree.getInput();
			if (input.isReplaceActive()) {
				let preview = element.preview();
				return nls.localize('replacePreviewResultAria', "Replace preview result, {0}", preview.before + input.replaceText + preview.after);
			}
			return nls.localize('searchResultAria', "{0}, Search result", element.text());
		}
	}
}

export class SearchController extends DefaultController {

	constructor(private viewlet: SearchViewlet) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN });

		if (platform.isMacintosh) {
			this.downKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_BACKSPACE, (tree: ITree, event: any) => { this.onDelete(tree, event); });
			this.upKeyBindingDispatcher.set(CommonKeybindings.WINCTRL_ENTER, this.onEnter.bind(this));
		} else {
			this.downKeyBindingDispatcher.set(CommonKeybindings.DELETE, (tree: ITree, event: any) => { this.onDelete(tree, event); });
			this.upKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_ENTER, this.onEnter.bind(this));
		}

		this.downKeyBindingDispatcher.set(CommonKeybindings.ESCAPE, (tree: ITree, event: any) => { this.onEscape(tree, event); });
	}

	protected onEscape(tree: ITree, event: IKeyboardEvent): boolean {
		if (this.viewlet.cancelSearch()) {
			return true;
		}

		return super.onEscape(tree, event);
	}

	private onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		let result = false;
		let element = tree.getFocus();
		if (element instanceof FileMatch ||
				(element instanceof Match && tree.getInput().isReplaceActive() && !(element instanceof EmptyMatch))) {
			new RemoveAction(tree, element).run().done(null, errors.onUnexpectedError);
			result = true;
		}

		return result;
	}

	protected onUp(tree: ITree, event: IKeyboardEvent): boolean {
		if (tree.getNavigator().first() === tree.getFocus()) {
			this.viewlet.moveFocusFromResults();
			return true;
		}
		return super.onUp(tree, event);
	}
}

export class SearchFilter implements IFilter {

	public isVisible(tree: ITree, element: any): boolean {
		return !(element instanceof FileMatch) || element.matches().length > 0;
	}
}