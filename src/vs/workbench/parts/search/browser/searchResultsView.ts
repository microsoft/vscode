/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { IAction } from 'vs/base/common/actions';
import { Disposable } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/paths';
import * as resources from 'vs/base/common/resources';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ISearchConfigurationProperties } from 'vs/platform/search/common/search';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { RemoveAction, ReplaceAction, ReplaceAllAction, ReplaceAllInFolderAction } from 'vs/workbench/parts/search/browser/searchActions';
import { SearchView } from 'vs/workbench/parts/search/browser/searchView';
import { FileMatch, FolderMatch, Match, RenderableMatch, SearchModel } from 'vs/workbench/parts/search/common/searchModel';

interface IFolderMatchTemplate {
	label: IResourceLabel;
	badge: CountBadge;
	actions: ActionBar;
}

interface IFileMatchTemplate {
	el: HTMLElement;
	label: IResourceLabel;
	badge: CountBadge;
	actions: ActionBar;
}

interface IMatchTemplate {
	parent: HTMLElement;
	before: HTMLElement;
	match: HTMLElement;
	replace: HTMLElement;
	after: HTMLElement;
	lineNumber: HTMLElement;
	actions: ActionBar;
}

export class SearchDelegate implements IListVirtualDelegate<RenderableMatch> {

	getHeight(element: RenderableMatch): number {
		return 22;
	}

	getTemplateId(element: RenderableMatch): string {
		if (element instanceof FolderMatch) {
			return FolderMatchRenderer.TEMPLATE_ID;
		} else if (element instanceof FileMatch) {
			return FileMatchRenderer.TEMPLATE_ID;
		} else if (element instanceof Match) {
			return MatchRenderer.TEMPLATE_ID;
		}

		return null;
	}
}

export class FolderMatchRenderer extends Disposable implements ITreeRenderer<FolderMatch, any, IFolderMatchTemplate> {
	static readonly TEMPLATE_ID = 'folderMatch';

	readonly templateId = FolderMatchRenderer.TEMPLATE_ID;

	constructor(
		private searchModel: SearchModel,
		private searchView: SearchView,
		private labels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IFolderMatchTemplate {
		const folderMatchElement = DOM.append(container, DOM.$('.foldermatch'));
		const label = this.labels.create(folderMatchElement);
		const badge = new CountBadge(DOM.append(folderMatchElement, DOM.$('.badge')));
		this._register(attachBadgeStyler(badge, this.themeService));
		const actionBarContainer = DOM.append(folderMatchElement, DOM.$('.actionBarContainer'));
		const actions = new ActionBar(actionBarContainer, { animated: false });

		return { label, badge, actions };
	}

	renderElement(node: ITreeNode<FolderMatch, any>, index: number, templateData: IFolderMatchTemplate): void {
		const folderMatch = node.element;
		if (folderMatch.hasResource()) {
			const workspaceFolder = this.contextService.getWorkspaceFolder(folderMatch.resource());
			if (workspaceFolder && resources.isEqual(workspaceFolder.uri, folderMatch.resource())) {
				templateData.label.setFile(folderMatch.resource(), { fileKind: FileKind.ROOT_FOLDER, hidePath: true });
			} else {
				templateData.label.setFile(folderMatch.resource(), { fileKind: FileKind.FOLDER });
			}
		} else {
			templateData.label.setLabel(nls.localize('searchFolderMatch.other.label', "Other files"));
		}
		const count = folderMatch.fileCount();
		templateData.badge.setCount(count);
		templateData.badge.setTitleFormat(count > 1 ? nls.localize('searchFileMatches', "{0} files found", count) : nls.localize('searchFileMatch', "{0} file found", count));

		templateData.actions.clear();

		const actions: IAction[] = [];
		if (this.searchModel.isReplaceActive() && count > 0) {
			actions.push(this.instantiationService.createInstance(ReplaceAllInFolderAction, this.searchView.getControl(), folderMatch));
		}

		actions.push(new RemoveAction(this.searchView, this.searchView.getControl(), folderMatch));
		templateData.actions.push(actions, { icon: true, label: false });
	}

	disposeElement(element: ITreeNode<RenderableMatch, any>, index: number, templateData: IFolderMatchTemplate): void {
	}

	disposeTemplate(templateData: IFolderMatchTemplate): void {
		templateData.label.dispose();
		templateData.actions.dispose();
	}
}

export class FileMatchRenderer extends Disposable implements ITreeRenderer<FileMatch, any, IFileMatchTemplate> {
	static readonly TEMPLATE_ID = 'fileMatch';

