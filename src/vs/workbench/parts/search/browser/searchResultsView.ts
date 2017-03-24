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
import { FileLabel } from 'vs/workbench/browser/labels';
import { LeftRightWidget, IRenderer } from 'vs/base/browser/ui/leftRightWidget/leftRightWidget';
import { ITree, IElementCallback, IDataSource, ISorter, IAccessibilityProvider, IFilter } from 'vs/base/parts/tree/browser/tree';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { ContributableActionProvider } from 'vs/workbench/browser/actionBarRegistry';
import { Match, SearchResult, FileMatch, FileMatchOrMatch, SearchModel } from 'vs/workbench/parts/search/common/searchModel';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Range } from 'vs/editor/common/core/range';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { RemoveAction, ReplaceAllAction, ReplaceAction } from 'vs/workbench/parts/search/browser/searchActions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class SearchDataSource implements IDataSource {

	private static AUTOEXPAND_CHILD_LIMIT = 10;

	public getId(tree: ITree, element: any): string {
		if (element instanceof FileMatch) {
			return element.id();
		}

		if (element instanceof Match) {
			return element.id();
		}

		return 'root';
	}

	private _getChildren(element: any): any[] {
		if (element instanceof FileMatch) {
			return element.matches();
		} else if (element instanceof SearchResult) {
			return element.matches();
		}

		return [];
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		return TPromise.as(this._getChildren(element));
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

	public shouldAutoexpand(tree: ITree, element: any): boolean {
		const numChildren = this._getChildren(element).length;
		return numChildren > 0 && numChildren < SearchDataSource.AUTOEXPAND_CHILD_LIMIT;
	}
}

export class SearchSorter implements ISorter {

	public compare(tree: ITree, elementA: FileMatchOrMatch, elementB: FileMatchOrMatch): number {
		if (elementA instanceof FileMatch && elementB instanceof FileMatch) {
			return elementA.resource().fsPath.localeCompare(elementB.resource().fsPath) || elementA.name().localeCompare(elementB.name());
		}

		if (elementA instanceof Match && elementB instanceof Match) {
			return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
		}

		return undefined;
	}
}

class SearchActionProvider extends ContributableActionProvider {

