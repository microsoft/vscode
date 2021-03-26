/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./gettingStarted';
import { localize } from 'vs/nls';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { EditorOptions, IEditorInputFactory, IEditorOpenContext } from 'vs/workbench/common/editor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { $, addDisposableListener, Dimension, reset } from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IProductService } from 'vs/platform/product/common/productService';
import { IGettingStartedCategory, IGettingStartedCategoryDescriptor, IGettingStartedCategoryWithProgress, IGettingStartedService } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedService';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { welcomePageBackground, welcomePageProgressBackground, welcomePageProgressForeground, welcomePageTileBackground, welcomePageTileHoverBackground, welcomePageTileShadow } from 'vs/workbench/contrib/welcome/page/browser/welcomePageColors';
import { activeContrastBorder, buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, descriptionForeground, focusBorder, foreground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService, lastSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedIcons';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { IRecentFolder, IRecentlyOpened, IRecentWorkspace, isRecentFolder, isRecentWorkspace, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWindowOpenable } from 'vs/platform/windows/common/windows';
import { splitName } from 'vs/base/common/labels';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { coalesce } from 'vs/base/common/arrays';
import { isMacintosh } from 'vs/base/common/platform';
import { Throttler } from 'vs/base/common/async';
import { GettingStartedInput } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';

const SLIDE_TRANSITION_TIME_MS = 250;
const configurationKey = 'workbench.startupEditor';

const hiddenEntriesConfigurationKey = 'workbench.welcomePage.hiddenCategories';

export const inGettingStartedContext = new RawContextKey('inGettingStarted', false);

type GettingStartedActionClassification = {
	command: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
	argument: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
};
type GettingStartedActionEvent = {
	command: string;
	argument: string | undefined;
};

export class GettingStartedPage extends EditorPane {

	public static ID = 'gettingStartedPage';

	private editorInput!: GettingStartedInput;
	private inProgressScroll = Promise.resolve();

	private dispatchListeners: DisposableStore = new DisposableStore();
	private taskDisposables: DisposableStore = new DisposableStore();

	private gettingStartedCategories: IGettingStartedCategoryWithProgress[];
	private currentCategory: IGettingStartedCategoryWithProgress | undefined;

	private categoriesScrollbar: DomScrollableElement | undefined;
	private detailsScrollbar: DomScrollableElement | undefined;
	private detailImageScrollbar: DomScrollableElement | undefined;
	private buildSlideThrottle: Throttler = new Throttler();

	private container: HTMLElement;

	private contextService: IContextKeyService;
	private tasExperimentService?: ITASExperimentService;
	private previousSelection?: string;
	private recentlyOpened: Promise<IRecentlyOpened>;
	private selectedTaskElement?: HTMLDivElement;
	private hasScrolledToFirstCategory = false;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IGettingStartedService private readonly gettingStartedService: IGettingStartedService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IStorageService private storageService: IStorageService,
		@IContextKeyService contextService: IContextKeyService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
	) {

		super(GettingStartedPage.ID, telemetryService, themeService, storageService);

		this.container = $('.gettingStartedContainer',
			{
				role: 'document',
				tabindex: 0,
				'aria-label': localize('gettingStartedLabel', "Getting Started. Overview of how to get up to speed with your editor.")
			});

		this.tasExperimentService = tasExperimentService;

		this.contextService = this._register(contextService.createScoped(this.container));
		inGettingStartedContext.bindTo(this.contextService).set(true);

		this.gettingStartedCategories = this.gettingStartedService.getCategories();
		this._register(this.dispatchListeners);
		this.buildSlideThrottle = new Throttler();
		this._register(this.gettingStartedService.onDidAddTask(task => {
			this.gettingStartedCategories = this.gettingStartedService.getCategories();
			this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
		}));

		this._register(this.gettingStartedService.onDidChangeTask(task => {
			const ourCategory = this.gettingStartedCategories.find(c => c.id === task.category);
			if (!ourCategory || ourCategory.content.type === 'startEntry') { return; }
			const ourTask = ourCategory.content.items.find(item => item.id === task.id);
			if (!ourTask) { return; }
			ourTask.title = task.title;
			ourTask.description = task.description;
			ourTask.media.path = task.media.path;
		}));

		this._register(this.gettingStartedService.onDidChangeCategory(category => {
			const ourCategory = this.gettingStartedCategories.find(c => c.id === category.id);
			if (!ourCategory) { return; }

			ourCategory.title = category.title;
			ourCategory.description = category.description;
		}));

		this._register(this.gettingStartedService.onDidProgressTask(task => {
			const category = this.gettingStartedCategories.find(category => category.id === task.category);
			if (!category) { throw Error('Could not find category with ID: ' + task.category); }
			if (category.content.type !== 'items') { throw Error('internaal error: progressing task in a non-items category'); }
			const ourTask = category.content.items.find(_task => _task.id === task.id);
			if (!ourTask) {
				throw Error('Could not find task with ID: ' + task.id);
			}
			ourTask.done = task.done;
			if (category.id === this.currentCategory?.id) {
				const badgeelements = assertIsDefined(document.querySelectorAll(`[data-done-task-id="${task.id}"]`));
				badgeelements.forEach(badgeelement => {
					if (task.done) {
						badgeelement.parentElement?.setAttribute('aria-checked', 'true');
						badgeelement.classList.remove(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
						badgeelement.classList.add('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
					}
					else {
						badgeelement.parentElement?.setAttribute('aria-checked', 'false');
						badgeelement.classList.remove('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
						badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
					}
				});
			}
			this.updateCategoryProgress();
		}));

		this.recentlyOpened = workspacesService.getRecentlyOpened();
	}

	async setInput(newInput: GettingStartedInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this.container.classList.remove('animationReady');
		this.editorInput = newInput;
		await super.setInput(newInput, options, context, token);
		await this.buildCategoriesSlide();
		setTimeout(() => this.container.classList.add('animationReady'), 0);
	}

	makeCategoryVisibleWhenAvailable(categoryID: string) {
		this.gettingStartedCategories = this.gettingStartedService.getCategories();
		const ourCategory = this.gettingStartedCategories.find(c => c.id === categoryID);
		if (!ourCategory) {
			throw Error('Could not find category with ID: ' + categoryID);
		}
		if (ourCategory.content.type !== 'items') {
			throw Error('internaal error: category is not items');
		}
		this.scrollToCategory(categoryID);
	}

	private registerDispatchListeners() {
		this.dispatchListeners.clear();

		this.container.querySelectorAll('[x-dispatch]').forEach(element => {
			const [command, argument] = (element.getAttribute('x-dispatch') ?? '').split(':');
			if (command) {
				this.dispatchListeners.add(addDisposableListener(element, 'click', (e) => {

					this.commandService.executeCommand('workbench.action.keepEditor');
					this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command, argument });

					switch (command) {
						case 'scrollPrev': {
							this.scrollPrev();
							break;
						}
						case 'skip': {
							this.runSkip();
							break;
						}
						case 'showMoreRecents': {
							this.commandService.executeCommand('workbench.action.openRecent');
							break;
						}
						case 'configureVisibility': {
							this.commandService.executeCommand('workbench.action.openSettings', hiddenEntriesConfigurationKey);
							break;
						}
						case 'openFolder': {
							this.commandService.executeCommand(isMacintosh ? 'workbench.action.files.openFileFolder' : 'workbench.action.files.openFolder');
							break;
						}
						case 'selectCategory': {
							const selectedCategory = this.gettingStartedCategories.find(category => category.id === argument);
							if (!selectedCategory) { throw Error('Could not find category with ID ' + argument); }
							if (selectedCategory.content.type === 'startEntry') {
								this.commandService.executeCommand(selectedCategory.content.command);
							} else {
								this.scrollToCategory(argument);
							}
							break;
						}
						case 'hideCategory': {
							const selectedCategory = this.gettingStartedCategories.find(category => category.id === argument);
							if (!selectedCategory) { throw Error('Could not find category with ID ' + argument); }
							this.configurationService.updateValue(hiddenEntriesConfigurationKey,
								[...(this.configurationService.getValue<string[]>(hiddenEntriesConfigurationKey) ?? []), argument]);
							element.parentElement?.remove();
							break;
						}
						case 'selectTask': {
							this.selectTask(argument);
							break;
						}
						case 'toggleTaskCompletion': {
							if (!this.currentCategory || this.currentCategory.content.type !== 'items') {
								throw Error('cannot run task action for category of non items type' + this.currentCategory?.id);
							}

							const taskToggle = assertIsDefined(this.currentCategory?.content.items.find(task => task.id === argument));
							if (taskToggle.done) {
								this.gettingStartedService.deprogressTask(argument);
							} else {
								this.gettingStartedService.progressTask(argument);
							}
							break;
						}
						case 'runTaskAction': {
							if (!this.currentCategory || this.currentCategory.content.type !== 'items') {
								throw Error('cannot run task action for category of non items type' + this.currentCategory?.id);
							}
							const taskToRun = assertIsDefined(this.currentCategory?.content.items.find(task => task.id === argument));
							if (taskToRun.button.command) {
								this.commandService.executeCommand(taskToRun.button.command);
							} else if (taskToRun.button.link) {
								this.openerService.open(taskToRun.button.link);
								this.gettingStartedService.progressByEvent('linkOpened:' + taskToRun.button.link);
							} else {
								throw Error('Task ' + JSON.stringify(taskToRun) + ' does not have an associated action');
							}
							break;
						}
						default: {
							console.error('Dispatch to', command, argument, 'not defined');
							break;
						}
					}
					e.stopPropagation();
				}));
			}
		});
	}

	private selectTask(id: string | undefined, contractIfAlreadySelected = true, delayFocus = true) {
		const mediaElement = assertIsDefined(this.container.querySelector('.getting-started-media') as HTMLImageElement);
		this.taskDisposables.clear();
		if (id) {
			const taskElement = assertIsDefined(this.container.querySelector<HTMLDivElement>(`[data-task-id="${id}"]`));
			taskElement.parentElement?.querySelectorAll<HTMLElement>('.expanded').forEach(node => {
				node.classList.remove('expanded');
				node.style.height = ``;
				node.setAttribute('aria-expanded', 'false');
			});
			setTimeout(() => (taskElement as HTMLElement).focus(), delayFocus ? SLIDE_TRANSITION_TIME_MS : 0);
			if (this.editorInput.selectedTask === id && contractIfAlreadySelected) {
				this.previousSelection = this.editorInput.selectedTask;
				this.editorInput.selectedTask = undefined;
				this.selectedTaskElement = undefined;
				return;
			}
			taskElement.style.height = `${taskElement.scrollHeight}px`;
			if (!this.currentCategory || this.currentCategory.content.type !== 'items') {
				throw Error('cannot expand task for category of non items type' + this.currentCategory?.id);
			}
			this.editorInput.selectedTask = id;
			this.selectedTaskElement = taskElement;
			const taskToExpand = assertIsDefined(this.currentCategory.content.items.find(task => task.id === id));

			mediaElement.setAttribute('alt', taskToExpand.media.altText);
			this.updateMediaSourceForColorMode(mediaElement, taskToExpand.media.path);
			this.taskDisposables.add(addDisposableListener(mediaElement, 'load', () => mediaElement.width = mediaElement.naturalWidth * 2 / 3));
			if (taskToExpand.button.link) {
				this.taskDisposables.add(addDisposableListener(mediaElement, 'click', () => taskElement.querySelector('button')?.click()));
				mediaElement.classList.add('clickable');
			} else {
				mediaElement.classList.remove('clickable');
			}
			this.taskDisposables.add(this.themeService.onDidColorThemeChange(() => this.updateMediaSourceForColorMode(mediaElement, taskToExpand.media.path)));
			taskElement.classList.add('expanded');
			taskElement.setAttribute('aria-expanded', 'true');
		} else {
			this.editorInput.selectedTask = undefined;
			mediaElement.setAttribute('src', '');
			mediaElement.setAttribute('alt', '');
		}
		setTimeout(() => {
			// rescan after animation finishes
			this.detailsScrollbar?.scanDomNode();
			this.detailImageScrollbar?.scanDomNode();
		}, 100);
		this.detailsScrollbar?.scanDomNode();
		this.detailImageScrollbar?.scanDomNode();
	}

	private updateMediaSourceForColorMode(element: HTMLImageElement, sources: { hc: URI, dark: URI, light: URI }) {
		const themeType = this.themeService.getColorTheme().type;
		element.src = sources[themeType].toString(true);
	}

	createEditor(parent: HTMLElement) {
		const tasksContent =
			$('.gettingStartedDetailsContent', {},
				$('.gap'),
				$('.getting-started-detail-columns', {},
					$('.gap'),
					$('.getting-started-detail-left', {},
						$('.getting-started-detail-title')),
					$('.getting-started-detail-right', {},
						$('img.getting-started-media')),
					$('.gap'),
				),
				$('.gap')
			);

		const tasksSlide =
			$('.gettingStartedSlideDetails.gettingStartedSlide.detail', {},
				$('button.prev-button.button-link', { 'x-dispatch': 'scrollPrev' }, $('span.scroll-button.codicon.codicon-chevron-left'), localize('more', "More")),
				tasksContent
			);

		const gettingStartedPage =
			$('.gettingStarted', {
			},
				$('.gettingStartedSlideCategory.gettingStartedSlide.categories'),
				tasksSlide
			);


		if (this.detailImageScrollbar) { this.detailImageScrollbar.dispose(); }
		this.detailImageScrollbar = this._register(new DomScrollableElement(tasksContent, { className: 'full-height-scrollable' }));
		tasksSlide.appendChild(this.detailImageScrollbar.getDomNode());
		this.detailImageScrollbar.scanDomNode();

		this.container.appendChild(gettingStartedPage);
		parent.appendChild(this.container);
	}

	private async buildCategoriesSlide() {
		const hiddenCategories = new Set(this.configurationService.getValue(hiddenEntriesConfigurationKey) ?? []);
		const categoryElements = this.gettingStartedCategories
			.filter(entry => entry.content.type === 'items')
			.filter(entry => !hiddenCategories.has(entry.id))
			.map(
				category => {
					return $('button.getting-started-category',
						{
							'x-dispatch': 'selectCategory:' + category.id,
							'role': 'listitem',
							'title': category.description
						},
						this.iconWidgetFor(category),
						$('a.codicon.codicon-close.hide-category-button', {
							'x-dispatch': 'hideCategory:' + category.id,
							'title': localize('close', "Hide"),
						}),
						$('h3.category-title', {}, category.title),
						$('.category-progress', { 'x-data-category-id': category.id, },
							$('.progress-bar-outer', { 'role': 'progressbar' },
								$('.progress-bar-inner'))));
				});

		const categoryScrollContainer = $('.getting-started-categories-scrolling-container');
		const categoriesContainer = $('ul.getting-started-categories-container', { 'role': 'list' });
		categoryElements.forEach(element => {
			categoriesContainer.appendChild(element);
		});

		categoriesContainer.appendChild(
			$('.no-categories', {},
				localize('no categories', "No remaining walkthroughs."),
				$('button.button-link', { 'x-dispatch': 'configureVisibility' }, localize('configure visiblity', "Configure visibility?")))
		);


		categoryScrollContainer.appendChild(categoriesContainer);

		if (this.categoriesScrollbar) { this.categoriesScrollbar.dispose(); }
		this.categoriesScrollbar = this._register(new DomScrollableElement(categoryScrollContainer, {}));

		const showOnStartupCheckbox = $('input.checkbox', { id: 'showOnStartup', type: 'checkbox' }) as HTMLInputElement;

		showOnStartupCheckbox.checked = this.configurationService.getValue(configurationKey) === 'gettingStarted';
		this._register(addDisposableListener(showOnStartupCheckbox, 'click', () => {
			if (showOnStartupCheckbox.checked) {
				this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'showOnStartupChecked', argument: undefined });
				this.configurationService.updateValue(configurationKey, 'gettingStarted');
			} else {
				this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'showOnStartupUnchecked', argument: undefined });
				this.configurationService.updateValue(configurationKey, 'none');
			}
		}));

		const categoriesSlide = assertIsDefined(this.container.querySelector('.gettingStartedSlideCategory') as HTMLElement);
		reset(categoriesSlide,
			$('.categories-slide-container', {},
				$('.header', {},
					$('h1.product-name.caption', {}, localize('gettingStarted.vscode', "Visual Studio Code")),
					$('p.subtitle.description', {}, localize({ key: 'gettingStarted.editingEvolved', comment: ['Shown as subtitle on the Welcome page.'] }, "Editing evolved")),
				),
				$('.categories-split-view', {},
					$('.categories-left', {},
						this.buildStartList(),
						this.buildRecentlyOpenedList(),
					),
					$('.categories-right', {},
						$('h2', {}, localize('gettingStarted', "Getting Started")),
						this.categoriesScrollbar.getDomNode(),
					),
				)
			),
			$('.footer', {},
				$('p.showOnStartup', {},
					showOnStartupCheckbox,
					$('label.caption', { for: 'showOnStartup' }, localize('welcomePage.showOnStartup', "Show welcome page on startup")))
			)
		);
		this.categoriesScrollbar.scanDomNode();

		this.updateCategoryProgress();

		assertIsDefined(this.container.querySelector('.product-name')).textContent = this.productService.nameLong;
		this.registerDispatchListeners();


		if (this.editorInput.selectedCategory) {
			this.currentCategory = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);
			if (!this.currentCategory) {
				console.error('Could not restore to category ' + this.editorInput.selectedCategory + ' as it was not found');
				this.editorInput.selectedCategory = undefined;
				this.editorInput.selectedTask = undefined;
			} else {
				this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedTask);
				this.setSlide('details');
				return;
			}
		}

		const someItemsComplete = this.gettingStartedCategories.some(categry => categry.content.type === 'items' && categry.content.stepsComplete);
		if (!someItemsComplete && !this.hasScrolledToFirstCategory) {

			const fistContentBehaviour =
				!this.storageService.get(lastSessionDateStorageKey, StorageScope.GLOBAL) // isNewUser ?
					? 'openToFirstCategory'
					: await Promise.race([
						this.tasExperimentService?.getTreatment<'index' | 'openToFirstCategory'>('GettingStartedFirstContent'),
						new Promise<'index'>(resolve => setTimeout(() => resolve('index'), 1000)),
					]);

			if (this.gettingStartedCategories.some(category => category.content.type === 'items' && category.content.stepsComplete)) {
				this.setSlide('categories');
				return;
			} else {
				if (fistContentBehaviour === 'openToFirstCategory') {
					const first = this.gettingStartedCategories.find(category => category.content.type === 'items');
					this.hasScrolledToFirstCategory = true;
					if (first) {
						this.currentCategory = first;
						this.editorInput.selectedCategory = this.currentCategory?.id;
						this.buildCategorySlide(this.editorInput.selectedCategory);
						this.setSlide('details');
						return;
					}
				}
			}
		}

		this.setSlide('categories');
	}

	private buildRecentlyOpenedList(): HTMLElement {
		const renderRecent = (recent: (IRecentFolder | IRecentWorkspace)) => {
			let fullPath: string;
			let windowOpenable: IWindowOpenable;
			if (isRecentFolder(recent)) {
				windowOpenable = { folderUri: recent.folderUri };
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: true });
			} else {
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: true });
				windowOpenable = { workspaceUri: recent.workspace.configPath };
			}

			const { name, parentPath } = splitName(fullPath);

			const li = $('li');
			const link = $('button.button-link');

			link.innerText = name;
			link.title = fullPath;
			link.setAttribute('aria-label', localize('welcomePage.openFolderWithPath', "Open folder {0} with path {1}", name, parentPath));
			link.addEventListener('click', e => {
				this.hostService.openWindow([windowOpenable], { forceNewWindow: e.ctrlKey || e.metaKey, remoteAuthority: recent.remoteAuthority });
				e.preventDefault();
				e.stopPropagation();
			});
			li.appendChild(link);

			const span = $('span');
			span.classList.add('path');
			span.classList.add('detail');
			span.innerText = parentPath;
			span.title = fullPath;
			li.appendChild(span);

			return li;
		};

		const container = $('.recently-opened-container', {},
			$('h2', {}, localize('recent', "Recent")),
			$('ul.recent'));

		this.recentlyOpened.then(({ workspaces }) => {
			// Filter out the current workspace
			workspaces = workspaces.filter(recent => !this.workspaceContextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri));
			const ul = container.querySelector('ul');
			if (!ul) {
				return;
			}
			if (!workspaces.length) {
				this.container.classList.add('emptyRecent');
				ul.append($('.empty-recent', {}, 'You have no recent folders,', $('button.button-link', { 'x-dispatch': 'openFolder' }, 'open a folder'), 'to start.'));
				return;
			}

			const workspacesToShow = workspaces.slice(0, 5);
			const updateEntries = () => {
				const listEntries = workspacesToShow.map(renderRecent);
				while (ul.firstChild) {
					ul.removeChild(ul.firstChild);
				}
				ul.append(...listEntries);
				ul.append($('.more', {}, $('button.button-link', { 'x-dispatch': 'showMoreRecents' }, 'More...'), $('span.keybinding-label', {}, this.getKeybindingLabel('workbench.action.openRecent'))));
			};
			updateEntries();
			this._register(this.labelService.onDidChangeFormatters(() => {
				updateEntries();
				this.registerDispatchListeners();
			}));
		}).then(() => this.registerDispatchListeners(), onUnexpectedError);

		return container;
	}


	private buildStartList(): HTMLElement {
		const renderStartEntry = (entry: IGettingStartedCategory): HTMLElement | undefined => {

			if (entry.content.type === 'items') { return undefined; }

			const li = $('li', {});
			const button = $<HTMLAnchorElement>('button.button-link', { 'x-dispatch': 'selectCategory:' + entry.id }, this.iconWidgetFor(entry), $('span', {}, entry.title));
			button.title = entry.description;

			li.appendChild(button);

			return li;
		};
		const ul = $('ul.start');
		const container = $('.start-container', {}, $('h2', {}, localize('start', "Start")), ul);
		const updateEntries = () => {
			const listEntries = this.gettingStartedCategories.map(renderStartEntry);
			while (ul.firstChild) {
				ul.removeChild(ul.firstChild);
			}
			ul.append(...coalesce(listEntries));
		};
		updateEntries();

		return container;
	}



	layout(size: Dimension) {
		this.categoriesScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
		this.detailImageScrollbar?.scanDomNode();
		this.container.classList[size.height <= 685 ? 'add' : 'remove']('height-constrained');


		if (this.selectedTaskElement) {
			this.selectedTaskElement.style.height = ``; // unset or the scrollHeight will just be the old height
			this.selectedTaskElement.style.height = `${this.selectedTaskElement.scrollHeight}px`;
		}
	}

	private updateCategoryProgress() {
		document.querySelectorAll('.category-progress').forEach(element => {
			const categoryID = element.getAttribute('x-data-category-id');
			const category = this.gettingStartedCategories.find(category => category.id === categoryID);
			if (!category) { throw Error('Could not find category with ID ' + categoryID); }
			if (category.content.type !== 'items') { throw Error('Category with ID ' + categoryID + ' is not of items type'); }
			const numDone = category.content.stepsComplete = category.content.items.filter(task => task.done).length;
			const numTotal = category.content.stepsTotal = category.content.items.length;

			const bar = assertIsDefined(element.querySelector('.progress-bar-inner')) as HTMLDivElement;
			bar.setAttribute('aria-valuemin', '0');
			bar.setAttribute('aria-valuenow', '' + numDone);
			bar.setAttribute('aria-valuemax', '' + numTotal);
			const progress = Math.max((numDone / numTotal) * 100, 3);
			bar.style.width = `${progress}%`;

			if (numTotal === numDone) {
				bar.title = `All items complete!`;
			}
			else {
				bar.title = `${numDone} of ${numTotal} items complete`;
			}
		});
	}

	private async scrollToCategory(categoryID: string) {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.clearDetialView();
			this.editorInput.selectedCategory = categoryID;
			this.currentCategory = this.gettingStartedCategories.find(category => category.id === categoryID);
			this.buildCategorySlide(categoryID);
			this.setSlide('details');
		});
	}

	private iconWidgetFor(category: IGettingStartedCategoryDescriptor) {
		return category.icon.type === 'icon' ? $(ThemeIcon.asCSSSelector(category.icon.icon)) : $('img.category-icon', { src: category.icon.path });
	}

	private buildCategorySlide(categoryID: string, selectedItem?: string) {
		const category = this.gettingStartedCategories.find(category => category.id === categoryID);
		let foundNext = false;
		const nextCategory = this.gettingStartedCategories.find(category => {
			if (foundNext && category.content.type === 'items') { return true; }
			if (category.id === categoryID) { foundNext = true; }
			return false;
		});

		if (!category) { throw Error('could not find category with ID ' + categoryID); }
		if (category.content.type !== 'items') { throw Error('category with ID ' + categoryID + ' is not of items type'); }

		const leftColumn = assertIsDefined(this.container.querySelector('.getting-started-detail-left'));
		const detailTitle = assertIsDefined(this.container.querySelector('.getting-started-detail-title'));
		const oldTitle = detailTitle.querySelector('.getting-started-category');
		if (oldTitle) { detailTitle.removeChild(oldTitle); }

		detailTitle.appendChild(
			$('.getting-started-category',
				{},
				this.iconWidgetFor(category),
				$('.category-description-container', {},
					$('h2.category-title', {}, category.title),
					$('.category-description.description', {}, category.description))));

		const categoryElements = category.content.items.map(
			(task, i, arr) => {

				const codicon = $('.codicon' + (task.done ? '.complete' + ThemeIcon.asCSSSelector(gettingStartedCheckedCodicon) : ThemeIcon.asCSSSelector(gettingStartedUncheckedCodicon)),
					{
						'data-done-task-id': task.id,
						'x-dispatch': 'toggleTaskCompletion:' + task.id,
					});

				const taskActions = $('.actions', {},
					$('button.emphasis.getting-started-task-action',
						{ 'x-dispatch': 'runTaskAction:' + task.id },
						task.button.title),
					...(
						arr[i + 1]
							? [$('button.task-next.button-link', { 'x-dispatch': 'selectTask:' + arr[i + 1].id }, localize('next', "Next")),]
							: nextCategory
								? [$('button.task-next.button-link', { 'x-dispatch': 'selectCategory:' + nextCategory.id }, localize('nextPage', "Next Page")),]
								: []
					));


				const taskDescription = $('.task-description-container', {},
					$('h3.task-title', {}, task.title),
					$('.task-description.description', {}, task.description),
					$('.image-description', { 'aria-label': localize('imageShowing', "Image showing {0}", task.media.altText) }),
					taskActions,
				);

				const keybindingLabel = (task.button.command && this.getKeybindingLabel(task.button.command));
				if (keybindingLabel) {
					taskDescription.appendChild($('span.shortcut-message', {}, 'Tip: Use keyboard shortcut ', $('span.keybinding', {}, keybindingLabel)));
				}

				return $('button.getting-started-task',
					{
						'x-dispatch': 'selectTask:' + task.id,
						'data-task-id': task.id,
						'aria-expanded': 'false',
						'aria-checked': '' + task.done,
						'role': 'listitem',
					},
					codicon,
					taskDescription);
			});

		const detailContainer = $('.getting-started-detail-container', { 'role': 'list' });
		if (this.detailsScrollbar) { this.detailsScrollbar.getDomNode().remove(); this.detailsScrollbar.dispose(); }
		this.detailsScrollbar = this._register(new DomScrollableElement(detailContainer, { className: 'full-height-scrollable' }));
		categoryElements.forEach(element => detailContainer.appendChild(element));
		leftColumn.appendChild(this.detailsScrollbar.getDomNode());

		const toExpand = category.content.items.find(item => !item.done) ?? category.content.items[0];
		this.selectTask(selectedItem ?? toExpand.id, false);
		this.detailsScrollbar.scanDomNode();
		this.registerDispatchListeners();
	}

	private clearDetialView() {
		const detailContainer = (this.container.querySelector('.getting-started-detail-container'));
		detailContainer?.remove();
		const detailTitle = assertIsDefined(this.container.querySelector('.getting-started-detail-title'));
		while (detailTitle.firstChild) { detailTitle.removeChild(detailTitle.firstChild); }
	}

	private getKeybindingLabel(command: string) {
		const binding = this.keybindingService.lookupKeybinding(command);
		if (!binding) { return ''; }
		else { return binding.getLabel() ?? ''; }
	}

	private async scrollPrev() {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.currentCategory = undefined;
			this.editorInput.selectedCategory = undefined;
			this.editorInput.selectedTask = undefined;
			this.selectTask(undefined);
			this.setSlide('categories');
		});
	}

	private runSkip() {
		this.commandService.executeCommand('workbench.action.closeActiveEditor');
	}

	escape() {
		if (this.editorInput.selectedCategory) {
			this.scrollPrev();
		} else {
			this.runSkip();
		}
	}

	focusNext() {
		if (this.editorInput.selectedCategory) {
			const allTasks = this.currentCategory?.content.type === 'items' && this.currentCategory.content.items;
			if (allTasks) {
				const toFind = this.editorInput.selectedTask ?? this.previousSelection;
				const selectedIndex = allTasks.findIndex(task => task.id === toFind);
				if (allTasks[selectedIndex + 1]?.id) { this.selectTask(allTasks[selectedIndex + 1]?.id, true, false); }
			}
		} else {
			(document.activeElement?.nextElementSibling as HTMLElement)?.focus?.();
		}
	}

	focusPrevious() {
		if (this.editorInput.selectedCategory) {
			const allTasks = this.currentCategory?.content.type === 'items' && this.currentCategory.content.items;
			if (allTasks) {
				const toFind = this.editorInput.selectedTask ?? this.previousSelection;
				const selectedIndex = allTasks.findIndex(task => task.id === toFind);
				if (allTasks[selectedIndex - 1]?.id) { this.selectTask(allTasks[selectedIndex - 1]?.id, true, false); }
			}
		} else {
			(document.activeElement?.previousElementSibling as HTMLElement)?.focus?.();
		}
	}

	private setSlide(toEnable: 'details' | 'categories') {
		const slideManager = assertIsDefined(this.container.querySelector('.gettingStarted'));
		if (toEnable === 'categories') {
			slideManager.classList.remove('showDetails');
			slideManager.classList.add('showCategories');
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = true);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = false);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('input').forEach(button => button.disabled = false);
			this.container.focus();
		} else {
			slideManager.classList.add('showDetails');
			slideManager.classList.remove('showCategories');
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = false);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = true);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('input').forEach(button => button.disabled = true);
		}
	}
}

