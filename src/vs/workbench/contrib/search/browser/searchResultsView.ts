/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as paths from '../../../../base/common/path.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ISearchConfigurationProperties } from '../../../services/search/common/search.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { SearchView } from './searchView.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ISearchActionContext } from './searchActionsRemoveReplace.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { defaultCountBadgeStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { SearchContext } from '../common/constants.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ISearchTreeMatch, isSearchTreeMatch, RenderableMatch, ITextSearchHeading, ISearchTreeFolderMatch, ISearchTreeFileMatch, isSearchTreeFileMatch, isSearchTreeFolderMatch, isTextSearchHeading, ISearchModel, isSearchTreeFolderMatchWorkspaceRoot, isSearchTreeFolderMatchNoRoot, isPlainTextSearchHeading } from './searchTreeModel/searchTreeCommon.js';
import { isSearchTreeAIFileMatch } from './AISearch/aiSearchModelBase.js';

interface IFolderMatchTemplate {
	label: IResourceLabel;
	badge: CountBadge;
	actions: MenuWorkbenchToolBar;
	disposables: DisposableStore;
	elementDisposables: DisposableStore;
	contextKeyService: IContextKeyService;
}

interface ITextSearchResultTemplate {
	label: IResourceLabel;
	disposables: DisposableStore;
	actions: MenuWorkbenchToolBar;
	contextKeyService: IContextKeyService;
}

interface IFileMatchTemplate {
	el: HTMLElement;
	label: IResourceLabel;
	badge: CountBadge;
	actions: MenuWorkbenchToolBar;
	disposables: DisposableStore;
	elementDisposables: DisposableStore;
	contextKeyService: IContextKeyService;
}

interface IMatchTemplate {
	lineNumber: HTMLElement;
	parent: HTMLElement;
	before: HTMLElement;
	match: HTMLElement;
	replace: HTMLElement;
	after: HTMLElement;
	actions: MenuWorkbenchToolBar;
	disposables: DisposableStore;
	contextKeyService: IContextKeyService;
}

export class SearchDelegate implements IListVirtualDelegate<RenderableMatch> {

	public static ITEM_HEIGHT = 22;

	getHeight(element: RenderableMatch): number {
		return SearchDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: RenderableMatch): string {
		if (isSearchTreeFolderMatch(element)) {
			return FolderMatchRenderer.TEMPLATE_ID;
		} else if (isSearchTreeFileMatch(element)) {
			return FileMatchRenderer.TEMPLATE_ID;
		} else if (isSearchTreeMatch(element)) {
			return MatchRenderer.TEMPLATE_ID;
		} else if (isTextSearchHeading(element)) {
			return TextSearchResultRenderer.TEMPLATE_ID;
		}

		console.error('Invalid search tree element', element);
		throw new Error('Invalid search tree element');
	}
}

export class TextSearchResultRenderer extends Disposable implements ICompressibleTreeRenderer<ITextSearchHeading, any, ITextSearchResultTemplate> {
	static readonly TEMPLATE_ID = 'textResultMatch';

	readonly templateId = TextSearchResultRenderer.TEMPLATE_ID;

	constructor(
		private labels: ResourceLabels,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}
	renderTemplate(container: HTMLElement): ITextSearchResultTemplate {
		const disposables = new DisposableStore();
		const textSearchResultElement = DOM.append(container, DOM.$('.textsearchresult'));
		const label = this.labels.create(textSearchResultElement, { supportDescriptionHighlights: true, supportHighlights: true, supportIcons: true });
		disposables.add(label);

		const actionBarContainer = DOM.append(textSearchResultElement, DOM.$('.actionBarContainer'));
		const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));

		const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
		const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
			menuOptions: {
				shouldForwardArgs: true
			},
			highlightToggledItems: true,
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: (g: string) => /^inline/.test(g),
			},
		}));
		return { label, disposables, actions, contextKeyService: contextKeyServiceMain };
	}

	async renderElement(node: ITreeNode<ITextSearchHeading, any>, index: number, templateData: IFolderMatchTemplate): Promise<void> {
		if (isPlainTextSearchHeading(node.element)) {
			templateData.label.setLabel(nls.localize('searchFolderMatch.plainText.label', "Text Results"));
			SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(false);
			SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
			SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
			SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
		} else {
			try {
				await node.element.parent().searchModel.getAITextResultProviderName();
			} catch {
				// ignore
			}

			const localizedLabel = nls.localize({
				key: 'searchFolderMatch.aiText.label',
				comment: ['This is displayed before the AI text search results, now always "AI-assisted results".']
			}, 'AI-assisted results');

			// todo: make icon extension-contributed.
			templateData.label.setLabel(`$(${Codicon.searchSparkle.id}) ${localizedLabel}`);

			SearchContext.AIResultsTitle.bindTo(templateData.contextKeyService).set(true);
			SearchContext.MatchFocusKey.bindTo(templateData.contextKeyService).set(false);
			SearchContext.FileFocusKey.bindTo(templateData.contextKeyService).set(false);
			SearchContext.FolderFocusKey.bindTo(templateData.contextKeyService).set(false);
		}
	}

	disposeTemplate(templateData: IFolderMatchTemplate): void {
		templateData.disposables.dispose();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ITextSearchHeading>, any>, index: number, templateData: ITextSearchResultTemplate): void {
	}

}
export class FolderMatchRenderer extends Disposable implements ICompressibleTreeRenderer<ISearchTreeFolderMatch, any, IFolderMatchTemplate> {
	static readonly TEMPLATE_ID = 'folderMatch';

