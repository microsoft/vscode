/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { top } from '../../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { compareItemsByFuzzyScore, FuzzyScorerCache, IPreparedQuery, prepareQuery, scoreItemFuzzy } from '../../../../base/common/fuzzyScorer.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname, relativePath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, quickPickItemScorerAccessor } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { getExcludes, IFileQuery, ISearchConfiguration, ISearchService, QueryType } from '../../../../workbench/services/search/common/search.js';
import { ISessionFolder, ISessionWorkspace } from '../../../services/sessions/common/session.js';

const MAX_SEARCH_RESULTS = 512;
const MAX_VIRTUAL_WORKSPACE_DEPTH = 10;

export const EmptyFileEditorSearchFocusedContext = new RawContextKey<boolean>('emptyFileEditorSearchFocused', false, localize('emptyFileEditorSearchFocused', "Whether focus is in the empty Files editor search."));

interface IFileSearchResult extends IQuickPickItem {
	readonly resource?: URI;
}

export class EmptyFileEditorSearch extends Disposable {

	private readonly input: InputBox;
	private readonly inputContainer: HTMLElement;
	private readonly searchScheduler: RunOnceScheduler;
	private readonly searchCancellation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly pickerDisposables = this._register(new MutableDisposable<DisposableStore>());
	private picker: IQuickPick<IFileSearchResult> | undefined;
	private restoreInputFocusOnHide = false;
	private syncingPickerValue = false;
	private workspace: ISessionWorkspace | undefined;