	readonly templateId = FileMatchRenderer.TEMPLATE_ID;

	constructor(
		private searchModel: SearchModel,
		private searchView: SearchView,
		private labels: ResourceLabels,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IFileMatchTemplate {
		const fileMatchElement = DOM.append(container, DOM.$('.filematch'));
		const label = this.labels.create(fileMatchElement);
		const badge = new CountBadge(DOM.append(fileMatchElement, DOM.$('.badge')));
		this._register(attachBadgeStyler(badge, this.themeService));
		const actionBarContainer = DOM.append(fileMatchElement, DOM.$('.actionBarContainer'));
		const actions = new ActionBar(actionBarContainer, { animated: false });
		return { el: fileMatchElement, label, badge, actions };
	}

	renderElement(node: ITreeNode<FileMatch, any>, index: number, templateData: IFileMatchTemplate): void {
		const fileMatch = node.element;
		templateData.el.setAttribute('data-resource', fileMatch.resource().toString());
		templateData.label.setFile(fileMatch.resource(), { hideIcon: false });
		const count = fileMatch.count();
		templateData.badge.setCount(count);
		templateData.badge.setTitleFormat(count > 1 ? nls.localize('searchMatches', "{0} matches found", count) : nls.localize('searchMatch', "{0} match found", count));

		templateData.actions.clear();

		const actions: IAction[] = [];
		if (this.searchModel.isReplaceActive() && count > 0) {
			actions.push(this.instantiationService.createInstance(ReplaceAllAction, this.searchView, fileMatch));
		}
		actions.push(new RemoveAction(this.searchView, this.searchView.getControl(), fileMatch));
		templateData.actions.push(actions, { icon: true, label: false });
	}

	disposeElement(element: ITreeNode<RenderableMatch, any>, index: number, templateData: IFolderMatchTemplate): void {
	}

	disposeTemplate(templateData: IFolderMatchTemplate): void {
		templateData.label.dispose();
		templateData.actions.dispose();
	}
}

export class MatchRenderer extends Disposable implements ITreeRenderer<Match, void, IMatchTemplate> {
	static readonly TEMPLATE_ID = 'match';

	readonly templateId = MatchRenderer.TEMPLATE_ID;