	readonly templateId = FolderMatchRenderer.TEMPLATE_ID;

	constructor(
		private searchView: SearchView,
		private labels: ResourceLabels,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISearchTreeFolderMatch>, any>, index: number, templateData: IFolderMatchTemplate): void {
		const compressed = node.element;
		const folder = compressed.elements[compressed.elements.length - 1];
		const label = compressed.elements.map(e => e.name());

		if (folder.resource) {
			const fileKind = (isSearchTreeFolderMatchWorkspaceRoot(folder)) ? FileKind.ROOT_FOLDER : FileKind.FOLDER;
			templateData.label.setResource({ resource: folder.resource, name: label }, {
				fileKind,
				separator: this.labelService.getSeparator(folder.resource.scheme),
			});
		} else {
			templateData.label.setLabel(nls.localize('searchFolderMatch.other.label', "Other files"));
		}

		this.renderFolderDetails(folder, templateData);
	}

	renderTemplate(container: HTMLElement): IFolderMatchTemplate {
		const disposables = new DisposableStore();

		const folderMatchElement = DOM.append(container, DOM.$('.foldermatch'));
		const label = this.labels.create(folderMatchElement, { supportDescriptionHighlights: true, supportHighlights: true });
		disposables.add(label);
		const badge = new CountBadge(DOM.append(folderMatchElement, DOM.$('.badge')), {}, defaultCountBadgeStyles);
		disposables.add(badge);
		const actionBarContainer = DOM.append(folderMatchElement, DOM.$('.actionBarContainer'));

		const elementDisposables = new DisposableStore();
		disposables.add(elementDisposables);

		const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
		SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
		SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
		SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
		SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(true);

		const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
		const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: (g: string) => /^inline/.test(g),
			},
		}));

		return {
			label,
			badge,
			actions,
			disposables,
			elementDisposables,
			contextKeyService: contextKeyServiceMain
		};
	}

	renderElement(node: ITreeNode<ISearchTreeFolderMatch, any>, index: number, templateData: IFolderMatchTemplate): void {
		const folderMatch = node.element;
		if (folderMatch.resource) {
			const workspaceFolder = this.contextService.getWorkspaceFolder(folderMatch.resource);
			if (workspaceFolder && isEqual(workspaceFolder.uri, folderMatch.resource)) {
				templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.ROOT_FOLDER, hidePath: true });
			} else {
				templateData.label.setFile(folderMatch.resource, { fileKind: FileKind.FOLDER, hidePath: this.searchView.isTreeLayoutViewVisible });
			}
		} else {
			templateData.label.setLabel(nls.localize('searchFolderMatch.other.label', "Other files"));
		}

		SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());

		templateData.elementDisposables.add(folderMatch.onChange(() => {
			SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!folderMatch.hasOnlyReadOnlyMatches());
		}));

		this.renderFolderDetails(folderMatch, templateData);
	}

	disposeElement(element: ITreeNode<RenderableMatch, any>, index: number, templateData: IFolderMatchTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<ISearchTreeFolderMatch>, any>, index: number, templateData: IFolderMatchTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IFolderMatchTemplate): void {
		templateData.disposables.dispose();
	}

	private renderFolderDetails(folder: ISearchTreeFolderMatch, templateData: IFolderMatchTemplate) {
		const count = folder.recursiveMatchCount();
		templateData.badge.setCount(count);
		templateData.badge.setTitleFormat(count > 1 ? nls.localize('searchFileMatches', "{0} files found", count) : nls.localize('searchFileMatch', "{0} file found", count));

		templateData.actions.context = { viewer: this.searchView.getControl(), element: folder } satisfies ISearchActionContext;
	}
}

