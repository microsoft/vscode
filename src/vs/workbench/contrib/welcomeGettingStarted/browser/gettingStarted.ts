/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, clearNode, reset } from 'vs/base/browser/dom';
import { renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Button } from 'vs/base/browser/ui/button/button';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { coalesce, equals } from 'vs/base/common/arrays';
import { Delayer, Throttler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode } from 'vs/base/common/keyCodes';
import { splitRecentLabel } from 'vs/base/common/labels';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { ILink, LinkedText } from 'vs/base/common/linkedText';
import { parse } from 'vs/base/common/marshalling';
import { Schemas, matchesScheme } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import { assertIsDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import 'vs/css!./media/gettingStarted';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService, Verbosity } from 'vs/platform/label/common/label';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Link } from 'vs/platform/opener/browser/link';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ITelemetryService, TelemetryLevel, firstSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';
import { defaultButtonStyles, defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IWindowOpenable } from 'vs/platform/window/common/window';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from 'vs/platform/workspace/common/workspace';
import { IRecentFolder, IRecentWorkspace, IRecentlyOpened, IWorkspacesService, isRecentFolder, isRecentWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { OpenRecentAction } from 'vs/workbench/browser/actions/windowActions';
import { OpenFileFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from 'vs/workbench/browser/actions/workspaceActions';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { WorkbenchStateContext } from 'vs/workbench/common/contextkeys';
import { IEditorOpenContext, IEditorSerializer } from 'vs/workbench/common/editor';
import { IWebviewElement, IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedColors';
import { GettingStartedDetailsRenderer } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer';
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedIcons';
import { GettingStartedInput } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedInput';
import { IResolvedWalkthrough, IResolvedWalkthroughStep, IWalkthroughsService, hiddenEntriesConfigurationKey, parseDescription } from 'vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService';
import { RestoreWalkthroughsConfigurationValue, restoreWalkthroughsConfigurationKey } from 'vs/workbench/contrib/welcomeGettingStarted/browser/startupPage';
import { startEntries } from 'vs/workbench/contrib/welcomeGettingStarted/common/gettingStartedContent';
import { GroupDirection, GroupsOrder, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { GettingStartedIndexList } from './gettingStartedList';

const SLIDE_TRANSITION_TIME_MS = 250;
const configurationKey = 'workbench.startupEditor';

export const allWalkthroughsHiddenContext = new RawContextKey<boolean>('allWalkthroughsHidden', false);
export const inWelcomeContext = new RawContextKey<boolean>('inWelcome', false);

export interface IWelcomePageStartEntry {
	id: string;
	title: string;
	description: string;
	command: string;
	order: number;
	icon: { type: 'icon'; icon: ThemeIcon };
	when: ContextKeyExpression;
}

const parsedStartEntries: IWelcomePageStartEntry[] = startEntries.map((e, i) => ({
	command: e.content.command,
	description: e.description,
	icon: { type: 'icon', icon: e.icon },
	id: e.id,
	order: i,
	title: e.title,
	when: ContextKeyExpr.deserialize(e.when) ?? ContextKeyExpr.true()
}));

type GettingStartedActionClassification = {
	command: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The command being executed on the getting started page.' };
	walkthroughId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The walkthrough which the command is in' };
	argument: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The arguments being passed to the command' };
	owner: 'lramos15';
	comment: 'Help understand what actions are most commonly taken on the getting started page';
};

type GettingStartedActionEvent = {
	command: string;
	walkthroughId: string | undefined;
	argument: string | undefined;
};

type RecentEntry = (IRecentFolder | IRecentWorkspace) & { id: string };

const REDUCED_MOTION_KEY = 'workbench.welcomePage.preferReducedMotion';
export class GettingStartedPage extends EditorPane {

	public static readonly ID = 'gettingStartedPage';

	private editorInput!: GettingStartedInput;
	private inProgressScroll = Promise.resolve();

	private readonly dispatchListeners: DisposableStore = new DisposableStore();
	private readonly stepDisposables: DisposableStore = new DisposableStore();
	private readonly detailsPageDisposables: DisposableStore = new DisposableStore();
	private readonly mediaDisposables: DisposableStore = new DisposableStore();

	// Ensure that the these are initialized before use.
	// Currently initialized before use in buildCategoriesSlide and scrollToCategory
	private recentlyOpened!: Promise<IRecentlyOpened>;
	private gettingStartedCategories!: IResolvedWalkthrough[];

	private currentWalkthrough: IResolvedWalkthrough | undefined;

	private categoriesPageScrollbar: DomScrollableElement | undefined;
	private detailsPageScrollbar: DomScrollableElement | undefined;

	private detailsScrollbar: DomScrollableElement | undefined;

	private buildSlideThrottle: Throttler = new Throttler();

	private container: HTMLElement;

	private contextService: IContextKeyService;

	private hasScrolledToFirstCategory = false;
	private recentlyOpenedList?: GettingStartedIndexList<RecentEntry>;
	private startList?: GettingStartedIndexList<IWelcomePageStartEntry>;
	private gettingStartedList?: GettingStartedIndexList<IResolvedWalkthrough>;

	private stepsSlide!: HTMLElement;
	private categoriesSlide!: HTMLElement;
	private stepsContent!: HTMLElement;
	private stepMediaComponent!: HTMLElement;
	private webview!: IWebviewElement;

	private layoutMarkdown: (() => void) | undefined;

	private detailsRenderer: GettingStartedDetailsRenderer;

	private readonly categoriesSlideDisposables: DisposableStore;
	private showFeaturedWalkthrough = true;

	constructor(
		group: IEditorGroup,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IWalkthroughsService private readonly gettingStartedService: IWalkthroughsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWorkbenchThemeService protected override readonly themeService: IWorkbenchThemeService,
		@IStorageService private storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorGroupsService private readonly groupsService: IEditorGroupsService,
		@IContextKeyService contextService: IContextKeyService,
		@IQuickInputService private quickInputService: IQuickInputService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {

		super(GettingStartedPage.ID, group, telemetryService, themeService, storageService);

		this.container = $('.gettingStartedContainer',
			{
				role: 'document',
				tabindex: 0,
				'aria-label': localize('welcomeAriaLabel', "Overview of how to get up to speed with your editor.")
			});
		this.stepMediaComponent = $('.getting-started-media');
		this.stepMediaComponent.id = generateUuid();

		this.categoriesSlideDisposables = this._register(new DisposableStore());

		this.detailsRenderer = new GettingStartedDetailsRenderer(this.fileService, this.notificationService, this.extensionService, this.languageService);

		this.contextService = this._register(contextService.createScoped(this.container));
		inWelcomeContext.bindTo(this.contextService).set(true);

		this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();

		this._register(this.dispatchListeners);
		this.buildSlideThrottle = new Throttler();

		const rerender = () => {
			this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
			if (this.currentWalkthrough) {
				const existingSteps = this.currentWalkthrough.steps.map(step => step.id);
				const newCategory = this.gettingStartedCategories.find(category => this.currentWalkthrough?.id === category.id);
				if (newCategory) {
					const newSteps = newCategory.steps.map(step => step.id);
					if (!equals(newSteps, existingSteps)) {
						this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
					}
				}
			} else {
				this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
			}
		};

		this._register(this.gettingStartedService.onDidAddWalkthrough(rerender));
		this._register(this.gettingStartedService.onDidRemoveWalkthrough(rerender));

		this.recentlyOpened = this.workspacesService.getRecentlyOpened();
		this._register(workspacesService.onDidChangeRecentlyOpened(() => {
			this.recentlyOpened = workspacesService.getRecentlyOpened();
			rerender();
		}));

		this._register(this.gettingStartedService.onDidChangeWalkthrough(category => {
			const ourCategory = this.gettingStartedCategories.find(c => c.id === category.id);
			if (!ourCategory) { return; }

			ourCategory.title = category.title;
			ourCategory.description = category.description;

			this.container.querySelectorAll<HTMLDivElement>(`[x-category-title-for="${category.id}"]`).forEach(step => (step as HTMLDivElement).innerText = ourCategory.title);
			this.container.querySelectorAll<HTMLDivElement>(`[x-category-description-for="${category.id}"]`).forEach(step => (step as HTMLDivElement).innerText = ourCategory.description);
		}));

		this._register(this.gettingStartedService.onDidProgressStep(step => {
			const category = this.gettingStartedCategories.find(category => category.id === step.category);
			if (!category) { throw Error('Could not find category with ID: ' + step.category); }
			const ourStep = category.steps.find(_step => _step.id === step.id);
			if (!ourStep) {
				throw Error('Could not find step with ID: ' + step.id);
			}

			const stats = this.getWalkthroughCompletionStats(category);
			if (!ourStep.done && stats.stepsComplete === stats.stepsTotal - 1) {
				this.hideCategory(category.id);
			}

			this._register(this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(REDUCED_MOTION_KEY)) {
					this.container.classList.toggle('animatable', this.shouldAnimate());
				}
			}));
			ourStep.done = step.done;

			if (category.id === this.currentWalkthrough?.id) {
				const badgeelements = assertIsDefined(this.window.document.querySelectorAll(`[data-done-step-id="${step.id}"]`));
				badgeelements.forEach(badgeelement => {
					if (step.done) {
						badgeelement.setAttribute('aria-checked', 'true');
						badgeelement.parentElement?.setAttribute('aria-checked', 'true');
						badgeelement.classList.remove(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
						badgeelement.classList.add('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
					}
					else {
						badgeelement.setAttribute('aria-checked', 'false');
						badgeelement.parentElement?.setAttribute('aria-checked', 'false');
						badgeelement.classList.remove('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
						badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
					}
				});
			}
			this.updateCategoryProgress();
		}));

		this._register(this.storageService.onWillSaveState((e) => {
			if (e.reason !== WillSaveStateReason.SHUTDOWN) {
				return;
			}

			if (this.workspaceContextService.getWorkspace().folders.length !== 0) {
				return;
			}

			if (!this.editorInput || !this.currentWalkthrough || !this.editorInput.selectedCategory || !this.editorInput.selectedStep) {
				return;
			}

			// Save the state of the walkthrough so we can restore it on reload
			const restoreData: RestoreWalkthroughsConfigurationValue = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput.selectedCategory, step: this.editorInput.selectedStep };
			this.storageService.store(
				restoreWalkthroughsConfigurationKey,
				JSON.stringify(restoreData),
				StorageScope.PROFILE, StorageTarget.MACHINE);
		}));
	}

	// remove when 'workbench.welcomePage.preferReducedMotion' deprecated
	private shouldAnimate() {
		if (this.configurationService.getValue(REDUCED_MOTION_KEY)) {
			return false;
		}
		if (this.accessibilityService.isMotionReduced()) {
			return false;
		}
		return true;
	}

	private getWalkthroughCompletionStats(walkthrough: IResolvedWalkthrough): { stepsComplete: number; stepsTotal: number } {
		const activeSteps = walkthrough.steps.filter(s => this.contextService.contextMatchesRules(s.when));
		return {
			stepsComplete: activeSteps.filter(s => s.done).length,
			stepsTotal: activeSteps.length,
		};
	}

	override async setInput(newInput: GettingStartedInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		this.container.classList.remove('animatable');
		this.editorInput = newInput;
		await super.setInput(newInput, options, context, token);
		await this.buildCategoriesSlide();
		if (this.shouldAnimate()) {
			setTimeout(() => this.container.classList.add('animatable'), 0);
		}
	}

	async makeCategoryVisibleWhenAvailable(categoryID: string, stepId?: string) {
		this.scrollToCategory(categoryID, stepId);
	}

	private registerDispatchListeners() {
		this.dispatchListeners.clear();

		this.container.querySelectorAll('[x-dispatch]').forEach(element => {
			const dispatch = element.getAttribute('x-dispatch') ?? '';
			let command, argument;
			if (dispatch.startsWith('openLink:https')) {
				[command, argument] = ['openLink', dispatch.replace('openLink:', '')];
			} else {
				[command, argument] = dispatch.split(':');
			}
			if (command) {
				this.dispatchListeners.add(addDisposableListener(element, 'click', (e) => {
					e.stopPropagation();
					this.runDispatchCommand(command, argument);
				}));
				this.dispatchListeners.add(addDisposableListener(element, 'keyup', (e) => {
					const keyboardEvent = new StandardKeyboardEvent(e);
					e.stopPropagation();
					switch (keyboardEvent.keyCode) {
						case KeyCode.Enter:
						case KeyCode.Space:
							this.runDispatchCommand(command, argument);
							return;
					}
				}));
			}
		});
	}

	private async runDispatchCommand(command: string, argument: string) {
		this.commandService.executeCommand('workbench.action.keepEditor');
		this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command, argument, walkthroughId: this.currentWalkthrough?.id });
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
				this.commandService.executeCommand(OpenRecentAction.ID);
				break;
			}
			case 'seeAllWalkthroughs': {
				await this.openWalkthroughSelector();
				break;
			}
			case 'openFolder': {
				if (this.contextService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('workspace')))) {
					this.commandService.executeCommand(OpenFolderViaWorkspaceAction.ID);
				} else {
					this.commandService.executeCommand(isMacintosh ? 'workbench.action.files.openFileFolder' : 'workbench.action.files.openFolder');
				}
				break;
			}
			case 'selectCategory': {
				this.scrollToCategory(argument);
				this.gettingStartedService.markWalkthroughOpened(argument);
				break;
			}
			case 'selectStartEntry': {
				const selected = startEntries.find(e => e.id === argument);
				if (selected) {
					this.runStepCommand(selected.content.command);
				} else {
					throw Error('could not find start entry with id: ' + argument);
				}
				break;
			}
			case 'hideCategory': {
				this.hideCategory(argument);
				break;
			}
			// Use selectTask over selectStep to keep telemetry consistant:https://github.com/microsoft/vscode/issues/122256
			case 'selectTask': {
				this.selectStep(argument);
				break;
			}
			case 'toggleStepCompletion': {
				this.toggleStepCompletion(argument);
				break;
			}
			case 'allDone': {
				this.markAllStepsComplete();
				break;
			}
			case 'nextSection': {
				const next = this.currentWalkthrough?.next;
				if (next) {
					this.scrollToCategory(next);
				} else {
					console.error('Error scrolling to next section of', this.currentWalkthrough);
				}
				break;
			}
			case 'openLink': {
				this.openerService.open(argument);
				break;
			}
			default: {
				console.error('Dispatch to', command, argument, 'not defined');
				break;
			}
		}
	}

	private hideCategory(categoryId: string) {
		const selectedCategory = this.gettingStartedCategories.find(category => category.id === categoryId);
		if (!selectedCategory) { throw Error('Could not find category with ID ' + categoryId); }
		this.setHiddenCategories([...this.getHiddenCategories().add(categoryId)]);
		this.gettingStartedList?.rerender();
	}

	private markAllStepsComplete() {
		if (this.currentWalkthrough) {
			this.currentWalkthrough?.steps.forEach(step => {
				if (!step.done) {
					this.gettingStartedService.progressStep(step.id);
				}
			});
			this.hideCategory(this.currentWalkthrough?.id);
			this.scrollPrev();
		} else {
			throw Error('No walkthrough opened');
		}
	}

	private toggleStepCompletion(argument: string) {
		const stepToggle = assertIsDefined(this.currentWalkthrough?.steps.find(step => step.id === argument));
		if (stepToggle.done) {
			this.gettingStartedService.deprogressStep(argument);
		} else {
			this.gettingStartedService.progressStep(argument);
		}
	}

	private async openWalkthroughSelector() {
		const selection = await this.quickInputService.pick(this.gettingStartedCategories
			.filter(c => this.contextService.contextMatchesRules(c.when))
			.map(x => ({
				id: x.id,
				label: x.title,
				detail: x.description,
				description: x.source,
			})), { canPickMany: false, matchOnDescription: true, matchOnDetail: true, title: localize('pickWalkthroughs', "Open Walkthrough...") });
		if (selection) {
			this.runDispatchCommand('selectCategory', selection.id);
		}
	}

	private getHiddenCategories(): Set<string> {
		return new Set(JSON.parse(this.storageService.get(hiddenEntriesConfigurationKey, StorageScope.PROFILE, '[]')));
	}

	private setHiddenCategories(hidden: string[]) {
		this.storageService.store(
			hiddenEntriesConfigurationKey,
			JSON.stringify(hidden),
			StorageScope.PROFILE,
			StorageTarget.USER);
	}

	private currentMediaComponent: string | undefined = undefined;
	private currentMediaType: string | undefined = undefined;
	private async buildMediaComponent(stepId: string, forceRebuild: boolean = false) {
		if (!this.currentWalkthrough) {
			throw Error('no walkthrough selected');
		}
		const stepToExpand = assertIsDefined(this.currentWalkthrough.steps.find(step => step.id === stepId));

		if (!forceRebuild && this.currentMediaComponent === stepId) { return; }
		this.currentMediaComponent = stepId;

		this.stepDisposables.clear();

		this.stepDisposables.add({
			dispose: () => {
				this.currentMediaComponent = undefined;
			}
		});

		if (this.currentMediaType !== stepToExpand.media.type) {

			this.currentMediaType = stepToExpand.media.type;

			this.mediaDisposables.add(toDisposable(() => {
				this.currentMediaType = undefined;
			}));

			clearNode(this.stepMediaComponent);

			if (stepToExpand.media.type === 'svg') {
				this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ title: undefined, options: { disableServiceWorker: true }, contentOptions: {}, extension: undefined }));
				this.webview.mountTo(this.stepMediaComponent, this.window);
			} else if (stepToExpand.media.type === 'markdown') {
				this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: '', extension: undefined }));
				this.webview.mountTo(this.stepMediaComponent, this.window);
			}
		}

		if (stepToExpand.media.type === 'image') {

			this.stepsContent.classList.add('image');
			this.stepsContent.classList.remove('markdown');

			const media = stepToExpand.media;
			const mediaElement = $<HTMLImageElement>('img');
			clearNode(this.stepMediaComponent);
			this.stepMediaComponent.appendChild(mediaElement);
			mediaElement.setAttribute('alt', media.altText);
			this.updateMediaSourceForColorMode(mediaElement, media.path);

			this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, 'click', () => {
				const hrefs = stepToExpand.description.map(lt => lt.nodes.filter((node): node is ILink => typeof node !== 'string').map(node => node.href)).flat();
				if (hrefs.length === 1) {
					const href = hrefs[0];
					if (href.startsWith('http')) {
						this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'runStepAction', argument: href, walkthroughId: this.currentWalkthrough?.id });
						this.openerService.open(href);
					}
				}
			}));

			this.stepDisposables.add(this.themeService.onDidColorThemeChange(() => this.updateMediaSourceForColorMode(mediaElement, media.path)));

		}
		else if (stepToExpand.media.type === 'svg') {
			this.stepsContent.classList.add('image');
			this.stepsContent.classList.remove('markdown');

			const media = stepToExpand.media;
			this.webview.setHtml(await this.detailsRenderer.renderSVG(media.path));

			let isDisposed = false;
			this.stepDisposables.add(toDisposable(() => { isDisposed = true; }));

			this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
				// Render again since color vars change
				const body = await this.detailsRenderer.renderSVG(media.path);
				if (!isDisposed) { // Make sure we weren't disposed of in the meantime
					this.webview.setHtml(body);
				}
			}));

			this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, 'click', () => {
				const hrefs = stepToExpand.description.map(lt => lt.nodes.filter((node): node is ILink => typeof node !== 'string').map(node => node.href)).flat();
				if (hrefs.length === 1) {
					const href = hrefs[0];
					if (href.startsWith('http')) {
						this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'runStepAction', argument: href, walkthroughId: this.currentWalkthrough?.id });
						this.openerService.open(href);
					}
				}
			}));

			this.stepDisposables.add(this.webview.onDidClickLink(link => {
				if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || (matchesScheme(link, Schemas.command))) {
					this.openerService.open(link, { allowCommands: true });
				}
			}));

		}
		else if (stepToExpand.media.type === 'markdown') {

			this.stepsContent.classList.remove('image');
			this.stepsContent.classList.add('markdown');

			const media = stepToExpand.media;

			const rawHTML = await this.detailsRenderer.renderMarkdown(media.path, media.base);
			this.webview.setHtml(rawHTML);

			const serializedContextKeyExprs = rawHTML.match(/checked-on=\"([^'][^"]*)\"/g)?.map(attr => attr.slice('checked-on="'.length, -1)
				.replace(/&#39;/g, '\'')
				.replace(/&amp;/g, '&'));

			const postTrueKeysMessage = () => {
				const enabledContextKeys = serializedContextKeyExprs?.filter(expr => this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(expr)));
				if (enabledContextKeys) {
					this.webview.postMessage({
						enabledContextKeys
					});
				}
			};

			if (serializedContextKeyExprs) {
				const contextKeyExprs = coalesce(serializedContextKeyExprs.map(expr => ContextKeyExpr.deserialize(expr)));
				const watchingKeys = new Set(contextKeyExprs.flatMap(expr => expr.keys()));

				this.stepDisposables.add(this.contextService.onDidChangeContext(e => {
					if (e.affectsSome(watchingKeys)) { postTrueKeysMessage(); }
				}));
			}

			let isDisposed = false;
			this.stepDisposables.add(toDisposable(() => { isDisposed = true; }));

			this.stepDisposables.add(this.webview.onDidClickLink(link => {
				if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || (matchesScheme(link, Schemas.command))) {
					const toSide = link.startsWith('command:toSide:');
					if (toSide) {
						link = link.replace('command:toSide:', 'command:');
						this.focusSideEditorGroup();
					}
					this.openerService.open(link, { allowCommands: true, openToSide: toSide });
				}
			}));

			if (rawHTML.indexOf('<code>') >= 0) {
				// Render again when Theme changes since syntax highlighting of code blocks may have changed
				this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
					const body = await this.detailsRenderer.renderMarkdown(media.path, media.base);
					if (!isDisposed) { // Make sure we weren't disposed of in the meantime
						this.webview.setHtml(body);
						postTrueKeysMessage();
					}
				}));
			}

			const layoutDelayer = new Delayer(50);

			this.layoutMarkdown = () => {
				layoutDelayer.trigger(() => {
					this.webview.postMessage({ layoutMeNow: true });
				});
			};

			this.stepDisposables.add(layoutDelayer);
			this.stepDisposables.add({ dispose: () => this.layoutMarkdown = undefined });

			postTrueKeysMessage();

			this.stepDisposables.add(this.webview.onMessage(async e => {
				const message: string = e.message as string;
				if (message.startsWith('command:')) {
					this.openerService.open(message, { allowCommands: true });
				} else if (message.startsWith('setTheme:')) {
					const themeId = message.slice('setTheme:'.length);
					const theme = (await this.themeService.getColorThemes()).find(theme => theme.settingsId === themeId);
					if (theme) {
						this.themeService.setColorTheme(theme.id, ConfigurationTarget.USER);
					}
				} else {
					console.error('Unexpected message', message);
				}
			}));
		}
	}

	async selectStepLoose(id: string) {
		// Allow passing in id with a category appended or with just the id of the step
		if (id.startsWith(`${this.editorInput.selectedCategory}#`)) {
			this.selectStep(id);
		} else {
			const toSelect = this.editorInput.selectedCategory + '#' + id;
			this.selectStep(toSelect);
		}
	}

	private async selectStep(id: string | undefined, delayFocus = true) {
		if (id) {
			let stepElement = this.container.querySelector<HTMLDivElement>(`[data-step-id="${id}"]`);
			if (!stepElement) {
				// Selected an element that is not in-context, just fallback to whatever.
				stepElement = this.container.querySelector<HTMLDivElement>(`[data-step-id]`);
				if (!stepElement) {
					// No steps around... just ignore.
					return;
				}
				id = assertIsDefined(stepElement.getAttribute('data-step-id'));
			}
			stepElement.parentElement?.querySelectorAll<HTMLElement>('.expanded').forEach(node => {
				if (node.getAttribute('data-step-id') !== id) {
					node.classList.remove('expanded');
					node.setAttribute('aria-expanded', 'false');
				}
			});
			setTimeout(() => (stepElement as HTMLElement).focus(), delayFocus && this.shouldAnimate() ? SLIDE_TRANSITION_TIME_MS : 0);

			this.editorInput.selectedStep = id;

			stepElement.classList.add('expanded');
			stepElement.setAttribute('aria-expanded', 'true');
			this.buildMediaComponent(id, true);
			this.gettingStartedService.progressByEvent('stepSelected:' + id);
		} else {
			this.editorInput.selectedStep = undefined;
		}

		this.detailsPageScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
	}

	private updateMediaSourceForColorMode(element: HTMLImageElement, sources: { hcDark: URI; hcLight: URI; dark: URI; light: URI }) {
		const themeType = this.themeService.getColorTheme().type;
		const src = sources[themeType].toString(true).replace(/ /g, '%20');
		element.srcset = src.toLowerCase().endsWith('.svg') ? src : (src + ' 1.5x');
	}

	protected createEditor(parent: HTMLElement) {
		if (this.detailsPageScrollbar) { this.detailsPageScrollbar.dispose(); }
		if (this.categoriesPageScrollbar) { this.categoriesPageScrollbar.dispose(); }

		this.categoriesSlide = $('.gettingStartedSlideCategories.gettingStartedSlide');

		const prevButton = $('button.prev-button.button-link', { 'x-dispatch': 'scrollPrev' }, $('span.scroll-button.codicon.codicon-chevron-left'), $('span.moreText', {}, localize('welcome', "Welcome")));
		this.stepsSlide = $('.gettingStartedSlideDetails.gettingStartedSlide', {}, prevButton);

		this.stepsContent = $('.gettingStartedDetailsContent', {});

		this.detailsPageScrollbar = this._register(new DomScrollableElement(this.stepsContent, { className: 'full-height-scrollable' }));
		this.categoriesPageScrollbar = this._register(new DomScrollableElement(this.categoriesSlide, { className: 'full-height-scrollable categoriesScrollbar' }));

		this.stepsSlide.appendChild(this.detailsPageScrollbar.getDomNode());

		const gettingStartedPage = $('.gettingStarted', {}, this.categoriesPageScrollbar.getDomNode(), this.stepsSlide);
		this.container.appendChild(gettingStartedPage);

		this.categoriesPageScrollbar.scanDomNode();
		this.detailsPageScrollbar.scanDomNode();

		parent.appendChild(this.container);
	}

	private async buildCategoriesSlide() {

		this.categoriesSlideDisposables.clear();
		const showOnStartupCheckbox = new Toggle({
			icon: Codicon.check,
			actionClassName: 'getting-started-checkbox',
			isChecked: this.configurationService.getValue(configurationKey) === 'welcomePage',
			title: localize('checkboxTitle', "When checked, this page will be shown on startup."),
			...defaultToggleStyles
		});
		showOnStartupCheckbox.domNode.id = 'showOnStartup';
		const showOnStartupLabel = $('label.caption', { for: 'showOnStartup' }, localize('welcomePage.showOnStartup', "Show welcome page on startup"));
		const onShowOnStartupChanged = () => {
			if (showOnStartupCheckbox.checked) {
				this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'showOnStartupChecked', argument: undefined, walkthroughId: this.currentWalkthrough?.id });
				this.configurationService.updateValue(configurationKey, 'welcomePage');
			} else {
				this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'showOnStartupUnchecked', argument: undefined, walkthroughId: this.currentWalkthrough?.id });
				this.configurationService.updateValue(configurationKey, 'none');
			}
		};
		this.categoriesSlideDisposables.add(showOnStartupCheckbox);
		this.categoriesSlideDisposables.add(showOnStartupCheckbox.onChange(() => {
			onShowOnStartupChanged();
		}));
		this.categoriesSlideDisposables.add(addDisposableListener(showOnStartupLabel, 'click', () => {
			showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
			onShowOnStartupChanged();
		}));

		const header = $('.header', {},
			$('h1.product-name.caption', {}, this.productService.nameLong),
			$('p.subtitle.description', {}, localize({ key: 'gettingStarted.editingEvolved', comment: ['Shown as subtitle on the Welcome page.'] }, "Editing evolved"))
		);

		const leftColumn = $('.categories-column.categories-column-left', {},);
		const rightColumn = $('.categories-column.categories-column-right', {},);

		const startList = this.buildStartList();
		const recentList = this.buildRecentlyOpenedList();
		const gettingStartedList = this.buildGettingStartedWalkthroughsList();

		const footer = $('.footer', {},
			$('p.showOnStartup', {},
				showOnStartupCheckbox.domNode,
				showOnStartupLabel,
			));

		const layoutLists = () => {
			if (gettingStartedList.itemCount) {
				this.container.classList.remove('noWalkthroughs');
				reset(rightColumn, gettingStartedList.getDomElement());
			}
			else {
				this.container.classList.add('noWalkthroughs');
				reset(rightColumn);
			}
			setTimeout(() => this.categoriesPageScrollbar?.scanDomNode(), 50);
			layoutRecentList();
		};

		const layoutRecentList = () => {
			if (this.container.classList.contains('noWalkthroughs')) {
				recentList.setLimit(10);
				reset(leftColumn, startList.getDomElement());
				reset(rightColumn, recentList.getDomElement());
			} else {
				recentList.setLimit(5);
				reset(leftColumn, startList.getDomElement(), recentList.getDomElement());
			}
		};

		gettingStartedList.onDidChange(layoutLists);
		layoutLists();

		reset(this.categoriesSlide, $('.gettingStartedCategoriesContainer', {}, header, leftColumn, rightColumn, footer,));
		this.categoriesPageScrollbar?.scanDomNode();

		this.updateCategoryProgress();
		this.registerDispatchListeners();

		if (this.editorInput.selectedCategory) {
			this.currentWalkthrough = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);

			if (!this.currentWalkthrough) {
				this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
				this.currentWalkthrough = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);
				if (this.currentWalkthrough) {
					this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
					this.setSlide('details');
					return;
				}
			}
			else {
				this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
				this.setSlide('details');
				return;
			}
		}

		const someStepsComplete = this.gettingStartedCategories.some(category => category.steps.find(s => s.done));
		if (this.editorInput.showTelemetryNotice && this.productService.openToWelcomeMainPage) {
			const telemetryNotice = $('p.telemetry-notice');
			this.buildTelemetryFooter(telemetryNotice);
			footer.appendChild(telemetryNotice);
		} else if (!this.productService.openToWelcomeMainPage && !someStepsComplete && !this.hasScrolledToFirstCategory && this.showFeaturedWalkthrough) {
			const firstSessionDateString = this.storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION) || new Date().toUTCString();
			const daysSinceFirstSession = ((+new Date()) - (+new Date(firstSessionDateString))) / 1000 / 60 / 60 / 24;
			const fistContentBehaviour = daysSinceFirstSession < 1 ? 'openToFirstCategory' : 'index';

			if (fistContentBehaviour === 'openToFirstCategory') {
				const first = this.gettingStartedCategories.filter(c => !c.when || this.contextService.contextMatchesRules(c.when))[0];
				if (first) {
					this.hasScrolledToFirstCategory = true;
					this.currentWalkthrough = first;
					this.editorInput.selectedCategory = this.currentWalkthrough?.id;
					this.buildCategorySlide(this.editorInput.selectedCategory, undefined);
					this.setSlide('details');
					return;
				}
			}
		}

		this.setSlide('categories');
	}

	private buildRecentlyOpenedList(): GettingStartedIndexList<RecentEntry> {
		const renderRecent = (recent: RecentEntry) => {
			let fullPath: string;
			let windowOpenable: IWindowOpenable;
			if (isRecentFolder(recent)) {
				windowOpenable = { folderUri: recent.folderUri };
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: Verbosity.LONG });
			} else {
				fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
				windowOpenable = { workspaceUri: recent.workspace.configPath };
			}

			const { name, parentPath } = splitRecentLabel(fullPath);

			const li = $('li');
			const link = $('button.button-link');

			link.innerText = name;
			link.title = fullPath;
			link.setAttribute('aria-label', localize('welcomePage.openFolderWithPath', "Open folder {0} with path {1}", name, parentPath));
			link.addEventListener('click', e => {
				this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'openRecent', argument: undefined, walkthroughId: this.currentWalkthrough?.id });
				this.hostService.openWindow([windowOpenable], {
					forceNewWindow: e.ctrlKey || e.metaKey,
					remoteAuthority: recent.remoteAuthority || null // local window if remoteAuthority is not set or can not be deducted from the openable
				});
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

		if (this.recentlyOpenedList) { this.recentlyOpenedList.dispose(); }

		const recentlyOpenedList = this.recentlyOpenedList = new GettingStartedIndexList(
			{
				title: localize('recent', "Recent"),
				klass: 'recently-opened',
				limit: 5,
				empty: $('.empty-recent', {},
					localize('noRecents', "You have no recent folders,"),
					$('button.button-link', { 'x-dispatch': 'openFolder' }, localize('openFolder', "open a folder")),
					localize('toStart', "to start.")),

				more: $('.more', {},
					$('button.button-link',
						{
							'x-dispatch': 'showMoreRecents',
							title: localize('show more recents', "Show All Recent Folders {0}", this.getKeybindingLabel(OpenRecentAction.ID))
						}, localize('showAll', "More..."))),
				renderElement: renderRecent,
				contextService: this.contextService
			});

		recentlyOpenedList.onDidChange(() => this.registerDispatchListeners());
		this.recentlyOpened.then(({ workspaces }) => {
			// Filter out the current workspace
			const workspacesWithID = workspaces
				.filter(recent => !this.workspaceContextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri))
				.map(recent => ({ ...recent, id: isRecentWorkspace(recent) ? recent.workspace.id : recent.folderUri.toString() }));

			const updateEntries = () => {
				recentlyOpenedList.setEntries(workspacesWithID);
			};

			updateEntries();
			recentlyOpenedList.register(this.labelService.onDidChangeFormatters(() => updateEntries()));
		}).catch(onUnexpectedError);

		return recentlyOpenedList;
	}

	private buildStartList(): GettingStartedIndexList<IWelcomePageStartEntry> {
		const renderStartEntry = (entry: IWelcomePageStartEntry): HTMLElement =>
			$('li',
				{}, $('button.button-link',
					{
						'x-dispatch': 'selectStartEntry:' + entry.id,
						title: entry.description + ' ' + this.getKeybindingLabel(entry.command),
					},
					this.iconWidgetFor(entry),
					$('span', {}, entry.title)));

		if (this.startList) { this.startList.dispose(); }

		const startList = this.startList = new GettingStartedIndexList(
			{
				title: localize('start', "Start"),
				klass: 'start-container',
				limit: 10,
				renderElement: renderStartEntry,
				rankElement: e => -e.order,
				contextService: this.contextService
			});

		startList.setEntries(parsedStartEntries);
		startList.onDidChange(() => this.registerDispatchListeners());
		return startList;
	}

	private buildGettingStartedWalkthroughsList(): GettingStartedIndexList<IResolvedWalkthrough> {

		const renderGetttingStaredWalkthrough = (category: IResolvedWalkthrough): HTMLElement => {

			const renderNewBadge = (category.newItems || category.newEntry) && !category.isFeatured;
			const newBadge = $('.new-badge', {});
			if (category.newEntry) {
				reset(newBadge, $('.new-category', {}, localize('new', "New")));
			} else if (category.newItems) {
				reset(newBadge, $('.new-items', {}, localize({ key: 'newItems', comment: ['Shown when a list of items has changed based on an update from a remote source'] }, "Updated")));
			}

			const featuredBadge = $('.featured-badge', {});
			const descriptionContent = $('.description-content', {},);

			if (category.isFeatured && this.showFeaturedWalkthrough) {
				reset(featuredBadge, $('.featured', {}, $('span.featured-icon.codicon.codicon-star-full')));
				reset(descriptionContent, ...renderLabelWithIcons(category.description));
			}

			const titleContent = $('h3.category-title.max-lines-3', { 'x-category-title-for': category.id });
			reset(titleContent, ...renderLabelWithIcons(category.title));

			return $('button.getting-started-category' + (category.isFeatured && this.showFeaturedWalkthrough ? '.featured' : ''),
				{
					'x-dispatch': 'selectCategory:' + category.id,
					'title': category.description
				},
				featuredBadge,
				$('.main-content', {},
					this.iconWidgetFor(category),
					titleContent,
					renderNewBadge ? newBadge : $('.no-badge'),
					$('a.codicon.codicon-close.hide-category-button', {
						'tabindex': 0,
						'x-dispatch': 'hideCategory:' + category.id,
						'title': localize('close', "Hide"),
						'role': 'button',
						'aria-label': localize('closeAriaLabel', "Hide"),
					}),
				),
				descriptionContent,
				$('.category-progress', { 'x-data-category-id': category.id, },
					$('.progress-bar-outer', { 'role': 'progressbar' },
						$('.progress-bar-inner'))));
		};

		if (this.gettingStartedList) { this.gettingStartedList.dispose(); }

		const rankWalkthrough = (e: IResolvedWalkthrough) => {
			let rank: number | null = e.order;

			if (e.isFeatured) { rank += 7; }
			if (e.newEntry) { rank += 3; }
			if (e.newItems) { rank += 2; }
			if (e.recencyBonus) { rank += 4 * e.recencyBonus; }

			if (this.getHiddenCategories().has(e.id)) { rank = null; }
			return rank;
		};

		const gettingStartedList = this.gettingStartedList = new GettingStartedIndexList(
			{
				title: localize('walkthroughs', "Walkthroughs"),
				klass: 'getting-started',
				limit: 5,
				footer: $('span.button-link.see-all-walkthroughs', { 'x-dispatch': 'seeAllWalkthroughs', 'tabindex': 0 }, localize('showAll', "More...")),
				renderElement: renderGetttingStaredWalkthrough,
				rankElement: rankWalkthrough,
				contextService: this.contextService,
			});

		gettingStartedList.onDidChange(() => {
			const hidden = this.getHiddenCategories();
			const someWalkthroughsHidden = hidden.size || gettingStartedList.itemCount < this.gettingStartedCategories.filter(c => this.contextService.contextMatchesRules(c.when)).length;
			this.container.classList.toggle('someWalkthroughsHidden', !!someWalkthroughsHidden);
			this.registerDispatchListeners();
			allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);
			this.updateCategoryProgress();
		});

		gettingStartedList.setEntries(this.gettingStartedCategories);
		allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);

		return gettingStartedList;
	}

	layout(size: Dimension) {
		this.detailsScrollbar?.scanDomNode();

		this.categoriesPageScrollbar?.scanDomNode();
		this.detailsPageScrollbar?.scanDomNode();

		this.startList?.layout(size);
		this.gettingStartedList?.layout(size);
		this.recentlyOpenedList?.layout(size);

		if (this.editorInput?.selectedStep && this.currentMediaType) {
			this.mediaDisposables.clear();
			this.stepDisposables.clear();
			this.buildMediaComponent(this.editorInput.selectedStep);
		}

		this.layoutMarkdown?.();

		this.container.classList.toggle('height-constrained', size.height <= 600);
		this.container.classList.toggle('width-constrained', size.width <= 400);
		this.container.classList.toggle('width-semi-constrained', size.width <= 800);

		this.categoriesPageScrollbar?.scanDomNode();
		this.detailsPageScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
	}

	private updateCategoryProgress() {
		this.window.document.querySelectorAll('.category-progress').forEach(element => {
			const categoryID = element.getAttribute('x-data-category-id');
			const category = this.gettingStartedCategories.find(category => category.id === categoryID);
			if (!category) { throw Error('Could not find category with ID ' + categoryID); }

			const stats = this.getWalkthroughCompletionStats(category);

			const bar = assertIsDefined(element.querySelector('.progress-bar-inner')) as HTMLDivElement;
			bar.setAttribute('aria-valuemin', '0');
			bar.setAttribute('aria-valuenow', '' + stats.stepsComplete);
			bar.setAttribute('aria-valuemax', '' + stats.stepsTotal);
			const progress = (stats.stepsComplete / stats.stepsTotal) * 100;
			bar.style.width = `${progress}%`;

			(element.parentElement as HTMLElement).classList.toggle('no-progress', stats.stepsComplete === 0);

			if (stats.stepsTotal === stats.stepsComplete) {
				bar.title = localize('gettingStarted.allStepsComplete', "All {0} steps complete!", stats.stepsComplete);
			}
			else {
				bar.title = localize('gettingStarted.someStepsComplete', "{0} of {1} steps complete", stats.stepsComplete, stats.stepsTotal);
			}
		});
	}

	private async scrollToCategory(categoryID: string, stepId?: string) {

		if (!this.gettingStartedCategories.some(c => c.id === categoryID)) {
			this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
		}

		const ourCategory = this.gettingStartedCategories.find(c => c.id === categoryID);
		if (!ourCategory) {
			throw Error('Could not find category with ID: ' + categoryID);
		}

		this.inProgressScroll = this.inProgressScroll.then(async () => {
			reset(this.stepsContent);
			this.editorInput.selectedCategory = categoryID;
			this.editorInput.selectedStep = stepId;
			this.currentWalkthrough = ourCategory;
			this.buildCategorySlide(categoryID, stepId);
			this.setSlide('details');
		});
	}

	private iconWidgetFor(category: IResolvedWalkthrough | { icon: { type: 'icon'; icon: ThemeIcon } }) {
		const widget = category.icon.type === 'icon' ? $(ThemeIcon.asCSSSelector(category.icon.icon)) : $('img.category-icon', { src: category.icon.path });
		widget.classList.add('icon-widget');
		return widget;
	}

	private focusSideEditorGroup() {
		const fullSize = this.groupsService.getPart(this.group).contentDimension;
		if (!fullSize || fullSize.width <= 700) { return; }
		if (this.groupsService.count === 1) {
			const sideGroup = this.groupsService.addGroup(this.groupsService.groups[0], GroupDirection.RIGHT);
			this.groupsService.activateGroup(sideGroup);

			const gettingStartedSize = Math.floor(fullSize.width / 2);

			const gettingStartedGroup = this.groupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(group => (group.activeEditor instanceof GettingStartedInput));
			this.groupsService.setSize(assertIsDefined(gettingStartedGroup), { width: gettingStartedSize, height: fullSize.height });
		}

		const nonGettingStartedGroup = this.groupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(group => !(group.activeEditor instanceof GettingStartedInput));
		if (nonGettingStartedGroup) {
			this.groupsService.activateGroup(nonGettingStartedGroup);
			nonGettingStartedGroup.focus();
		}
	}
	private runStepCommand(href: string) {

		const isCommand = href.startsWith('command:');
		const toSide = href.startsWith('command:toSide:');
		const command = href.replace(/command:(toSide:)?/, 'command:');

		this.telemetryService.publicLog2<GettingStartedActionEvent, GettingStartedActionClassification>('gettingStarted.ActionExecuted', { command: 'runStepAction', argument: href, walkthroughId: this.currentWalkthrough?.id });

		if (toSide) {
			this.focusSideEditorGroup();
		}
		if (isCommand) {
			const commandURI = URI.parse(command);

			// execute as command
			let args: any = [];
			try {
				args = parse(decodeURIComponent(commandURI.query));
			} catch {
				// ignore and retry
				try {
					args = parse(commandURI.query);
				} catch {
					// ignore error
				}
			}
			if (!Array.isArray(args)) {
				args = [args];
			}

			// If a step is requesting the OpenFolder action to be executed in an empty workspace...
			if ((commandURI.path === OpenFileFolderAction.ID.toString() ||
				commandURI.path === OpenFolderAction.ID.toString()) &&
				this.workspaceContextService.getWorkspace().folders.length === 0) {

				const selectedStepIndex = this.currentWalkthrough?.steps.findIndex(step => step.id === this.editorInput.selectedStep);

				// and there are a few more steps after this step which are yet to be completed...
				if (selectedStepIndex !== undefined &&
					selectedStepIndex > -1 &&
					this.currentWalkthrough?.steps.slice(selectedStepIndex + 1).some(step => !step.done)) {
					const restoreData: RestoreWalkthroughsConfigurationValue = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput.selectedCategory, step: this.editorInput.selectedStep };

					// save state to restore after reload
					this.storageService.store(
						restoreWalkthroughsConfigurationKey,
						JSON.stringify(restoreData),
						StorageScope.PROFILE, StorageTarget.MACHINE);
				}
			}

			this.commandService.executeCommand(commandURI.path, ...args).then(result => {
				const toOpen: URI = result?.openFolder;
				if (toOpen) {
					if (!URI.isUri(toOpen)) {
						console.warn('Warn: Running walkthrough command', href, 'yielded non-URI `openFolder` result', toOpen, '. It will be disregarded.');
						return;
					}
					const restoreData: RestoreWalkthroughsConfigurationValue = { folder: toOpen.toString(), category: this.editorInput.selectedCategory, step: this.editorInput.selectedStep };
					this.storageService.store(
						restoreWalkthroughsConfigurationKey,
						JSON.stringify(restoreData),
						StorageScope.PROFILE, StorageTarget.MACHINE);
					this.hostService.openWindow([{ folderUri: toOpen }]);
				}
			});
		} else {
			this.openerService.open(command, { allowCommands: true });
		}

		if (!isCommand && (href.startsWith('https://') || href.startsWith('http://'))) {
			this.gettingStartedService.progressByEvent('onLink:' + href);
		}
	}

	private buildMarkdownDescription(container: HTMLElement, text: LinkedText[]) {
		while (container.firstChild) { container.firstChild.remove(); }

		for (const linkedText of text) {
			if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== 'string') {
				const node = linkedText.nodes[0];
				const buttonContainer = append(container, $('.button-container'));
				const button = new Button(buttonContainer, { title: node.title, supportIcons: true, ...defaultButtonStyles });

				const isCommand = node.href.startsWith('command:');
				const command = node.href.replace(/command:(toSide:)?/, 'command:');

				button.label = node.label;
				button.onDidClick(e => {
					e.stopPropagation();
					e.preventDefault();
					this.runStepCommand(node.href);
				}, null, this.detailsPageDisposables);

				if (isCommand) {
					const keybindingLabel = this.getKeybindingLabel(command);
					if (keybindingLabel) {
						container.appendChild($('span.shortcut-message', {}, localize('gettingStarted.keyboardTip', 'Tip: Use keyboard shortcut '), $('span.keybinding', {}, keybindingLabel)));
					}
				}

				this.detailsPageDisposables.add(button);
			} else {
				const p = append(container, $('p'));
				for (const node of linkedText.nodes) {
					if (typeof node === 'string') {
						const labelWithIcon = renderLabelWithIcons(node);
						for (const element of labelWithIcon) {
							if (typeof element === 'string') {
								p.appendChild(renderFormattedText(element, { inline: true, renderCodeSegments: true }));
							} else {
								p.appendChild(element);
							}
						}
					} else {
						const link = this.instantiationService.createInstance(Link, p, node, { opener: (href) => this.runStepCommand(href) });
						this.detailsPageDisposables.add(link);
					}
				}
			}
		}
		return container;
	}

	override clearInput() {
		this.stepDisposables.clear();
		super.clearInput();
	}

	private buildCategorySlide(categoryID: string, selectedStep?: string) {
		if (this.detailsScrollbar) { this.detailsScrollbar.dispose(); }

		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			// Remove internal extension id specifier from exposed id's
			this.extensionService.activateByEvent(`onWalkthrough:${categoryID.replace(/[^#]+#/, '')}`);
		});

		this.detailsPageDisposables.clear();
		this.mediaDisposables.clear();

		const category = this.gettingStartedCategories.find(category => category.id === categoryID);
		if (!category) {
			throw Error('could not find category with ID ' + categoryID);
		}

		const descriptionContainer = $('.category-description.description.max-lines-3', { 'x-category-description-for': category.id });
		this.buildMarkdownDescription(descriptionContainer, parseDescription(category.description));

		const categoryDescriptorComponent =
			$('.getting-started-category',
				{},
				$('.category-description-container', {},
					$('h2.category-title.max-lines-3', { 'x-category-title-for': category.id }, ...renderLabelWithIcons(category.title)),
					descriptionContainer));

		const stepListContainer = $('.step-list-container');

		this.detailsPageDisposables.add(addDisposableListener(stepListContainer, 'keydown', (e) => {
			const event = new StandardKeyboardEvent(e);
			const currentStepIndex = () =>
				category.steps.findIndex(e => e.id === this.editorInput.selectedStep);

			if (event.keyCode === KeyCode.UpArrow) {
				const toExpand = category.steps.filter((step, index) => index < currentStepIndex() && this.contextService.contextMatchesRules(step.when));
				if (toExpand.length) {
					this.selectStep(toExpand[toExpand.length - 1].id, false);
				}
			}
			if (event.keyCode === KeyCode.DownArrow) {
				const toExpand = category.steps.find((step, index) => index > currentStepIndex() && this.contextService.contextMatchesRules(step.when));
				if (toExpand) {
					this.selectStep(toExpand.id, false);
				}
			}
		}));

		let renderedSteps: IResolvedWalkthroughStep[] | undefined = undefined;

		const contextKeysToWatch = new Set(category.steps.flatMap(step => step.when.keys()));

		const buildStepList = () => {

			category.steps.sort((a, b) => a.order - b.order);
			const toRender = category.steps
				.filter(step => this.contextService.contextMatchesRules(step.when));

			if (equals(renderedSteps, toRender, (a, b) => a.id === b.id)) {
				return;
			}

			renderedSteps = toRender;

			reset(stepListContainer, ...renderedSteps
				.map(step => {
					const codicon = $('.codicon' + (step.done ? '.complete' + ThemeIcon.asCSSSelector(gettingStartedCheckedCodicon) : ThemeIcon.asCSSSelector(gettingStartedUncheckedCodicon)),
						{
							'data-done-step-id': step.id,
							'x-dispatch': 'toggleStepCompletion:' + step.id,
							'role': 'checkbox',
							'tabindex': '0',
							'aria-checked': step.done ? 'true' : 'false'
						});

					const container = $('.step-description-container', { 'x-step-description-for': step.id });
					this.buildMarkdownDescription(container, step.description);

					const stepTitle = $('h3.step-title.max-lines-3', { 'x-step-title-for': step.id });
					reset(stepTitle, ...renderLabelWithIcons(step.title));

					const stepDescription = $('.step-container', {},
						stepTitle,
						container,
					);

					if (step.media.type === 'image') {
						stepDescription.appendChild(
							$('.image-description', { 'aria-label': localize('imageShowing', "Image showing {0}", step.media.altText) }),
						);
					}

					return $('button.getting-started-step',
						{
							'x-dispatch': 'selectTask:' + step.id,
							'data-step-id': step.id,
							'aria-expanded': 'false',
							'aria-checked': step.done ? 'true' : 'false',
							'role': 'button',
						},
						codicon,
						stepDescription);
				}));
		};

		buildStepList();

		this.detailsPageDisposables.add(this.contextService.onDidChangeContext(e => {
			if (e.affectsSome(contextKeysToWatch)) {
				buildStepList();
				this.registerDispatchListeners();
				this.selectStep(this.editorInput.selectedStep, false);
			}
		}));

		const showNextCategory = this.gettingStartedCategories.find(_category => _category.id === category.next);

		const stepsContainer = $(
			'.getting-started-detail-container', { 'role': 'list' },
			stepListContainer,
			$('.done-next-container', {},
				$('button.button-link.all-done', { 'x-dispatch': 'allDone' }, $('span.codicon.codicon-check-all'), localize('allDone', "Mark Done")),
				...(showNextCategory
					? [$('button.button-link.next', { 'x-dispatch': 'nextSection' }, localize('nextOne', "Next Section"), $('span.codicon.codicon-arrow-right'))]
					: []),
			)
		);
		this.detailsScrollbar = this._register(new DomScrollableElement(stepsContainer, { className: 'steps-container' }));
		const stepListComponent = this.detailsScrollbar.getDomNode();

		const categoryFooter = $('.getting-started-footer');
		if (this.editorInput.showTelemetryNotice && getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE && this.productService.enableTelemetry) {
			this.buildTelemetryFooter(categoryFooter);
		}

		reset(this.stepsContent, categoryDescriptorComponent, stepListComponent, this.stepMediaComponent, categoryFooter);

		const toExpand = category.steps.find(step => this.contextService.contextMatchesRules(step.when) && !step.done) ?? category.steps[0];
		this.selectStep(selectedStep ?? toExpand.id, !selectedStep);

		this.detailsScrollbar.scanDomNode();
		this.detailsPageScrollbar?.scanDomNode();

		this.registerDispatchListeners();
	}

	private buildTelemetryFooter(parent: HTMLElement) {
		const mdRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

		const privacyStatementCopy = localize('privacy statement', "privacy statement");
		const privacyStatementButton = `[${privacyStatementCopy}](command:workbench.action.openPrivacyStatementUrl)`;

		const optOutCopy = localize('optOut', "opt out");
		const optOutButton = `[${optOutCopy}](command:settings.filterByTelemetry)`;

		const text = localize({ key: 'footer', comment: ['fist substitution is "vs code", second is "privacy statement", third is "opt out".'] },
			"{0} collects usage data. Read our {1} and learn how to {2}.", this.productService.nameShort, privacyStatementButton, optOutButton);

		parent.append(mdRenderer.render({ value: text, isTrusted: true }).element);
		mdRenderer.dispose();
	}

	private getKeybindingLabel(command: string) {
		command = command.replace(/^command:/, '');
		const label = this.keybindingService.lookupKeybinding(command)?.getLabel();
		if (!label) { return ''; }
		else {
			return `(${label})`;
		}
	}

	private async scrollPrev() {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			this.currentWalkthrough = undefined;
			this.editorInput.selectedCategory = undefined;
			this.editorInput.selectedStep = undefined;
			this.editorInput.showTelemetryNotice = false;

			if (this.gettingStartedCategories.length !== this.gettingStartedList?.itemCount) {
				// extensions may have changed in the time since we last displayed the walkthrough list
				// rebuild the list
				this.buildCategoriesSlide();
			}

			this.selectStep(undefined);
			this.setSlide('categories');
			this.container.focus();
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

	private setSlide(toEnable: 'details' | 'categories') {
		const slideManager = assertIsDefined(this.container.querySelector('.gettingStarted'));
		if (toEnable === 'categories') {
			slideManager.classList.remove('showDetails');
			slideManager.classList.add('showCategories');
			this.container.querySelector<HTMLButtonElement>('.prev-button.button-link')!.style.display = 'none';
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = true);
			this.container.querySelector('.gettingStartedSlideCategories')!.querySelectorAll('button').forEach(button => button.disabled = false);
			this.container.querySelector('.gettingStartedSlideCategories')!.querySelectorAll('input').forEach(button => button.disabled = false);
		} else {
			slideManager.classList.add('showDetails');
			slideManager.classList.remove('showCategories');
			this.container.querySelector<HTMLButtonElement>('.prev-button.button-link')!.style.display = 'block';
			this.container.querySelector('.gettingStartedSlideDetails')!.querySelectorAll('button').forEach(button => button.disabled = false);
			this.container.querySelector('.gettingStartedSlideCategories')!.querySelectorAll('button').forEach(button => button.disabled = true);
			this.container.querySelector('.gettingStartedSlideCategories')!.querySelectorAll('input').forEach(button => button.disabled = true);
		}
	}

	override focus() {
		super.focus();

		const active = this.container.ownerDocument.activeElement;

		let parent = this.container.parentElement;
		while (parent && parent !== active) {
			parent = parent.parentElement;
		}

		if (parent) {
			// Only set focus if there is no other focued element outside this chain.
			// This prevents us from stealing back focus from other focused elements such as quick pick due to delayed load.
			this.container.focus();
		}
	}
}

export class GettingStartedInputSerializer implements IEditorSerializer {
	public canSerialize(editorInput: GettingStartedInput): boolean {
		return true;
	}

	public serialize(editorInput: GettingStartedInput): string {
		return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): GettingStartedInput {
		try {
			const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
			return new GettingStartedInput({ selectedCategory, selectedStep });
		} catch { }
		return new GettingStartedInput({});
	}
}
