/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./gettingStarted';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, EditorOptions, IEditorInputFactory, IEditorOpenContext } from 'vs/workbench/common/editor';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { $, addDisposableListener, reset } from 'vs/base/browser/dom';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IProductService } from 'vs/platform/product/common/productService';
import { IGettingStartedCategoryWithProgress, IGettingStartedService } from 'vs/workbench/services/gettingStarted/common/gettingStartedService';
import { IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { welcomePageBackground, welcomePageProgressBackground, welcomePageProgressForeground, welcomePageTileBackground, welcomePageTileHoverBackground } from 'vs/workbench/contrib/welcome/page/browser/welcomePageColors';
import { activeContrastBorder, buttonBackground, buttonForeground, buttonHoverBackground, buttonSecondaryBackground, contrastBorder, descriptionForeground, focusBorder, foreground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedIcons';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const SLIDE_TRANSITION_TIME_MS = 250;
const configurationKey = 'workbench.startupEditor';

export const gettingStartedInputTypeId = 'workbench.editors.gettingStartedInput';

export class GettingStartedInput extends EditorInput {

	get resource(): URI | undefined {
		return URI.from({ scheme: Schemas.walkThrough, authority: 'vscode_getting_started_page' });
	}
	getTypeId(): string {
		return GettingStartedInput.ID;
	}

	matches(other: unknown) {
		if (other instanceof GettingStartedInput) {
			return true;
		}
		return false;
	}

	static readonly ID = gettingStartedInputTypeId;

	constructor(
		options: { selectedCategory?: string, selectedTask?: string }
	) {
		super();
		this.selectedCategory = options.selectedCategory;
		this.selectedTask = options.selectedTask;
	}

	getName() {
		return localize('gettingStarted', "Getting Started");
	}

	selectedCategory: string | undefined;
	selectedTask: string | undefined;
}

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

	private container: HTMLElement;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IGettingStartedService private readonly gettingStartedService: IGettingStartedService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
	) {

		super(GettingStartedPage.ID, telemetryService, themeService, storageService);

		this.container = $('.gettingStartedContainer');

		this.gettingStartedCategories = this.gettingStartedService.getCategories();
		this._register(this.dispatchListeners);
		this._register(this.gettingStartedService.onDidAddTask(task => console.log('added new task', task, 'that isnt being rendered yet')));
		this._register(this.gettingStartedService.onDidAddCategory(category => console.log('added new category', category, 'that isnt being rendered yet')));
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
						badgeelement.classList.remove(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
						badgeelement.classList.add('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
					}
					else {
						badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
						badgeelement.classList.remove('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
					}
				});
			}
			this.updateCategoryProgress();
		}));
	}

	async setInput(newInput: GettingStartedInput, options: EditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this.container.classList.remove('animationReady');
		this.editorInput = newInput;
		await super.setInput(newInput, options, context, token);
		this.buildCategoriesSlide();
		setTimeout(() => this.container.classList.add('animationReady'), 0);
	}

	private registerDispatchListeners() {
		this.dispatchListeners.clear();

		this.container.querySelectorAll('[x-dispatch]').forEach(element => {
			const [command, argument] = (element.getAttribute('x-dispatch') ?? '').split(':');
			if (command) {
				this.dispatchListeners.add(addDisposableListener(element, 'click', (e) => {

					this.commandService.executeCommand('workbench.action.keepEditor');

					type GettingStartedActionClassification = {
						command: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
						argument: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
					};
					type GettingStartedActionEvent = {
						command: string;
						argument: string | undefined;
					};
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
						case 'selectCategory': {
							const selectedCategory = this.gettingStartedCategories.find(category => category.id === argument);
							if (!selectedCategory) { throw Error('Could not find category with ID ' + argument); }
							if (selectedCategory.content.type === 'command') {
								this.commandService.executeCommand(selectedCategory.content.command);
							} else {
								this.scrollToCategory(argument);
							}
							break;
						}
						case 'selectTask': {
							this.selectTask(argument);
							e.stopPropagation();
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
							e.stopPropagation();
							break;
						}
						default: {
							console.error('Dispatch to', command, argument, 'not defined');
							break;
						}
					}
				}));
			}
		});
	}

	private selectTask(id: string | undefined, contractIfAlreadySelected = true, delayFocus = true) {
		const mediaElement = assertIsDefined(this.container.querySelector('.getting-started-media') as HTMLImageElement);
		this.taskDisposables.clear();
		if (id) {
			const taskElement = assertIsDefined(this.container.querySelector(`[data-task-id="${id}"]`));
			taskElement.parentElement?.querySelectorAll('.expanded').forEach(node => {
				node.classList.remove('expanded');
				node.setAttribute('aria-expanded', 'false');
			});
			setTimeout(() => (taskElement as HTMLDivElement).focus(), delayFocus ? SLIDE_TRANSITION_TIME_MS : 0);
			if (this.editorInput.selectedTask === id && contractIfAlreadySelected) {
				this.editorInput.selectedTask = undefined;
				return;
			}
			if (!this.currentCategory || this.currentCategory.content.type !== 'items') {
				throw Error('cannot expand task for category of non items type' + this.currentCategory?.id);
			}
			this.editorInput.selectedTask = id;
			const taskToExpand = assertIsDefined(this.currentCategory.content.items.find(task => task.id === id));

			mediaElement.setAttribute('alt', taskToExpand.media.altText);
			this.updateMediaSourceForColorMode(mediaElement, taskToExpand.media.path);
			this.taskDisposables.add(addDisposableListener(mediaElement, 'load', () => mediaElement.width = mediaElement.naturalWidth * 2 / 3));
			this.taskDisposables.add(addDisposableListener(mediaElement, 'click', () => taskElement.querySelector('button')?.click()));
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
		element.src = sources[themeType].toString();
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
				$('button.prev-button.button-link', { 'x-dispatch': 'scrollPrev' }, $('span.scroll-button.codicon.codicon-chevron-left'), localize('back', "Back")),
				tasksContent
			);

		const gettingStartedPage =
			$('.gettingStarted.welcomePageFocusElement', {
				role: 'document',
				tabIndex: '0',
				'aria-label': localize('gettingStartedLabel', "Getting Started. Overview of how to get up to speed with your editor.")
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

	buildCategoriesSlide() {
		const categoryElements = this.gettingStartedCategories.map(
			category => {
				const categoryDescriptionElement =
					category.content.type === 'items' ?
						$('.category-description-container', {},
							$('h3.category-title', {}, category.title),
							$('.category-description.description', { 'aria-label': category.description + ' ' + localize('pressEnterToSelect', "Press Enter to Select") }, category.description),
							$('.category-progress', { 'x-data-category-id': category.id, },
								$('.message'),
								$('.progress-bar-outer', {
									'role': 'progressbar'
								},
									$('.progress-bar-inner'))))
						:
						$('.category-description-container', {},
							$('h3.category-title', {}, category.title),
							$('.category-description.description', { 'aria-label': category.description + ' ' + localize('pressEnterToSelect', "Press Enter to Select") }, category.description));

				return $('button.getting-started-category',
					{
						'x-dispatch': 'selectCategory:' + category.id,
						'role': 'listitem',
					},
					$(ThemeIcon.asCSSSelector(category.icon), {}), categoryDescriptionElement);
			});

		const categoryScrollContainer = $('.getting-started-categories-scrolling-container');
		const categoriesContainer = $('.getting-started-categories-container', { 'role': 'list' });
		categoryElements.forEach(element => {
			categoriesContainer.appendChild(element);
		});

		categoryScrollContainer.appendChild(categoriesContainer);
		const showOnStartupCheckbox = $('input.checkbox', { id: 'showOnStartup', type: 'checkbox' }) as HTMLInputElement;
		categoryScrollContainer.appendChild(
			$('.footer', {},
				// $('button.skip.button-link', { 'x-dispatch': 'skip' }, localize('gettingStarted.skip', "Skip")),
				$('p.showOnStartup', {},
					showOnStartupCheckbox,
					$('label.caption', { for: 'showOnStartup' }, localize('welcomePage.showOnStartup', "Show Getting Started page on startup")))
			));

		showOnStartupCheckbox.checked = this.configurationService.getValue(configurationKey) === 'gettingStarted';
		this._register(addDisposableListener(showOnStartupCheckbox, 'click', () => {
			this.configurationService.updateValue(configurationKey, showOnStartupCheckbox.checked ? 'gettingStarted' : 'welcomePage');
		}));

		if (this.categoriesScrollbar) { this.categoriesScrollbar.dispose(); }
		this.categoriesScrollbar = this._register(new DomScrollableElement(categoryScrollContainer, {}));
		const categoriesSlide = assertIsDefined(this.container.querySelector('.gettingStartedSlideCategory') as HTMLElement);
		reset(categoriesSlide,
			$('.gap'),
			$('.header', {},
				$('h1.product-name.caption', {}, localize('gettingStarted.vscode', "Visual Studio Code")),
				$('p.subtitle.description', {}, localize({ key: 'gettingStarted.editingRedefined', comment: ['Shown as subtitle on the Welcome page.'] }, "Code editing. Redefined")),
			),
			this.categoriesScrollbar.getDomNode(),
			$('.gap')
		);
		this.categoriesScrollbar.scanDomNode();

		this.updateCategoryProgress();

		assertIsDefined(this.container.querySelector('.product-name')).textContent = this.productService.nameLong;
		this.registerDispatchListeners();


		if (this.editorInput.selectedCategory) {
			this.currentCategory = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);
			if (!this.currentCategory) {
				throw Error('Could not restore to category ' + this.editorInput.selectedCategory + ' as it was not found');
			}
			this.setSlide('details');
			this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedTask);
		} else {
			this.setSlide('categories');
		}
	}

	layout() {
		this.categoriesScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
		this.detailImageScrollbar?.scanDomNode();
	}

	private updateCategoryProgress() {
		document.querySelectorAll('.category-progress').forEach(element => {
			const categoryID = element.getAttribute('x-data-category-id');
			const category = this.gettingStartedCategories.find(category => category.id === categoryID);
			if (!category) { throw Error('Could not find category with ID ' + categoryID); }
			if (category.content.type !== 'items') { throw Error('Category with ID ' + categoryID + ' is not of items type'); }
			const numDone = category.content.items.filter(task => task.done).length;
			const numTotal = category.content.items.length;

			const message = assertIsDefined(element.firstChild);
			const bar = assertIsDefined(element.querySelector('.progress-bar-inner')) as HTMLDivElement;
			bar.setAttribute('aria-valuemin', '0');
			bar.setAttribute('aria-valuenow', '' + numDone);
			bar.setAttribute('aria-valuemax', '' + numTotal);

			bar.style.width = `${(numDone / numTotal) * 100}%`;

			if (numTotal === numDone) {
				message.textContent = `All items complete!`;
			}
			else {
				message.textContent = `${numDone} of ${numTotal} items complete`;
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

	private buildCategorySlide(categoryID: string, selectedItem?: string) {
		const category = this.gettingStartedCategories.find(category => category.id === categoryID);
		if (!category) { throw Error('could not find category with ID ' + categoryID); }
		if (category.content.type !== 'items') { throw Error('category with ID ' + categoryID + ' is not of items type'); }

		const leftColumn = assertIsDefined(this.container.querySelector('.getting-started-detail-left'));
		const detailTitle = assertIsDefined(this.container.querySelector('.getting-started-detail-title'));
		const oldTitle = detailTitle.querySelector('.getting-started-category');
		if (oldTitle) { detailTitle.removeChild(oldTitle); }

		detailTitle.appendChild(
			$('.getting-started-category',
				{},
				$(ThemeIcon.asCSSSelector(category.icon), {}),
				$('.category-description-container', {},
					$('h2.category-title', {}, category.title),
					$('.category-description.description', {}, category.description))));

		const categoryElements = category.content.items.map(
			(task, i, arr) => $('button.getting-started-task',
				{
					'x-dispatch': 'selectTask:' + task.id,
					'data-task-id': task.id,
					'aria-expanded': 'false',
					'role': 'listitem',
				},
				$('.codicon' + (task.done ? '.complete.codicon-pass-filled' : '.codicon-circle-large-outline'), { 'data-done-task-id': task.id }),
				$('.task-description-container', {},
					$('h3.task-title', {}, task.title),
					$('.task-description.description', {}, task.description),
					$('.image-description', { 'aria-label': localize('imageShowing', "Image showing {0}", task.media.altText) }),
					$('.actions', {},
						...(
							task.button
								? [$('button.emphasis.getting-started-task-action', { 'x-dispatch': 'runTaskAction:' + task.id },
									task.button.title + (task.button.command ? this.getKeybindingLabel(task.button.command) : '')
								)]
								: []),
						...(
							arr[i + 1]
								? [
									$('button.task-next',
										{ 'x-dispatch': 'selectTask:' + arr[i + 1].id }, localize('next', "Next")),
								] : []
						))
				)));

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
		else { return ` (${binding.getLabel()})`; }
	}

	private async scrollPrev() {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.currentCategory = undefined;
			this.editorInput.selectedCategory = undefined;
			this.editorInput.selectedTask = undefined;
			this.selectTask(undefined);
			this.setSlide('categories');
			this.focusFirstUncompletedCategory();
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
				const selectedIndex = allTasks.findIndex(task => task.id === this.editorInput.selectedTask);
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
				const selectedIndex = allTasks.findIndex(task => task.id === this.editorInput.selectedTask);
				if (allTasks[selectedIndex - 1]?.id) { this.selectTask(allTasks[selectedIndex - 1]?.id, true, false); }
			}
		} else {
			(document.activeElement?.previousElementSibling as HTMLElement)?.focus?.();
		}
	}

	private focusFirstUncompletedCategory() {
		let toFocus!: HTMLElement;
		this.container.querySelectorAll('.category-progress').forEach(progress => {
			const progressAmount = assertIsDefined(progress.querySelector('.progress-bar-inner') as HTMLDivElement).style.width;
			if (!toFocus && progressAmount !== '100%') { toFocus = assertIsDefined(progress.parentElement?.parentElement); }
		});
		(toFocus ?? assertIsDefined(this.container.querySelector('button.skip')) as HTMLButtonElement).focus();
	}

	private setSlide(toEnable: 'details' | 'categories') {
		const slideManager = assertIsDefined(this.container.querySelector('.gettingStarted'));
		if (toEnable === 'categories') {
			slideManager.classList.remove('showDetails');
			slideManager.classList.add('showCategories');
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = true);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = false);
			(this.container.querySelector('.welcomePageFocusElement') as HTMLElement)?.focus();
		} else {
			slideManager.classList.add('showDetails');
			slideManager.classList.remove('showCategories');
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = false);
			this.container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = true);
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
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .getting-started-category .codicon { color: ${iconColor} }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon.complete { color: ${iconColor} } `);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task.expanded .codicon { color: ${iconColor} } `);
	}

	const buttonColor = theme.getColor(welcomePageTileBackground);
	if (buttonColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button { background: ${buttonColor}; }`);
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

	const pendingItemColor = theme.getColor(buttonSecondaryBackground);
	if (pendingItemColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon { color: ${pendingItemColor} } `);
	}

	const emphasisButtonHoverBackground = theme.getColor(buttonHoverBackground);
	if (emphasisButtonHoverBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button.emphasis:hover { background: ${emphasisButtonHoverBackground}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .button-link { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer .button-link * { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a:hover,
			.monaco-workbench .part.editor > .content .gettingStartedContainer a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer a:focus { outline-color: ${focusColor}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .gettingStartedContainer button { border-color: ${border}; border: 1px solid; }`);
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