export class FileMatchRenderer extends Disposable implements ICompressibleTreeRenderer<ISearchTreeFileMatch, any, IFileMatchTemplate> {
	static readonly TEMPLATE_ID = 'fileMatch';

	readonly templateId = FileMatchRenderer.TEMPLATE_ID;

	constructor(
		private searchView: SearchView,
		private labels: ResourceLabels,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISearchTreeFileMatch>, any>, index: number, templateData: IFileMatchTemplate): void {
		throw new Error('Should never happen since node is incompressible.');
	}

	renderTemplate(container: HTMLElement): IFileMatchTemplate {
		const disposables = new DisposableStore();
		const elementDisposables = new DisposableStore();
		disposables.add(elementDisposables);
		const fileMatchElement = DOM.append(container, DOM.$('.filematch'));
		const label = this.labels.create(fileMatchElement);
		disposables.add(label);
		const badge = new CountBadge(DOM.append(fileMatchElement, DOM.$('.badge')), {}, defaultCountBadgeStyles);
		disposables.add(badge);
		const actionBarContainer = DOM.append(fileMatchElement, DOM.$('.actionBarContainer'));

		const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
		SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
		SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(false);
		SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(true);
		SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);

		const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
		const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: (g: string) => /^inline/.test(g),
			},
		}));

		return {
			el: fileMatchElement,
			label,
			badge,
			actions,
			disposables,
			elementDisposables,
			contextKeyService: contextKeyServiceMain
		};
	}

	renderElement(node: ITreeNode<ISearchTreeFileMatch, any>, index: number, templateData: IFileMatchTemplate): void {
		const fileMatch = node.element;
		templateData.el.setAttribute('data-resource', fileMatch.resource.toString());

		const decorationConfig = this.configurationService.getValue<ISearchConfigurationProperties>('search').decorations;
		templateData.label.setFile(fileMatch.resource, { range: isSearchTreeAIFileMatch(fileMatch) ? fileMatch.getFullRange() : undefined, hidePath: this.searchView.isTreeLayoutViewVisible && !(isSearchTreeFolderMatchNoRoot(fileMatch.parent())), hideIcon: false, fileDecorations: { colors: decorationConfig.colors, badges: decorationConfig.badges } });
		const count = fileMatch.count();
		templateData.badge.setCount(count);
		templateData.badge.setTitleFormat(count > 1 ? nls.localize('searchMatches', "{0} matches found", count) : nls.localize('searchMatch', "{0} match found", count));

		templateData.actions.context = { viewer: this.searchView.getControl(), element: fileMatch } satisfies ISearchActionContext;

		SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());

		templateData.elementDisposables.add(fileMatch.onChange(() => {
			SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!fileMatch.hasOnlyReadOnlyMatches());
		}));

		// when hidesExplorerArrows: true, then the file nodes should still have a twistie because it would otherwise
		// be hard to tell whether the node is collapsed or expanded.
		// eslint-disable-next-line no-restricted-syntax
		const twistieContainer = templateData.el.parentElement?.parentElement?.querySelector('.monaco-tl-twistie');
		twistieContainer?.classList.add('force-twistie');
	}

	disposeElement(element: ITreeNode<RenderableMatch, any>, index: number, templateData: IFileMatchTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IFileMatchTemplate): void {
		templateData.disposables.dispose();
	}
}

export class MatchRenderer extends Disposable implements ICompressibleTreeRenderer<ISearchTreeMatch, void, IMatchTemplate> {
	static readonly TEMPLATE_ID = 'match';

	readonly templateId = MatchRenderer.TEMPLATE_ID;