	constructor(private viewlet: SearchViewlet, @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(tree: ITree, element: any): boolean {
		let input = <SearchResult>tree.getInput();
		return element instanceof FileMatch || (input.searchModel.isReplaceActive() || element instanceof Match) || super.hasActions(tree, element);
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getActions(tree, element).then(actions => {
			let input = <SearchResult>tree.getInput();
			if (element instanceof FileMatch) {
				actions.unshift(new RemoveAction(tree, element));
				if (input.searchModel.isReplaceActive() && element.count() > 0) {
					actions.unshift(this.instantiationService.createInstance(ReplaceAllAction, tree, element, this.viewlet));
				}
			}
			if (element instanceof Match) {
				if (input.searchModel.isReplaceActive()) {
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
				const label = this.instantiationService.createInstance(FileLabel, left, void 0);
				label.setFile(fileMatch.resource());

				return () => label.dispose();
			};

			rightRenderer = (right: HTMLElement) => {
				let len = fileMatch.count();

				new CountBadge(right, len, len > 1 ? nls.localize('searchMatches', "{0} matches found", len) : nls.localize('searchMatch', "{0} match found", len));
				return null;
			};

			widget = new LeftRightWidget(container, leftRenderer, rightRenderer);

			container.appendTo(domElement);

			return widget.dispose.bind(widget);
		}

		// Match
		else if (element instanceof Match) {
			dom.addClass(domElement, 'linematch');
			let match = <Match>element;
			let elements: string[] = [];
			let preview = match.preview();

			elements.push('<span>');
			elements.push(strings.escape(preview.before));
			let searchModel: SearchModel = (<SearchResult>tree.getInput()).searchModel;

			let showReplaceText = searchModel.isReplaceActive() && !!searchModel.replaceString;
			elements.push('</span><span class="' + (showReplaceText ? 'replace ' : '') + 'findInFileMatch">');
			elements.push(strings.escape(preview.inside));
			if (showReplaceText) {
				elements.push('</span><span class="replaceMatch">');
				elements.push(strings.escape(match.replaceString));
			}
			elements.push('</span><span>');
			elements.push(strings.escape(preview.after));
			elements.push('</span>');

			$('a.plain')
				.innerHtml(elements.join(strings.empty))
				.title((preview.before + (showReplaceText ? match.replaceString : preview.inside) + preview.after).trim().substr(0, 999))
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

		if (element instanceof Match) {
			let match = <Match>element;
			let input = <SearchResult>tree.getInput();
			if (input.searchModel.isReplaceActive()) {
				let preview = match.preview();
				return nls.localize('replacePreviewResultAria', "Replace preview result, {0}", preview.before + match.replaceString + preview.after);
			}
			return nls.localize('searchResultAria', "{0}, Search result", match.text());
		}
		return undefined;
	}
}

export class SearchController extends DefaultController {

	constructor(private viewlet: SearchViewlet, @IInstantiationService private instantiationService: IInstantiationService) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN, keyboardSupport: false });

		// TODO@Rob these should be commands

		// Up (from results to inputs)
		this.downKeyBindingDispatcher.set(KeyCode.UpArrow, this.onUp.bind(this));

		// Open to side
		this.upKeyBindingDispatcher.set(platform.isMacintosh ? KeyMod.WinCtrl | KeyCode.Enter : KeyMod.CtrlCmd | KeyCode.Enter, this.onEnter.bind(this));

		// Delete
		this.downKeyBindingDispatcher.set(platform.isMacintosh ? KeyMod.CtrlCmd | KeyCode.Backspace : KeyCode.Delete, (tree: ITree, event: any) => { this.onDelete(tree, event); });

		// Cancel search
		this.downKeyBindingDispatcher.set(KeyCode.Escape, (tree: ITree, event: any) => { this.onEscape(tree, event); });

		// Replace / Replace All
		this.downKeyBindingDispatcher.set(ReplaceAllAction.KEY_BINDING, (tree: ITree, event: any) => { this.onReplaceAll(tree, event); });
		this.downKeyBindingDispatcher.set(ReplaceAction.KEY_BINDING, (tree: ITree, event: any) => { this.onReplace(tree, event); });
	}

	protected onEscape(tree: ITree, event: IKeyboardEvent): boolean {
		if (this.viewlet.cancelSearch()) {
			return true;
		}

		return super.onEscape(tree, event);
	}

	private onDelete(tree: ITree, event: IKeyboardEvent): boolean {
		let input = <SearchResult>tree.getInput();
		let result = false;
		let element = tree.getFocus();
		if (element instanceof FileMatch ||
			(element instanceof Match && input.searchModel.isReplaceActive())) {
			new RemoveAction(tree, element).run().done(null, errors.onUnexpectedError);
			result = true;
		}

		return result;
	}

	private onReplace(tree: ITree, event: IKeyboardEvent): boolean {
		let input = <SearchResult>tree.getInput();
		let result = false;
		let element = tree.getFocus();
		if (element instanceof Match && input.searchModel.isReplaceActive()) {
			this.instantiationService.createInstance(ReplaceAction, tree, element, this.viewlet).run().done(null, errors.onUnexpectedError);
			result = true;
		}

		return result;
	}

	private onReplaceAll(tree: ITree, event: IKeyboardEvent): boolean {
		let result = false;
		let element = tree.getFocus();
		if (element instanceof FileMatch && element.count() > 0) {
			this.instantiationService.createInstance(ReplaceAllAction, tree, element, this.viewlet).run().done(null, errors.onUnexpectedError);
			result = true;
		}

		return result;
	}

	protected onUp(tree: ITree, event: IKeyboardEvent): boolean {
		if (tree.getNavigator().first() === tree.getFocus()) {
			this.viewlet.moveFocusFromResults();
			return true;
		}

		return false;
	}
}

export class SearchFilter implements IFilter {

	public isVisible(tree: ITree, element: any): boolean {
		return !(element instanceof FileMatch) || element.matches().length > 0;
	}
}