export class GettingStartedInputFactory implements IEditorInputFactory {
	public canSerialize(editorInput: GettingStartedInput): boolean {
		return true;
	}

	public serialize(editorInput: GettingStartedInput): string {
		return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedTask: editorInput.selectedTask });
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): GettingStartedInput {
		try {
			const { selectedCategory, selectedTask } = JSON.parse(serializedEditorInput);
			return new GettingStartedInput({ selectedCategory, selectedTask });
		} catch { }
		return new GettingStartedInput({});
	}
}

registerThemingParticipant((theme, collector) => {

	const backgroundColor = theme.getColor(welcomePageBackground);
	if (backgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer { background-color: ${backgroundColor}; }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer { color: ${foregroundColor}; }`);
	}

	const descriptionColor = theme.getColor(descriptionForeground);
	if (descriptionColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .description { color: ${descriptionColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .category-progress .message { color: ${descriptionColor}; }`);
	}

	const iconColor = theme.getColor(textLinkForeground);
	if (iconColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .getting-started-category .codicon:not(.codicon-close) { color: ${iconColor} }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon.complete { color: ${iconColor} } `);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task.expanded .codicon { color: ${iconColor} } `);
	}

	const buttonColor = theme.getColor(welcomePageTileBackground);
	if (buttonColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button { background: ${buttonColor}; }`);
	}

	const shadowColor = theme.getColor(welcomePageTileShadow);
	if (shadowColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.categories .getting-started-category { filter: drop-shadow(2px 2px 2px ${buttonColor}); }`);
	}

	const buttonHoverColor = theme.getColor(welcomePageTileHoverBackground);
	if (buttonHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button:hover { background: ${buttonHoverColor}; }`);
	}
	if (buttonColor && buttonHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.expanded:hover { background: ${buttonColor}; }`);
	}

	const emphasisButtonForeground = theme.getColor(buttonForeground);
	if (emphasisButtonForeground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.emphasis { color: ${emphasisButtonForeground}; }`);
	}

	const emphasisButtonBackground = theme.getColor(buttonBackground);
	if (emphasisButtonBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.emphasis { background: ${emphasisButtonBackground}; }`);
	}

	const pendingItemColor = theme.getColor(descriptionForeground);
	if (pendingItemColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon { color: ${pendingItemColor} } `);
	}

	const emphasisButtonHoverBackground = theme.getColor(buttonHoverBackground);
	if (emphasisButtonHoverBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.emphasis:hover { background: ${emphasisButtonHoverBackground}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a:not(.codicon-close) { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .button-link { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .button-link .scroll-button { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a:not(.codicon-close):hover,
			.monaco-workbench .part.editor > .content .gettingStartedContainer a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a:not(.codicon-close):focus { outline-color: ${focusColor}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button { border: 1px solid ${border}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.button-link { border: inherit; }`);
	}
	const activeBorder = theme.getColor(activeContrastBorder);
	if (activeBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button:hover { outline-color: ${activeBorder}; }`);
	}

	const progressBackground = theme.getColor(welcomePageProgressBackground);
	if (progressBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.categories .progress-bar-outer { background-color: ${progressBackground}; }`);
	}
	const progressForeground = theme.getColor(welcomePageProgressForeground);
	if (progressForeground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.categories .progress-bar-inner { background-color: ${progressForeground}; }`);
	}
});
