/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./gettingStarted';
import 'vs/workbench/contrib/welcome/gettingStarted/browser/vs_code_editor_getting_started';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WalkThroughInput, WalkThroughInputOptions } from 'vs/workbench/contrib/welcome/walkThrough/browser/walkThroughInput';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IEditorInputFactory } from 'vs/workbench/common/editor';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { assertIsDefined } from 'vs/base/common/types';
import { $, addDisposableListener } from 'vs/base/browser/dom';
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
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';

export const gettingStartedInputTypeId = 'workbench.editors.gettingStartedInput';
const telemetryFrom = 'gettingStartedPage';

export class GettingStartedInput extends WalkThroughInput {
	static readonly ID = gettingStartedInputTypeId;

	constructor(
		options: WalkThroughInputOptions & { selectedCategory?: string, selectedTask?: string },
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(options, textModelResolverService);
		this.selectedCategory = options.selectedCategory;
		this.selectedTask = options.selectedTask;
	}

	selectedCategory: string | undefined;
	selectedTask: string | undefined;
}

export function getGettingStartedInput(accessor: ServicesAccessor, options: { selectedCategory?: string, selectedTask?: string }) {
	const resource = FileAccess.asBrowserUri('./vs_code_editor_getting_started.md', require)
		.with({
			scheme: Schemas.walkThrough,
			query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcome/gettingStarted/browser/vs_code_editor_getting_started' })
		});

	const instantiationService = accessor.get(IInstantiationService);

	const pages: GettingStartedPage[] = [];

	const editorInput = instantiationService.createInstance(GettingStartedInput, {
		typeId: gettingStartedInputTypeId,
		name: localize('editorGettingStarted.title', "Getting Started"),
		resource,
		telemetryFrom,
		selectedCategory: options.selectedCategory,
		selectedTask: options.selectedTask,
		onReady: (container: HTMLElement, disposableStore: DisposableStore) => {
			const page = instantiationService.createInstance(GettingStartedPage, editorInput);
			page.onReady(container);
			pages.push(page);
			disposableStore.add(page);
		},
		layout: () => pages.forEach(page => page.layout()),
	});

	return editorInput;
}

export class GettingStartedPage extends Disposable {
	readonly editorInput: GettingStartedInput;
	private inProgressScroll = Promise.resolve();

	private dispatchListeners: DisposableStore = new DisposableStore();
	private taskDisposables: DisposableStore = new DisposableStore();

	private gettingStartedCategories: IGettingStartedCategoryWithProgress[];
	private currentCategory: IGettingStartedCategoryWithProgress | undefined;

	private categoriesScrollbar: DomScrollableElement | undefined;
	private detailsScrollbar: DomScrollableElement | undefined;
	private detailImageScrollbar: DomScrollableElement | undefined;