	constructor(
		container: HTMLElement,
		searchDelay: number,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ISearchService private readonly searchService: ISearchService,
		@IEditorService private readonly editorService: IEditorService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		const scopedContextKeyService = this._register(contextKeyService.createScoped(container));
		const focusedContext = EmptyFileEditorSearchFocusedContext.bindTo(scopedContextKeyService);
		const focusTracker = this._register(dom.trackFocus(container));
		this._register(focusTracker.onDidFocus(() => focusedContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusedContext.set(false)));
		this._register(toDisposable(() => focusedContext.reset()));

		this.inputContainer = dom.append(container, dom.$('.empty-file-editor-search-input'));
		const searchIcon = dom.append(this.inputContainer, dom.$('span.empty-file-editor-search-icon'));
		searchIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.search));
		searchIcon.setAttribute('aria-hidden', 'true');
		this.input = this._register(new InputBox(this.inputContainer, undefined, {
			ariaLabel: localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace"),
			placeholder: localize('emptyFileEditor.searchPlaceholder', "Search files by name"),
			inputBoxStyles: defaultInputBoxStyles,
		}));

		this.searchScheduler = this._register(new RunOnceScheduler(() => void this.search(), searchDelay));
		this._register(this.input.onDidChange(value => this.onDidChangeValue(value)));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.FOCUS, () => this.showPicker()));
		this._register(dom.addDisposableListener(dom.getWindow(this.inputContainer), dom.EventType.KEY_DOWN, event => {
			if (this.picker && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				this.restoreInputFocusOnHide = true;
				this.picker.value = '';
			}
		}, true));
		this._register(dom.addDisposableListener(dom.getWindow(this.inputContainer), dom.EventType.POINTER_DOWN, event => {
			if (this.picker && dom.isHTMLElement(event.target) && event.target.closest('.monaco-sash')) {
				this.picker.hide();
			}
		}, true));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.KEY_DOWN, event => {
			if (!this.picker && this.input.value && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopPropagation();
				this.input.value = '';
			}
		}));
	}

	setWorkspace(workspace: ISessionWorkspace | undefined): void {
		this.workspace = workspace;
		if (this.picker?.value) {
			this.scheduleSearch(this.picker.value);
		}
	}

	private onDidChangeValue(value: string): void {
		if (this.syncingPickerValue) {
			return;
		}
		if (!value.trim()) {
			this.cancelSearch();
			this.restoreInputFocusOnHide = !!this.picker;
			this.picker?.hide();
			return;
		}

		this.showPicker();
		this.scheduleSearch(value);
	}

	private showPicker(): void {
		if (this.picker || !this.input.value.trim()) {
			return;
		}

		const picker = this.quickInputService.createQuickPick<IFileSearchResult>();
		const disposables = new DisposableStore();
		this.picker = picker;
		this.pickerDisposables.value = disposables;
		disposables.add(picker);

		picker.anchor = this.input.element;
		picker.anchorPosition = 'overlay';
		picker.ariaLabel = localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace");
		picker.placeholder = localize('emptyFileEditor.searchPlaceholder', "Search files by name");
		picker.inputIcon = Codicon.search;
		picker.ignoreFocusOut = false;
		picker.matchOnLabel = false;
		picker.matchOnDescription = false;
		picker.matchOnDetail = false;
		picker.sortByLabel = false;
		picker.value = this.input.value;
		picker.valueSelection = [picker.value.length, picker.value.length];

		disposables.add(picker.onDidChangeValue(value => {
			this.setInputValue(value);
			if (!value.trim()) {
				this.cancelSearch();
				this.restoreInputFocusOnHide = true;
				picker.hide();
				return;
			}
			this.scheduleSearch(value);
		}));
		disposables.add(picker.onDidAccept(() => {
			const result = picker.activeItems[0];
			if (result?.resource) {
				picker.hide();
				void this.open(result.resource);
			}
		}));
		disposables.add(picker.onDidHide(() => {
			const restoreInputFocus = this.restoreInputFocusOnHide;
			this.restoreInputFocusOnHide = false;
			this.cancelSearch();
			this.setInputValue(picker.value);
			this.inputContainer.style.visibility = '';
			if (this.picker === picker) {
				this.picker = undefined;
				this.pickerDisposables.clear();
			}
			if (restoreInputFocus) {
				this.input.focus();
			}
		}));

		picker.show();
		this.inputContainer.style.visibility = 'hidden';
		this.scheduleSearch(picker.value);
	}

	private setInputValue(value: string): void {
		this.syncingPickerValue = true;
		try {
			this.input.value = value;
		} finally {
			this.syncingPickerValue = false;
		}
	}

	private scheduleSearch(value: string): void {
		this.cancelSearch();
		if (!value.trim()) {
			return;
		}
		if (this.picker) {
			this.picker.busy = true;
			this.picker.items = [];
		}
		this.searchScheduler.schedule();
	}

	private cancelSearch(): void {
		this.searchCancellation.value?.dispose(true);
		this.searchCancellation.clear();
		this.searchScheduler.cancel();
	}

	private async search(): Promise<void> {
		const picker = this.picker;
		const pattern = picker?.value.trim();
		if (!picker || !pattern) {
			return;
		}

		const folders = this.workspace?.folders ?? [];
		if (!folders.length) {
			this.setPickerMessage(picker, localize('emptyFileEditor.noWorkspace', "Open a workspace to search files."));
			return;
		}

		const cancellation = new CancellationTokenSource();
		this.searchCancellation.value = cancellation;

		try {
			const results = await this.collectResults(folders, prepareQuery(pattern), cancellation.token);
			if (cancellation.token.isCancellationRequested || picker !== this.picker || pattern !== picker.value.trim()) {
				return;
			}

			picker.busy = false;
			picker.items = results.length
				? results
				: [this.createMessageItem(localize('emptyFileEditor.noSearchResults', "No matching files"))];
		} catch (error) {
			if (!cancellation.token.isCancellationRequested && picker === this.picker) {
				this.setPickerMessage(picker, localize('emptyFileEditor.searchError', "Unable to search files: {0}", toErrorMessage(error)));
			}
		}
	}

	private setPickerMessage(picker: IQuickPick<IFileSearchResult>, message: string): void {
		picker.busy = false;
		picker.items = [this.createMessageItem(message)];
	}

	private createMessageItem(label: string): IFileSearchResult {
		return {
			label,
			alwaysShow: true,
			disabled: true,
			pickable: false,
		};
	}

	private async collectResults(folders: readonly ISessionFolder[], query: IPreparedQuery, token: CancellationToken): Promise<IFileSearchResult[]> {
		const results: IFileSearchResult[] = [];
		const filePattern = query.values && query.values.length > 1 ? query.values[0].original : query.original;
		for (const folder of folders) {
			if (token.isCancellationRequested || results.length >= MAX_SEARCH_RESULTS) {
				break;
			}

			const resources = folder.root.scheme === Schemas.file || folder.root.scheme === Schemas.vscodeRemote
				? await this.searchFolder(folder, filePattern, MAX_SEARCH_RESULTS - results.length, token)
				: await this.walkFolder(folder.root, filePattern, MAX_SEARCH_RESULTS - results.length, token);

			for (const resource of resources) {
				const label = basename(resource);
				const directory = relativePath(folder.root, dirname(resource));
				const description = folders.length > 1
					? directory ? `${folder.name}/${directory}` : folder.name
					: directory;
				results.push({
					id: resource.toString(),
					resource,
					label,
					description,
					iconClasses: getIconClasses(this.modelService, this.languageService, resource),
					ariaLabel: description
						? localize('emptyFileEditor.searchResultAriaLabelWithPath', "{0}, {1}", label, description)
						: label,
				});
			}
		}

		const scorerCache: FuzzyScorerCache = Object.create(null);
		const sortedResults = top(
			results,
			(first, second) => compareItemsByFuzzyScore(first, second, query, true, quickPickItemScorerAccessor, scorerCache),
			MAX_SEARCH_RESULTS,
		);

		return sortedResults.filter(result => {
			const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(result, query, true, quickPickItemScorerAccessor, scorerCache);
			if (!score) {
				return false;
			}
			result.highlights = {
				label: labelMatch,
				description: descriptionMatch,
			};
			return true;
		});
	}

	private async searchFolder(folder: ISessionFolder, pattern: string, maxResults: number, token: CancellationToken): Promise<URI[]> {
		const excludePattern = getExcludes(this.configurationService.getValue<ISearchConfiguration>({ resource: folder.root }));
		const query: IFileQuery = {
			folderQueries: [{
				folder: folder.root,
				disregardIgnoreFiles: false,
			}],
			type: QueryType.File,
			filePattern: pattern,
			excludePattern,
			sortByScore: true,
			maxResults,
		};
		const searchResult = await this.searchService.fileSearch(query, token);
		return searchResult.results.map(result => result.resource);
	}

	private async walkFolder(root: URI, pattern: string, maxResults: number, token: CancellationToken): Promise<URI[]> {
		const resources: URI[] = [];
		const patternLowercase = pattern.toLowerCase();

		const collect = async (resource: URI, depth: number): Promise<void> => {
			if (token.isCancellationRequested || resources.length >= maxResults || depth > MAX_VIRTUAL_WORKSPACE_DEPTH) {
				return;
			}

			const stat = await this.fileService.resolve(resource);
			const children = stat.children?.slice().sort((first, second) => {
				if (first.isDirectory !== second.isDirectory) {
					return first.isDirectory ? -1 : 1;
				}
				return first.name.localeCompare(second.name);
			}) ?? [];

			for (const child of children) {
				if (token.isCancellationRequested || resources.length >= maxResults) {
					return;
				}
				if (child.isDirectory) {
					await collect(child.resource, depth + 1);
				} else if (child.name.toLowerCase().includes(patternLowercase)) {
					resources.push(child.resource);
				}
			}
		};

		await collect(root, 0);
		return resources;
	}

	private async open(resource: URI): Promise<void> {
		await this.editorService.openEditor({
			resource,
			options: { pinned: true },
		});
	}
}