	constructor(
		private searchModel: SearchModel,
		private searchView: SearchView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	renderTemplate(container: HTMLElement): IMatchTemplate {
		DOM.addClass(container, 'linematch');

		const parent = DOM.append(container, DOM.$('a.plain.match'));
		const before = DOM.append(parent, DOM.$('span'));
		const match = DOM.append(parent, DOM.$('span.findInFileMatch'));
		const replace = DOM.append(parent, DOM.$('span.replaceMatch'));
		const after = DOM.append(parent, DOM.$('span'));
		const lineNumber = DOM.append(container, DOM.$('span.matchLineNum'));
		const actionBarContainer = DOM.append(container, DOM.$('span.actionBarContainer'));
		const actions = new ActionBar(actionBarContainer, { animated: false });

		return {
			parent,
			before,
			match,
			replace,
			after,
			lineNumber,
			actions
		};
	}

	renderElement(node: ITreeNode<Match, any>, index: number, templateData: IMatchTemplate): void {
		const match = node.element;
		const preview = match.preview();
		const replace = this.searchModel.isReplaceActive() && !!this.searchModel.replaceString;

		templateData.before.textContent = preview.before;
		templateData.match.textContent = preview.inside;
		DOM.toggleClass(templateData.match, 'replace', replace);
		templateData.replace.textContent = replace ? match.replaceString : '';
		templateData.after.textContent = preview.after;
		templateData.parent.title = (preview.before + (replace ? match.replaceString : preview.inside) + preview.after).trim().substr(0, 999);

		const numLines = match.range().endLineNumber - match.range().startLineNumber;
		const extraLinesStr = numLines > 0 ? `+${numLines}` : '';

		const showLineNumbers = this.configurationService.getValue<ISearchConfigurationProperties>('search').showLineNumbers;
		const lineNumberStr = showLineNumbers ? `:${match.range().startLineNumber}` : '';
		DOM.toggleClass(templateData.lineNumber, 'show', (numLines > 0) || showLineNumbers);

		templateData.lineNumber.textContent = lineNumberStr + extraLinesStr;
		templateData.lineNumber.setAttribute('title', this.getMatchTitle(match, showLineNumbers));

		templateData.actions.clear();
		if (this.searchModel.isReplaceActive()) {
			templateData.actions.push([this.instantiationService.createInstance(ReplaceAction, this.searchView.getControl(), match, this.searchView), new RemoveAction(this.searchView, this.searchView.getControl(), match)], { icon: true, label: false });
		} else {
			templateData.actions.push([new RemoveAction(this.searchView, this.searchView.getControl(), match)], { icon: true, label: false });
		}
	}

	disposeElement(element: ITreeNode<Match, any>, index: number, templateData: IMatchTemplate): void {
	}

	disposeTemplate(templateData: IMatchTemplate): void {
		templateData.actions.dispose();
	}

	private getMatchTitle(match: Match, showLineNumbers: boolean): string {
		const startLine = match.range().startLineNumber;
		const numLines = match.range().endLineNumber - match.range().startLineNumber;

		const lineNumStr = showLineNumbers ?
			nls.localize('lineNumStr', "From line {0}", startLine, numLines) + ' ' :
			'';

		const numLinesStr = numLines > 0 ?
			'+ ' + nls.localize('numLinesStr', "{0} more lines", numLines) :
			'';

		return lineNumStr + numLinesStr;
	}
}

export class SearchAccessibilityProvider implements IAccessibilityProvider<RenderableMatch> {

	constructor(
		private searchModel: SearchModel,
		@ILabelService private readonly labelService: ILabelService
	) {
	}

	getAriaLabel(element: RenderableMatch): string {
		if (element instanceof FolderMatch) {
			return element.hasResource() ?
				nls.localize('folderMatchAriaLabel', "{0} matches in folder root {1}, Search result", element.count(), element.name()) :
				nls.localize('otherFilesAriaLabel', "{0} matches outside of the workspace, Search result", element.count());
		}

		if (element instanceof FileMatch) {
			const path = this.labelService.getUriLabel(element.resource(), { relative: true }) || element.resource().fsPath;

			return nls.localize('fileMatchAriaLabel', "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
		}

		if (element instanceof Match) {
			const match = <Match>element;
			const searchModel: SearchModel = this.searchModel;
			const replace = searchModel.isReplaceActive() && !!searchModel.replaceString;
			const matchString = match.getMatchString();
			const range = match.range();
			const matchText = match.text().substr(0, range.endColumn + 150);
			if (replace) {
				return nls.localize('replacePreviewResultAria', "Replace term {0} with {1} at column position {2} in line with text {3}", matchString, match.replaceString, range.startColumn + 1, matchText);
			}

			return nls.localize('searchResultAria', "Found term {0} at column position {1} in line with text {2}", matchString, range.startColumn + 1, matchText);
		}
		return undefined;
	}
}