	constructor(
		private searchView: SearchView,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();
	}
	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ISearchTreeMatch>, void>, index: number, templateData: IMatchTemplate): void {
		throw new Error('Should never happen since node is incompressible.');
	}

	renderTemplate(container: HTMLElement): IMatchTemplate {
		container.classList.add('linematch');

		const lineNumber = DOM.append(container, DOM.$('span.matchLineNum'));
		const parent = DOM.append(container, DOM.$('a.plain.match'));
		const before = DOM.append(parent, DOM.$('span'));
		const match = DOM.append(parent, DOM.$('span.findInFileMatch'));
		const replace = DOM.append(parent, DOM.$('span.replaceMatch'));
		const after = DOM.append(parent, DOM.$('span'));
		const actionBarContainer = DOM.append(container, DOM.$('span.actionBarContainer'));

		const disposables = new DisposableStore();

		const contextKeyServiceMain = disposables.add(this.contextKeyService.createScoped(container));
		SearchContext.AIResultsTitle.bindTo(contextKeyServiceMain).set(false);
		SearchContext.MatchFocusKey.bindTo(contextKeyServiceMain).set(true);
		SearchContext.FileFocusKey.bindTo(contextKeyServiceMain).set(false);
		SearchContext.FolderFocusKey.bindTo(contextKeyServiceMain).set(false);

		const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyServiceMain])));
		const actions = disposables.add(instantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.SearchActionMenu, {
			menuOptions: {
				shouldForwardArgs: true
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			toolbarOptions: {
				primaryGroup: (g: string) => /^inline/.test(g),
			},
		}));

		return {
			parent,
			before,
			match,
			replace,
			after,
			lineNumber,
			actions,
			disposables,
			contextKeyService: contextKeyServiceMain
		};
	}

	renderElement(node: ITreeNode<ISearchTreeMatch, any>, index: number, templateData: IMatchTemplate): void {
		const match = node.element;
		const preview = match.preview();
		const replace = this.searchView.model.isReplaceActive() &&
			!!this.searchView.model.replaceString &&
			!match.isReadonly;

		templateData.before.textContent = preview.before;
		templateData.match.textContent = preview.inside;
		templateData.match.classList.toggle('replace', replace);
		templateData.replace.textContent = replace ? match.replaceString : '';
		templateData.after.textContent = preview.after;

		const title = (preview.fullBefore + (replace ? match.replaceString : preview.inside) + preview.after).trim().substr(0, 999);
		templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.parent, title));

		SearchContext.IsEditableItemKey.bindTo(templateData.contextKeyService).set(!match.isReadonly);

		const numLines = match.range().endLineNumber - match.range().startLineNumber;
		const extraLinesStr = numLines > 0 ? `+${numLines}` : '';

		const showLineNumbers = this.configurationService.getValue<ISearchConfigurationProperties>('search').showLineNumbers;
		const lineNumberStr = showLineNumbers ? `${match.range().startLineNumber}:` : '';
		templateData.lineNumber.classList.toggle('show', (numLines > 0) || showLineNumbers);

		templateData.lineNumber.textContent = lineNumberStr + extraLinesStr;
		templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.lineNumber, this.getMatchTitle(match, showLineNumbers)));

		templateData.actions.context = { viewer: this.searchView.getControl(), element: match } satisfies ISearchActionContext;

	}

	disposeTemplate(templateData: IMatchTemplate): void {
		templateData.disposables.dispose();
	}

	private getMatchTitle(match: ISearchTreeMatch, showLineNumbers: boolean): string {
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

export class SearchAccessibilityProvider implements IListAccessibilityProvider<RenderableMatch> {

	constructor(
		private searchView: SearchView,
		@ILabelService private readonly labelService: ILabelService
	) {
	}

	getWidgetAriaLabel(): string {
		return nls.localize('search', "Search");
	}

	getAriaLabel(element: RenderableMatch): string | null {
		if (isSearchTreeFolderMatch(element)) {
			const count = element.allDownstreamFileMatches().reduce((total, current) => total + current.count(), 0);
			return element.resource ?
				nls.localize('folderMatchAriaLabel', "{0} matches in folder root {1}, Search result", count, element.name()) :
				nls.localize('otherFilesAriaLabel', "{0} matches outside of the workspace, Search result", count);
		}

		if (isSearchTreeFileMatch(element)) {
			const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;

			return nls.localize('fileMatchAriaLabel', "{0} matches in file {1} of folder {2}, Search result", element.count(), element.name(), paths.dirname(path));
		}

		if (isSearchTreeMatch(element)) {
			const match = <ISearchTreeMatch>element;
			const searchModel: ISearchModel = this.searchView.model;
			const replace = searchModel.isReplaceActive() && !!searchModel.replaceString;
			const matchString = match.getMatchString();
			const range = match.range();
			const matchText = match.text().substr(0, range.endColumn + 150);
			if (replace) {
				return nls.localize('replacePreviewResultAria', "'{0}' at column {1} replace {2} with {3}", matchText, range.startColumn, matchString, match.replaceString);
			}

			return nls.localize('searchResultAria', "'{0}' at column {1} found {2}", matchText, range.startColumn, matchString);
		}
		return null;
	}
}