	constructor(
		editorInput: GettingStartedInput,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IGettingStartedService private readonly gettingStartedService: IGettingStartedService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();

		this.editorInput = editorInput;

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

	private registerDispatchListeners(container: HTMLElement) {
		this.dispatchListeners.clear();

		container.querySelectorAll('[x-dispatch]').forEach(element => {
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
							this.scrollPrev(container);
							break;
						}
						case 'skip': {
							this.commandService.executeCommand('workbench.action.closeActiveEditor');
							break;
						}
						case 'selectCategory': {
							const selectedCategory = this.gettingStartedCategories.find(category => category.id === argument);
							if (!selectedCategory) { throw Error('Could not find category with ID ' + argument); }
							if (selectedCategory.content.type === 'command') {
								this.commandService.executeCommand(selectedCategory.content.command);
							} else {
								this.scrollToCategory(container, argument);
							}
							break;
						}
						case 'selectTask': {
							this.selectTask(container, argument);
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

	private selectTask(container: HTMLElement, id: string | undefined, contractIfAlreadySelected = true) {
		const mediaElement = assertIsDefined(container.querySelector('.getting-started-media') as HTMLImageElement);
		this.taskDisposables.clear();
		if (id) {
			const taskElement = assertIsDefined(container.querySelector(`[data-task-id="${id}"]`));
			taskElement.parentElement?.querySelectorAll('.expanded').forEach(node => node.classList.remove('expanded'));
			(taskElement as HTMLDivElement).focus();
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
		} else {
			this.editorInput.selectedTask = undefined;
			mediaElement.setAttribute('src', '');
			mediaElement.setAttribute('alt', '');
		}
		this.detailsScrollbar?.scanDomNode();
		this.detailImageScrollbar?.scanDomNode();
	}

	private updateMediaSourceForColorMode(element: HTMLImageElement, sources: { hc: URI, dark: URI, light: URI }) {
		const themeType = this.themeService.getColorTheme().type;
		element.src = sources[themeType].toString();
	}

	onReady(container: HTMLElement) {
		const categoryElements = this.gettingStartedCategories.map(
			category => {
				const categoryDescriptionElement =
					category.content.type === 'items' ?
						$('.category-description-container', {},
							$('h3.category-title', {}, category.title),
							$('.category-description.description', {}, category.description),
							$('.category-progress', { 'x-data-category-id': category.id, },
								$('.message'),
								$('.progress-bar-outer', {},
									$('.progress-bar-inner'))))
						:
						$('.category-description-container', {},
							$('h3.category-title', {}, category.title),
							$('.category-description.description', {}, category.description));

				return $('button.getting-started-category',
					{ 'x-dispatch': 'selectCategory:' + category.id },
					$(ThemeIcon.asCSSSelector(category.icon), {}), categoryDescriptionElement);
			});

		const categoriesSlide = assertIsDefined(container.querySelector('.gettingStartedSlideCategory'));
		const tasksSlide = assertIsDefined(container.querySelector('.gettingStartedSlideDetails'));

		const tasksContent = assertIsDefined(container.querySelector('.gettingStartedDetailsContent') as HTMLElement);
		tasksContent.remove();
		if (this.detailImageScrollbar) { this.detailImageScrollbar.dispose(); }
		this.detailImageScrollbar = this._register(new DomScrollableElement(tasksContent, { className: 'full-height-scrollable' }));
		tasksSlide.appendChild(this.detailImageScrollbar.getDomNode());
		this.detailImageScrollbar.scanDomNode();

		const rightColumn = assertIsDefined(container.querySelector('.getting-started-detail-right'));
		rightColumn.appendChild($('img.getting-started-media'));

		const categoryScrollContainer = $('.getting-started-categories-scrolling-container');
		const categoriesContainer = $('.getting-started-categories-container');
		categoryElements.forEach(element => {
			categoriesContainer.appendChild(element);
		});

		categoryScrollContainer.appendChild(categoriesContainer);
		categoryScrollContainer.appendChild($('.footer', {}, $('button.skip.button-link', { 'x-dispatch': 'skip' }, localize('gettingStarted.skip', "Skip"))));

		if (this.categoriesScrollbar) { this.categoriesScrollbar.dispose(); }
		this.categoriesScrollbar = this._register(new DomScrollableElement(categoryScrollContainer, {}));
		categoriesSlide.appendChild(this.categoriesScrollbar.getDomNode());
		categoriesSlide.appendChild($('.gap'));
		this.categoriesScrollbar.scanDomNode();

		this.updateCategoryProgress();

		assertIsDefined(container.querySelector('.product-name')).textContent = this.productService.nameLong;
		this.registerDispatchListeners(container);


		if (this.editorInput.selectedCategory) {
			this.currentCategory = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);
			if (!this.currentCategory) {
				throw Error('Could not restore to category ' + this.editorInput.selectedCategory + ' as it was not found');
			}
			this.buildCategorySlide(container, this.editorInput.selectedCategory, this.editorInput.selectedTask);
			categoriesSlide.classList.add('prev');
			this.setButtonEnablement(container, 'details');
		} else {
			tasksSlide.classList.add('next');
			this.focusFirstUncompletedCategory(container);
			this.setButtonEnablement(container, 'categories');
		}
		setTimeout(() => assertIsDefined(container.querySelector('.gettingStartedContainer')).classList.add('animationReady'), 0);
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
			bar.style.width = `${(numDone / numTotal) * 100}%`;

			if (numTotal === numDone) {
				message.textContent = `All items complete!`;
			}
			else {
				message.textContent = `${numDone} of ${numTotal} items complete`;
			}
		});
	}

	private async scrollToCategory(container: HTMLElement, categoryID: string) {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.clearDetialView(container);
			this.editorInput.selectedCategory = categoryID;
			this.currentCategory = this.gettingStartedCategories.find(category => category.id === categoryID);
			const slides = [...container.querySelectorAll('.gettingStartedSlide').values()];
			const currentSlide = slides.findIndex(element => !element.classList.contains('prev') && !element.classList.contains('next'));
			if (currentSlide < slides.length - 1) {
				this.buildCategorySlide(container, categoryID);
				slides[currentSlide].classList.add('prev');
				slides[currentSlide + 1].classList.remove('next');
				this.setButtonEnablement(container, 'details');
			}
		});
	}

	private buildCategorySlide(container: HTMLElement, categoryID: string, selectedItem?: string) {
		const category = this.gettingStartedCategories.find(category => category.id === categoryID);
		if (!category) { throw Error('could not find category with ID ' + categoryID); }
		if (category.content.type !== 'items') { throw Error('category with ID ' + categoryID + ' is not of items type'); }

		const leftColumn = assertIsDefined(container.querySelector('.getting-started-detail-left'));
		const detailTitle = assertIsDefined(container.querySelector('.getting-started-detail-title'));
		detailTitle.appendChild(
			$('.getting-started-category',
				{},
				$(ThemeIcon.asCSSSelector(category.icon), {}),
				$('.category-description-container', {},
					$('h2.category-title', {}, category.title),
					$('.category-description.description', {}, category.description))));

		const categoryElements = category.content.items.map(
			(task, i, arr) => $('button.getting-started-task',
				{ 'x-dispatch': 'selectTask:' + task.id, 'data-task-id': task.id },
				$('.codicon' + (task.done ? '.complete.codicon-pass-filled' : '.codicon-circle-large-outline'), { 'data-done-task-id': task.id }),
				$('.task-description-container', {},
					$('h3.task-title', {}, task.title),
					$('.task-description.description', {}, task.description),
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

		const detailContainer = $('.getting-started-detail-container');
		if (this.detailsScrollbar) { this.detailsScrollbar.getDomNode().remove(); this.detailsScrollbar.dispose(); }
		this.detailsScrollbar = this._register(new DomScrollableElement(detailContainer, { className: 'full-height-scrollable' }));
		categoryElements.forEach(element => detailContainer.appendChild(element));
		leftColumn.appendChild(this.detailsScrollbar.getDomNode());

		const toExpand = category.content.items.find(item => !item.done) ?? category.content.items[0];
		this.selectTask(container, selectedItem ?? toExpand.id, false);
		this.detailsScrollbar.scanDomNode();
		this.registerDispatchListeners(container);
	}

	private clearDetialView(container: HTMLElement) {
		const detailContainer = (container.querySelector('.getting-started-detail-container'));
		detailContainer?.remove();
		const detailTitle = assertIsDefined(container.querySelector('.getting-started-detail-title'));
		while (detailTitle.firstChild) { detailTitle.removeChild(detailTitle.firstChild); }
	}

	private getKeybindingLabel(command: string) {
		const binding = this.keybindingService.lookupKeybinding(command);
		if (!binding) { return ''; }
		else { return ` (${binding.getLabel()})`; }
	}

	private async scrollPrev(container: HTMLElement) {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.currentCategory = undefined;
			this.editorInput.selectedCategory = undefined;
			this.editorInput.selectedTask = undefined;
			this.selectTask(container, undefined);
			const slides = [...container.querySelectorAll('.gettingStartedSlide').values()];
			const currentSlide = slides.findIndex(element =>
				!element.classList.contains('prev') && !element.classList.contains('next'));
			if (currentSlide > 0) {
				slides[currentSlide].classList.add('next');
				assertIsDefined(slides[currentSlide - 1]).classList.remove('prev');
				this.setButtonEnablement(container, 'categories');
			}
			this.focusFirstUncompletedCategory(container);
		});
	}

	private focusFirstUncompletedCategory(container: HTMLElement) {
		let toFocus!: HTMLElement;
		container.querySelectorAll('.category-progress').forEach(progress => {
			const progressAmount = assertIsDefined(progress.querySelector('.progress-bar-inner') as HTMLDivElement).style.width;
			if (!toFocus && progressAmount !== '100%') { toFocus = assertIsDefined(progress.parentElement?.parentElement); }
		});
		(toFocus ?? assertIsDefined(container.querySelector('button.skip')) as HTMLButtonElement).focus();
	}

	private setButtonEnablement(container: HTMLElement, toEnable: 'details' | 'categories') {
		if (toEnable === 'categories') {
			container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = true);
			container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = false);
		} else {
			container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = false);
			container.querySelector('.gettingStartedSlideCategory')!.querySelectorAll('button').forEach(button => button.disabled = true);
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
			return instantiationService.invokeFunction(getGettingStartedInput, { selectedCategory, selectedTask });
		} catch { }
		return instantiationService.invokeFunction(getGettingStartedInput, {});
	}
}

