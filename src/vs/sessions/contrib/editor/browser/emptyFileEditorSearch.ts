/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import * as glob from '../../../../base/common/glob.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { prepareQuery } from '../../../../base/common/fuzzyScorer.js';
import { defaultGenerator } from '../../../../base/common/idGenerator.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { dirname, relativePath } from '../../../../base/common/resources.js';
import { fuzzyContains } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { FileOperationResult, IFileService, IFileStat, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickInputType } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAnythingQuickAccessFileSearchDelegate, IAnythingQuickAccessProviderRunOptions } from '../../../../workbench/contrib/search/common/search.js';
import { QueryBuilder } from '../../../../workbench/services/search/common/queryBuilder.js';
import { getExcludes, hasSiblingFn, ISearchComplete, ISearchConfiguration, ISearchService } from '../../../../workbench/services/search/common/search.js';
import { ISessionFolder, ISessionWorkspace } from '../../../services/sessions/common/session.js';

export const EmptyFileEditorSearchPickerFocusedContext = new RawContextKey<boolean>('emptyFileEditorSearchPickerFocused', false, localize('emptyFileEditorSearchPickerFocused', "Whether the empty Files editor search picker is active."));

const MAX_SEARCH_RESULTS = 512;
const MAX_VIRTUAL_WORKSPACE_ENTRIES = 10_000;

interface IVirtualFileSearchEntry {
	readonly resource: URI;
	readonly searchPath: string;
}

interface IVirtualFileSearchIndex {
	readonly entries: readonly IVirtualFileSearchEntry[];
	readonly limitHit: boolean;
}

export class EmptyFileEditorSearch extends Disposable {

	private readonly pickerDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly input: InputBox;
	private picker: IQuickPick<IQuickPickItem, { useSeparators: true }> | undefined;
	private pickerAnchored = false;
	private syncingInputValue = false;
	private restoreInputFocusOnHide = false;
	private workspace: ISessionWorkspace | undefined;
	private accessibilityHelpHintAnnounced = false;
	private readonly fileQueryBuilder: QueryBuilder;