registerThemingParticipant((theme, collector) => {

	const backgroundColor = theme.getColor(welcomePageBackground);
	if (backgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer { background-color: ${backgroundColor}; }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer { color: ${foregroundColor}; }`);
	}

	const descriptionColor = theme.getColor(descriptionForeground);
	if (descriptionColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .description { color: ${descriptionColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .category-progress .message { color: ${descriptionColor}; }`);
	}

	const iconColor = theme.getColor(textLinkForeground);
	if (iconColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .getting-started-category .codicon { color: ${iconColor} }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon.complete { color: ${iconColor} } `);
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task.expanded .codicon { color: ${iconColor} } `);
	}

	const buttonColor = theme.getColor(welcomePageTileBackground);
	if (buttonColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button { background: ${buttonColor}; }`);
	}

	const buttonHoverColor = theme.getColor(welcomePageTileHoverBackground);
	if (buttonHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button:hover { background: ${buttonHoverColor}; }`);
	}
	if (buttonColor && buttonHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button.expanded:hover { background: ${buttonColor}; }`);
	}

	const emphasisButtonForeground = theme.getColor(buttonForeground);
	if (emphasisButtonForeground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button.emphasis { color: ${emphasisButtonForeground}; }`);
	}

	const emphasisButtonBackground = theme.getColor(buttonBackground);
	if (emphasisButtonBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button.emphasis { background: ${emphasisButtonBackground}; }`);
	}

	const pendingItemColor = theme.getColor(buttonSecondaryBackground);
	if (pendingItemColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .gettingStartedSlide.detail .getting-started-task .codicon { color: ${pendingItemColor} } `);
	}

	const emphasisButtonHoverBackground = theme.getColor(buttonHoverBackground);
	if (emphasisButtonHoverBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button.emphasis:hover { background: ${emphasisButtonHoverBackground}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer a { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .button-link { color: ${link}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .button-link * { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer a:hover,
			.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer a:focus { outline-color: ${focusColor}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button { border-color: ${border}; border: 1px solid; }`);
	}
	const activeBorder = theme.getColor(activeContrastBorder);
	if (activeBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer button:hover { outline-color: ${activeBorder}; }`);
	}

	const progressBackground = theme.getColor(welcomePageProgressBackground);
	if (progressBackground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .gettingStartedSlide.categories .progress-bar-outer { background-color: ${progressBackground}; }`);
	}
	const progressForeground = theme.getColor(welcomePageProgressForeground);
	if (progressForeground) {
		collector.addRule(`.monaco-workbench .part.editor > .content .walkThroughContent .gettingStartedContainer .gettingStartedSlide.categories .progress-bar-inner { background-color: ${progressForeground}; }`);
	}
});