	constructor(
		private readonly container: HTMLElement,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IAccessibleViewService private readonly accessibleViewService: IAccessibleViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ISearchService private readonly searchService: ISearchService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super();
		this.fileQueryBuilder = instantiationService.createInstance(QueryBuilder);
		this.input = this._register(new InputBox(container, undefined, {
			ariaLabel: localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace"),
			placeholder: localize('emptyFileEditor.searchPlaceholder', "Search files by name"),
			inputBoxStyles: defaultInputBoxStyles,
		}));
		this._register(this.input.onDidChange(value => {
			if (!this.syncingInputValue && value.trim()) {
				this.showPicker(value, this.input.element);
			}
		}));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.FOCUS, () => {
			this.announceAccessibilityHelpHint();
			if (this.input.value.trim()) {
				this.showPicker(this.input.value, this.input.element);
			}
		}));
		this._register(dom.addDisposableListener(this.input.inputElement, dom.EventType.KEY_DOWN, event => {
			if (!this.picker && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				event.preventDefault();
				event.stopPropagation();
				this.input.value = '';
			}
		}));
		this._register(dom.addDisposableListener(dom.getWindow(container), dom.EventType.KEY_DOWN, event => {
			if (this.pickerAnchored && this.picker && new StandardKeyboardEvent(event).equals(KeyCode.Escape)) {
				this.restoreInputFocusOnHide = true;
				this.picker.value = '';
			}
		}, true));
		this._register(dom.addDisposableListener(dom.getWindow(container), dom.EventType.POINTER_DOWN, event => {
			if (this.pickerAnchored && dom.isHTMLElement(event.target) && event.target.closest('.monaco-sash')) {
				this.picker?.hide();
			}
		}, true));
	}

	setWorkspace(workspace: ISessionWorkspace | undefined): void {
		this.workspace = workspace;
		this.setInputValue('');
		this.picker?.hide();
	}

	show(): void {
		this.showPicker('');
	}

	private showPicker(value: string, anchor?: HTMLElement): void {
		if (this.picker || this._store.isDisposed) {
			return;
		}

		const workspace = this.workspace;
		const pickerLifetime = new CancellationTokenSource();
		const cacheKey = `emptyFileEditorSearch-${defaultGenerator.nextId()}`;
		const providerOptions: IAnythingQuickAccessProviderRunOptions = {
			filesOnly: true,
			includeOpenToSideButton: false,
			fileSearchDelegate: this.createFileSearchDelegate(workspace, cacheKey, pickerLifetime.token),
		};
		const disposables = new DisposableStore();
		this.pickerDisposables.value = disposables;
		disposables.add(toDisposable(() => pickerLifetime.dispose(true)));
		disposables.add(toDisposable(() => {
			void this.searchService.clearCache(cacheKey);
		}));
		this.quickInputService.quickAccess.show(value, {
			providerPrefix: '',
			anchor,
			anchorPosition: anchor ? 'overlay' : undefined,
			preserveValue: false,
			placeholder: localize('emptyFileEditor.searchPlaceholder', "Search files by name"),
			providerOptions,
		});
		const currentQuickInput = this.quickInputService.currentQuickInput;
		if (currentQuickInput?.type !== QuickInputType.QuickPick) {
			this.pickerDisposables.clear();
			return;
		}
		const picker = currentQuickInput as IQuickPick<IQuickPickItem, { useSeparators: true }>;
		this.picker = picker;
		this.pickerAnchored = !!anchor;
		// The picker renders outside the editor group, so its context key must be set by the quick input service
		// (window-wide while visible) to be visible to keybindings and accessibility help evaluated from the picker.
		picker.contextKey = EmptyFileEditorSearchPickerFocusedContext.key;
		disposables.add(toDisposable(() => picker.hide()));
		disposables.add(Event.once(this.quickInputService.onHide)(() => {
			if (this.picker !== picker) {
				return;
			}
			const restoreInputFocus = this.restoreInputFocusOnHide;
			this.restoreInputFocusOnHide = false;
			if (anchor) {
				this.container.style.visibility = '';
			}
			this.picker = undefined;
			this.pickerAnchored = false;
			this.pickerDisposables.clear();
			if (restoreInputFocus) {
				this.input.focus();
			}
		}));

		picker.ariaLabel = localize('emptyFileEditor.searchAriaLabel', "Search files in the session workspace");
		picker.ignoreFocusOut = false;
		picker.valueSelection = [picker.value.length, picker.value.length];

		if (anchor) {
			disposables.add(picker.onDidChangeValue(value => {
				this.setInputValue(value);
				if (!value.trim()) {
					this.restoreInputFocusOnHide = true;
					picker.hide();
				}
			}));
			this.container.style.visibility = 'hidden';
		}
		this.announceAccessibilityHelpHint();
	}

	private setInputValue(value: string): void {
		this.syncingInputValue = true;
		try {
			this.input.value = value;
		} finally {
			this.syncingInputValue = false;
		}
	}

	private announceAccessibilityHelpHint(): void {
		if (this.accessibilityHelpHintAnnounced || !this.accessibilityService.isScreenReaderOptimized()) {
			return;
		}

		const hint = this.accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.EmptyFileEditorSearch);
		if (hint) {
			this.accessibilityHelpHintAnnounced = true;
			this.accessibilityService.status(hint);
		}
	}

	private createFileSearchDelegate(workspace: ISessionWorkspace | undefined, cacheKey: string, lifetimeToken: CancellationToken): IAnythingQuickAccessFileSearchDelegate {
		const folders = workspace?.folders ?? [];
		const isSearchable = (folder: ISessionFolder) => folder.workingDirectory.scheme === Schemas.file
			|| folder.workingDirectory.scheme === Schemas.vscodeRemote
			|| this.searchService.schemeHasFileSearchProvider(folder.workingDirectory.scheme);
		const searchableFolders = folders.filter(isSearchable);
		const virtualFolders = folders.filter(folder => !isSearchable(folder));
		let virtualFileIndex: Promise<IVirtualFileSearchIndex> | undefined;
		const getVirtualFileIndex = () => {
			if (!virtualFileIndex) {
				const index = this.createVirtualFileSearchIndex(workspace, virtualFolders, lifetimeToken);
				virtualFileIndex = index;
				void index.catch(() => {
					if (virtualFileIndex === index) {
						virtualFileIndex = undefined;
					}
				});
			}
			return virtualFileIndex;
		};

		return {
			search: (filePattern, token) => {
				return this.searchFiles(searchableFolders, getVirtualFileIndex(), filePattern, cacheKey, token);
			},
			getItemDescription: resource => this.getItemDescription(workspace, resource),
		};
	}

	private async searchFiles(searchableFolders: readonly ISessionFolder[], virtualFileIndex: Promise<IVirtualFileSearchIndex>, filePattern: string, cacheKey: string, token: CancellationToken): Promise<ISearchComplete> {
		const [searchResult, virtualIndex] = await Promise.all([
			searchableFolders.length
				? this.searchService.fileSearch(this.fileQueryBuilder.file(searchableFolders.map((folder, index) => ({
					uri: folder.workingDirectory,
					name: folder.name,
					index,
				})), {
					_reason: 'openFileHandler',
					filePattern,
					cacheKey,
					sortByScore: true,
					maxResults: MAX_SEARCH_RESULTS,
				}), token)
				: Promise.resolve({ results: [], messages: [], limitHit: false } satisfies ISearchComplete),
			virtualFileIndex.catch(error => {
				if (!token.isCancellationRequested) {
					this.logService.error('[EmptyFileEditorSearch] Failed to index a virtual workspace.', error);
				}
				return { entries: [], limitHit: false };
			}),
		]);
		if (token.isCancellationRequested) {
			return { results: [], messages: [], limitHit: false };
		}

		const results: ISearchComplete['results'] = [];
		const seen = new Set<string>();
		const normalizedPattern = prepareQuery(filePattern).normalizedLowercase.replaceAll('\\', '/');
		const virtualResults = virtualIndex.entries
			.filter(entry => !normalizedPattern || fuzzyContains(entry.searchPath, normalizedPattern))
			.map(entry => ({ resource: entry.resource }));
		for (const result of [...searchResult.results, ...virtualResults]) {
			const key = this.uriIdentityService.extUri.getComparisonKey(result.resource);
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			results.push(result);
		}

		return {
			results,
			limitHit: searchResult.limitHit || virtualIndex.limitHit,
			messages: searchResult.messages,
		};
	}

	private async createVirtualFileSearchIndex(workspace: ISessionWorkspace | undefined, folders: readonly ISessionFolder[], token: CancellationToken): Promise<IVirtualFileSearchIndex> {
		const entries: IVirtualFileSearchEntry[] = [];
		let limitHit = false;
		let visitedEntries = 0;
		const visitedDirectories = new Set<string>();
		const queue = folders.map(folder => ({
			folder,
			resource: folder.workingDirectory,
			excludes: glob.parse(getExcludes(this.configurationService.getValue<ISearchConfiguration>({ resource: folder.workingDirectory })) ?? {}, { trimForExclusions: true }),
		}));

		for (let queueIndex = 0; queueIndex < queue.length && !token.isCancellationRequested; queueIndex++) {
			const current = queue[queueIndex];
			const directoryKey = this.uriIdentityService.extUri.getComparisonKey(current.resource);
			if (visitedDirectories.has(directoryKey)) {
				continue;
			}
			visitedDirectories.add(directoryKey);

			let stat: IFileStat;
			try {
				stat = await this.fileService.resolve(current.resource);
			} catch (error) {
				if (toFileOperationResult(error as Error) === FileOperationResult.FILE_NOT_FOUND) {
					continue;
				}
				throw error;
			}
			const children = stat.children?.slice().sort((first, second) => {
				if (first.isDirectory !== second.isDirectory) {
					return first.isDirectory ? -1 : 1;
				}
				return first.name.localeCompare(second.name);
			}) ?? [];
			const hasSibling = hasSiblingFn(() => children.map(child => child.name));

			for (const child of children) {
				if (token.isCancellationRequested) {
					break;
				}
				const path = relativePath(current.folder.workingDirectory, child.resource);
				const excludeMatch = path && current.excludes(path, child.name, hasSibling);
				if (!path || typeof excludeMatch === 'string') {
					continue;
				}
				if (visitedEntries >= MAX_VIRTUAL_WORKSPACE_ENTRIES) {
					limitHit = true;
					break;
				}
				visitedEntries++;

				if (child.isDirectory) {
					queue.push({ ...current, resource: child.resource });
				} else {
					const folderName = this.getFolderName(workspace, current.folder);
					entries.push({
						resource: child.resource,
						searchPath: folders.length > 1 ? `${folderName}/${path}` : path,
					});
				}
			}
			if (limitHit) {
				break;
			}
		}

		return { entries, limitHit };
	}

	private getItemDescription(workspace: ISessionWorkspace | undefined, resource: URI): string | undefined {
		const folders = workspace?.folders ?? [];
		let folder: ISessionFolder | undefined;
		for (const candidate of folders) {
			if (this.uriIdentityService.extUri.isEqualOrParent(resource, candidate.workingDirectory)
				&& (!folder || candidate.workingDirectory.path.length > folder.workingDirectory.path.length)) {
				folder = candidate;
			}
		}
		if (!folder) {
			return undefined;
		}

		const directory = relativePath(folder.workingDirectory, dirname(resource));
		return folders.length > 1
			? directory ? `${this.getFolderName(workspace, folder)}/${directory}` : this.getFolderName(workspace, folder)
			: directory;
	}

	private getFolderName(workspace: ISessionWorkspace | undefined, folder: ISessionFolder): string {
		return workspace?.folders[0] === folder ? workspace.label : folder.name;
	}
}
