/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, Dimension, addDisposableListener, append, clearNode, reset } from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { coalesce, equals } from '../../../../base/common/arrays.js';
import { Delayer, Throttler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { splitRecentLabel } from '../../../../base/common/labels.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILink, LinkedText } from '../../../../base/common/linkedText.js';
import { parse } from '../../../../base/common/marshalling.js';
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import { isMacintosh, OS } from '../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import './media/gettingStarted.css';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService, TelemetryLevel, firstSessionDateStorageKey } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultButtonStyles, defaultKeybindingLabelStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWindowOpenable } from '../../../../platform/window/common/window.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from '../../../../platform/workspace/common/workspace.js';
import { IRecentFolder, IRecentWorkspace, IRecentlyOpened, IWorkspacesService, isRecentFolder, isRecentWorkspace } from '../../../../platform/workspaces/common/workspaces.js';
import { OpenRecentAction } from '../../../browser/actions/windowActions.js';
import { OpenFileFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from '../../../browser/actions/workspaceActions.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { IEditorOpenContext, IEditorSerializer } from '../../../common/editor.js';
import { IWebviewElement, IWebviewService } from '../../webview/browser/webview.js';
import './gettingStartedColors.js';
import { GettingStartedDetailsRenderer } from './gettingStartedDetailsRenderer.js';
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from './gettingStartedIcons.js';
import { GettingStartedEditorOptions, GettingStartedInput } from './gettingStartedInput.js';
import { IResolvedWalkthrough, IResolvedWalkthroughStep, IWalkthroughsService, hiddenEntriesConfigurationKey, parseDescription } from './gettingStartedService.js';
import { RestoreWalkthroughsConfigurationValue, restoreWalkthroughsConfigurationKey } from './startupPage.js';
import { startEntries } from '../common/gettingStartedContent.js';
import { GroupDirection, GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { GettingStartedIndexList } from './gettingStartedList.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibleViewAction } from '../../accessibility/browser/accessibleViewActions.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';

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
	private prevWalkthrough: IResolvedWalkthrough | undefined;

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
						badgeelement.setAttribute('aria-label', localize('stepDone', "Checkbox for Step {0}: Completed", step.title));
					}
					else {
						badgeelement.setAttribute('aria-checked', 'false');
						badgeelement.parentElement?.setAttribute('aria-checked', 'false');
						badgeelement.classList.remove('complete', ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
						badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
						badgeelement.setAttribute('aria-label', localize('stepNotDone', "Checkbox for Step {0}: Not completed", step.title));
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

			const editorPane = this.groupsService.activeGroup.activeEditorPane;
			if (!(editorPane instanceof GettingStartedPage)) {
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
		this.editorInput.showTelemetryNotice = (options as GettingStartedEditorOptions)?.showTelemetryNotice ?? true;
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
					this.prevWalkthrough = this.currentWalkthrough;
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
			} else if (stepToExpand.media.type === 'video') {
				this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: '', extension: undefined }));
				this.webview.mountTo(this.stepMediaComponent, this.window);
			}
		}

		if (stepToExpand.media.type === 'image') {

			this.stepsContent.classList.add('image');
			this.stepsContent.classList.remove('markdown');
			this.stepsContent.classList.remove('video');

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
			this.stepsContent.classList.remove('video');

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
			this.stepsContent.classList.remove('video');

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
		else if (stepToExpand.media.type === 'video') {
			this.stepsContent.classList.add('video');
			this.stepsContent.classList.remove('markdown');
			this.stepsContent.classList.remove('image');

			const media = stepToExpand.media;

			const themeType = this.themeService.getColorTheme().type;
			const videoPath = media.path[themeType];
			const videoPoster = media.poster ? media.poster[themeType] : undefined;
			const altText = media.altText ? media.altText : localize('videoAltText', "Video for {0}", stepToExpand.title);
			const rawHTML = await this.detailsRenderer.renderVideo(videoPath, videoPoster, altText);
			this.webview.setHtml(rawHTML);

			let isDisposed = false;
			this.stepDisposables.add(toDisposable(() => { isDisposed = true; }));

			this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
				// Render again since color vars change
				const themeType = this.themeService.getColorTheme().type;
				const videoPath = media.path[themeType];
				const videoPoster = media.poster ? media.poster[themeType] : undefined;
				const body = await this.detailsRenderer.renderVideo(videoPath, videoPoster, altText);

				if (!isDisposed) { // Make sure we weren't disposed of in the meantime
					this.webview.setHtml(body);
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

	private provideScreenReaderUpdate(): string {
		if (this.configurationService.getValue(AccessibilityVerbositySettingId.Walkthrough)) {
			const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
			return kbLabel ? localize('acessibleViewHint', "Inspect this in the accessible view ({0}).\n", kbLabel) : localize('acessibleViewHintNoKbOpen', "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.\n");
		}
		return '';
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
					const codiconElement = node.querySelector('.codicon');
					if (codiconElement) {
						codiconElement.removeAttribute('tabindex');
					}
				}
			});
			setTimeout(() => (stepElement as HTMLElement).focus(), delayFocus && this.shouldAnimate() ? SLIDE_TRANSITION_TIME_MS : 0);

			this.editorInput.selectedStep = id;

			stepElement.classList.add('expanded');
			stepElement.setAttribute('aria-expanded', 'true');
			this.buildMediaComponent(id, true);
			const codiconElement = stepElement.querySelector('.codicon');
			if (codiconElement) {
				codiconElement.setAttribute('tabindex', '0');
			}
			this.gettingStartedService.progressByEvent('stepSelected:' + id);
			const step = this.currentWalkthrough?.steps?.find(step => step.id === id);
			if (step) {
				stepElement.setAttribute('aria-label', `${this.provideScreenReaderUpdate()} ${step.title}`);
			}
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

		const prevButton = $('button.prev-button.button-link', { 'x-dispatch': 'scrollPrev' }, $('span.scroll-button.codicon.codicon-chevron-left'), $('span.moreText', {}, localize('goBack', "Go Back")));
		this.stepsSlide = $('.gettingStartedSlideDetails.gettingStartedSlide', {}, prevButton);

		this.stepsContent = $('.gettingStartedDetailsContent', {});

		this.detailsPageScrollbar = this._register(new DomScrollableElement(this.stepsContent, { className: 'full-height-scrollable', vertical: ScrollbarVisibility.Hidden }));
		this.categoriesPageScrollbar = this._register(new DomScrollableElement(this.categoriesSlide, { className: 'full-height-scrollable categoriesScrollbar', vertical: ScrollbarVisibility.Hidden }));

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
			const showNewExperience = this.editorInput.selectedCategory === 'NewWelcomeExperience';
			this.currentWalkthrough = this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);

			if (!this.currentWalkthrough) {
				this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
				this.currentWalkthrough = showNewExperience ? this.gettingStartedService.getWalkthrough(this.editorInput.selectedCategory) : this.gettingStartedCategories.find(category => category.id === this.editorInput.selectedCategory);
				if (this.currentWalkthrough) {
					if (showNewExperience) {
						this.buildNewCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
					} else {
						this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
					}
					this.setSlide('details');
					return;
				}
			}
			else {
				if (showNewExperience) {
					this.buildNewCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
				} else {
					this.buildCategorySlide(this.editorInput.selectedCategory, this.editorInput.selectedStep);
				}
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
					this.editorInput.walkthroughPageTitle = this.currentWalkthrough.walkthroughPageTitle;
					this.buildCategorySlide(this.editorInput.selectedCategory, undefined);
					this.setSlide('details', true /* firstLaunch */);
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
		this.container.classList.toggle('width-semi-constrained', size.width <= 950);

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
			this.editorInput.walkthroughPageTitle = ourCategory.walkthroughPageTitle;
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
					const keybinding = this.getKeyBinding(command);
					if (keybinding && this.editorInput.selectedCategory !== 'NewWelcomeExperience') {
						const shortcutMessage = $('span.shortcut-message', {}, localize('gettingStarted.keyboardTip', 'Tip: Use keyboard shortcut '));
						container.appendChild(shortcutMessage);
						const label = new KeybindingLabel(shortcutMessage, OS, { ...defaultKeybindingLabelStyles });
						label.set(keybinding);
						this.detailsPageDisposables.add(label);
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
						const nodeWithTitle: ILink = matchesScheme(node.href, Schemas.http) || matchesScheme(node.href, Schemas.https) ? { ...node, title: node.href } : node;
						const link = this.instantiationService.createInstance(Link, p, nodeWithTitle, { opener: (href) => this.runStepCommand(href) });
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


	private selectStepByIndex(newIndex: number, steps: IResolvedWalkthroughStep[], direction: number) {
		const currentIndex = steps.findIndex(step => step.id === this.editorInput.selectedStep);
		const slidesContainer = this.stepsContent.querySelector('.step-slides-container') as HTMLElement;

		if (slidesContainer) {
			// Apply the transform to move the slides
			const slides = slidesContainer.querySelectorAll('.step-slide');

			// First make all slides visible for the animation
			slides.forEach((slide, index) => {
				const slideElement = slide as HTMLElement;
				// Position all slides in their starting positions
				if (index === currentIndex) {
					slideElement.style.display = 'block';
					slideElement.style.transform = 'translateX(0)';
				} else if (index === newIndex) {
					slideElement.style.display = 'block';
					slideElement.style.transform = `translateX(${direction < 0 ? '-100%' : '100%'})`;
				} else {
					slideElement.style.display = 'none';
				}
			});

			// Force a reflow to ensure the initial positions are applied
			slidesContainer.getBoundingClientRect();

			// Now animate to the final positions
			setTimeout(() => {
				slides.forEach((slide, index) => {
					const slideElement = slide as HTMLElement;
					if (index === currentIndex) {
						slideElement.style.transform = `translateX(${direction > 0 ? '-100%' : '100%'})`;
						setTimeout(() => {
							slideElement.style.display = 'none';
						}, SLIDE_TRANSITION_TIME_MS);
					} else if (index === newIndex) {
						slideElement.style.transform = 'translateX(0)';
					}
				});
			}, 20);

			// Update the active dot
			const dots = this.stepsContent.querySelectorAll('.step-dot');
			dots.forEach((dot, index) => {
				if (index === newIndex) {
					dot.classList.add('active');
				} else {
					dot.classList.remove('active');
				}
			});

			// Update the selected step and build its media
			this.selectSlide(steps[newIndex].id);

			// update footer visibility
			const footer = this.stepsContent.querySelector('.getting-started-footer') as HTMLElement;
			if (footer && newIndex !== 0) {
				footer.style.display = 'none';
			} else if (footer) {
				footer.style.display = 'block';
			}
		}
	}

	private buildNewCategorySlide(categoryID: string, selectedStep?: string) {
		this.container.classList.add('newSlide');
		if (this.detailsScrollbar) { this.detailsScrollbar.dispose(); }

		this.detailsPageDisposables.clear();
		this.mediaDisposables.clear();

		const category = this.gettingStartedService.getWalkthrough(categoryID);
		if (!category) {
			throw Error('could not find category with ID ' + categoryID);
		}

		// Filter steps based on when context
		const steps = category.steps.filter(step => this.contextService.contextMatchesRules(step.when));

		const groupedSteps = new Map<string, IResolvedWalkthroughStep[]>();
		steps.forEach(step => {
			const prefixMatch = step.id.match(/^([^.]+)\./);
			const prefix = prefixMatch ? prefixMatch[1] : step.id;
			if (!groupedSteps.has(prefix)) {
				groupedSteps.set(prefix, []);
			}
			groupedSteps.get(prefix)?.push(step);
		});

		// Create the slide container that will hold all step slides
		const slidesContainer = $('.step-slides-container');

		const navigationContainer = $('.step-dots-container');

		// Add back button
		const prevButton = $('button.button-link.navigation.back', {
			'aria-label': localize('previousStep', "Previous Step"),
			'tabindex': '0'
		}, $('span.codicon.codicon-arrow-left'), localize('back', "Back"));

		const dotsContainer = $('.dots-centered');
		navigationContainer.appendChild(prevButton);
		navigationContainer.appendChild(dotsContainer);

		const allSlides: { id: string; steps: IResolvedWalkthroughStep[] }[] = [];
		groupedSteps.forEach((stepsInGroup, prefix) => {
			if (stepsInGroup.length === 1) {
				allSlides.push({ id: stepsInGroup[0].id, steps: [stepsInGroup[0]] });
			} else {
				// For multi-steps, group them into a single slide
				allSlides.push({ id: prefix, steps: stepsInGroup });
			}
		});

		allSlides.forEach((slide, index) => {
			// Create the slide element
			const slideElement = $('.step-slide', { 'data-step': slide.id });

			// Create the content container with flex layout
			const slideContent = $('.step-slide-content');

			// Text content column
			const textContent = $('.step-text-content');

			if (slide.steps.length === 1) {
				// Single step case
				const step = slide.steps[0];

				// Create step title
				const titleElement = $('h3.step-title', { 'x-step-title-for': step.id });
				reset(titleElement, ...renderLabelWithIcons(step.title));
				textContent.appendChild(titleElement);

				// Create step description container
				const descriptionContainer = $('.step-description', { 'x-step-description-for': step.id });
				this.buildMarkdownDescription(descriptionContainer, step.description);
				textContent.appendChild(descriptionContainer);
			} else {
				// Multi-step case - group steps with same prefix into a single slide
				const multiStepContainer = $('.multi-step-container');

				slide.steps.forEach((step, i) => {
					const subStep = $('.sub-step', { 'data-sub-step-id': step.id });

					this.detailsPageDisposables.add(addDisposableListener(subStep, 'click', () => {
						this.selectSubStep(slide.steps, step.id);
					}));

					this.detailsPageDisposables.add(addDisposableListener(subStep, 'keydown', (e) => {
						const event = new StandardKeyboardEvent(e);
						if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
							this.selectSubStep(slide.steps, step.id);
							e.preventDefault();
						}
					}));

					const subStepTitleEl = $('.sub-step-title', {}, ...renderLabelWithIcons(step.title));
					subStep.appendChild(subStepTitleEl);

					const subStepDesc = $('.sub-step-description');
					this.buildMarkdownDescription(subStepDesc, [step.description[0]]);
					subStep.appendChild(subStepDesc);

					if (i === 0 || step.id === this.editorInput.selectedStep) {
						subStep.classList.add('active');
					} else {
						subStep.classList.remove('active');
					}

					multiStepContainer.appendChild(subStep);
				});

				// Get the linkedText of the lastStep
				const lastStep = slide.steps[slide.steps.length - 1];
				const linkedText = lastStep.description.length > 1 ? lastStep.description[1] : undefined;
				if (linkedText) {
					const descElement = $('.multi-step-action');
					this.buildMarkdownDescription(descElement, [linkedText]);
					multiStepContainer.appendChild(descElement);
				}

				textContent.appendChild(multiStepContainer);
			}

			// Add actions container for buttons
			const actionsContainer = $('.step-actions');
			textContent.appendChild(actionsContainer);

			// Append text content to the slide
			slideContent.appendChild(textContent);
			slideElement.appendChild(slideContent);
			slidesContainer.appendChild(slideElement);

			// Create dot for this slide
			const dot = $('button.step-dot', {
				'data-step-dot-index': `${index}`,
				'role': 'button'
			});

			// Set the initial active dot
			if (index === 0) {
				dot.classList.add('active');
			}

			dotsContainer.appendChild(dot);

			this.detailsPageDisposables.add(addDisposableListener(dot, 'click', () => {
				const currentIndex = this.getCurrentSlideIndex(allSlides);
				if (currentIndex === index) {
					return;
				}
				this.selectStepByIndex(index, allSlides.map(s => s.steps[0]), index > currentIndex ? 1 : -1);
			}));
		});

		// Add next button
		const nextButton = $('button.button-link.navigation.next', {
			'aria-label': localize('nextStep', "Next"),
			'tabindex': '0'
		}, localize('next', "Next"), $('span.codicon.codicon-arrow-right'));

		navigationContainer.appendChild(nextButton);
		this.detailsPageDisposables.add(addDisposableListener(prevButton, 'click', () => {
			const currentIndex = this.getCurrentSlideIndex(allSlides);
			if (currentIndex > 0) {
				this.selectStepByIndex(currentIndex - 1, allSlides.map(s => s.steps[0]), -1);
			}
		}));

		this.detailsPageDisposables.add(addDisposableListener(nextButton, 'click', () => {
			const currentIndex = this.getCurrentSlideIndex(allSlides);
			if (currentIndex < allSlides.length - 1) {
				this.selectStepByIndex(currentIndex + 1, allSlides.map(s => s.steps[0]), 1);
			}
		}));

		// Set the current walkthrough and step
		this.currentWalkthrough = category;
		this.editorInput.selectedCategory = categoryID;
		this.editorInput.selectedStep = this.currentWalkthrough.steps[0].id;
		const stepId = this.editorInput.selectedStep.match(/^([^.]+)\./)?.[1] ?? this.editorInput.selectedStep;

		const selectedSlide = slidesContainer.querySelector(`.step-slide[data-step="${stepId}"]`);
		if (selectedSlide) {
			const selectedSlideContent = selectedSlide.querySelector('.step-slide-content');
			this.buildMediaComponent(this.editorInput.selectedStep);
			selectedSlideContent?.appendChild(this.stepMediaComponent);
		}

		// Category title and description
		const categoryHeader = $('.category-header');
		const categoryTitle = $('h2.category-title', { 'x-category-title-for': category.id });
		reset(categoryTitle, ...renderLabelWithIcons(category.title));
		categoryHeader.appendChild(categoryTitle);

		const descriptionContainer = $('.category-description.description.max-lines-3', { 'x-category-description-for': category.id });
		this.buildMarkdownDescription(descriptionContainer, parseDescription(category.description));
		reset(descriptionContainer, ...renderLabelWithIcons(category.description));
		categoryHeader.appendChild(descriptionContainer);

		const categoryFooter = $('.getting-started-footer');
		if (this.editorInput.showTelemetryNotice && getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE && this.productService.enableTelemetry) {
			this.buildTelemetryFooter(categoryFooter);
		}

		// Build the container for the whole slide deck
		const stepsContainer = $('.getting-started-steps-container', {},
			categoryHeader,
			slidesContainer,
			navigationContainer,
			categoryFooter,
		);

		// Set up the scroll container
		this.detailsScrollbar = this._register(new DomScrollableElement(stepsContainer, { className: 'steps-container' }));
		const stepListComponent = this.detailsScrollbar.getDomNode();

		// Append to the content area
		reset(this.stepsContent, stepListComponent);

		// Add keyboard navigation
		this.detailsPageDisposables.add(addDisposableListener(stepListComponent, 'keydown', (e) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.RightArrow) {
				const currentIndex = this.getCurrentSlideIndex(allSlides);
				if (currentIndex < allSlides.length - 1) {
					this.selectStepByIndex(currentIndex + 1, allSlides.map(s => s.steps[0]), 1);
				}
			} else if (event.keyCode === KeyCode.LeftArrow) {
				const currentIndex = this.getCurrentSlideIndex(allSlides);
				if (currentIndex > 0) {
					this.selectStepByIndex(currentIndex - 1, allSlides.map(s => s.steps[0]), -1);
				}
			}
		}));

		// Register listeners for step selection
		this.registerDispatchListeners();

		this.detailsScrollbar.scanDomNode();
		this.detailsPageScrollbar?.scanDomNode();
	}

	private selectSubStep(steps: IResolvedWalkthroughStep[], selectedStepId: string) {
		this.editorInput.selectedStep = selectedStepId;

		const multiStepContainer = this.container.querySelector('.multi-step-container');
		if (!multiStepContainer) { return; }

		const subSteps = multiStepContainer.querySelectorAll('.sub-step');
		subSteps.forEach(subStepEl => {
			const stepId = subStepEl.getAttribute('data-sub-step-id');
			if (stepId === selectedStepId) {
				subStepEl.classList.add('active');
			} else {
				subStepEl.classList.remove('active');
			}
		});

		const prefixMatch = selectedStepId.match(/^([^.]+)\./);
		const prefix = prefixMatch ? prefixMatch[1] : selectedStepId;
		this.selectSlideWithPrefix(selectedStepId, prefix);

		this.gettingStartedService.progressByEvent('stepSelected:' + selectedStepId);
	}

	private selectSlideWithPrefix(stepId: string, prefix: string) {
		this.editorInput.selectedStep = stepId;

		const step = this.currentWalkthrough?.steps.find(step => step.id === stepId);
		if (!step) { return; }

		const selectedSlide = this.stepsContent.querySelector(`.step-slide[data-step="${prefix}"]`);
		if (selectedSlide) {
			const selectedSlideContent = selectedSlide.querySelector('.step-slide-content');
			this.mediaDisposables.clear();
			this.stepDisposables.clear();
			this.buildMediaComponent(this.editorInput.selectedStep);
			selectedSlideContent?.appendChild(this.stepMediaComponent);
			setTimeout(() => (selectedSlideContent as HTMLElement).focus(), 0);
		}

		this.gettingStartedService.progressByEvent('stepSelected:' + stepId);
		this.detailsPageScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
	}

	private getCurrentSlideIndex(allSlides: { id: string; steps: IResolvedWalkthroughStep[] }[]): number {
		if (!this.editorInput.selectedStep) {
			return 0;
		}

		// Check if the selected step is directly a slide ID
		const directMatch = allSlides.findIndex(slide => slide.id === this.editorInput.selectedStep);
		if (directMatch !== -1) {
			return directMatch;
		}

		// Otherwise, find which slide contains the step as a sub-step
		return allSlides.findIndex(slide =>
			slide.steps.some(step => step.id === this.editorInput.selectedStep)
		);
	}

	private selectSlide(stepId: string) {
		this.editorInput.selectedStep = stepId;

		const step = this.currentWalkthrough?.steps.find(step => step.id === stepId);
		if (!step) { return; }


		const effectiveStepId = stepId.match(/^([^.]+)\./)?.[1] ?? stepId;
		const selectedSlide = this.stepsContent.querySelector(`.step-slide[data-step="${effectiveStepId}"]`);

		if (selectedSlide) {
			const selectedSlideContent = selectedSlide.querySelector('.step-slide-content');
			this.mediaDisposables.clear();
			this.stepDisposables.clear();
			this.buildMediaComponent(this.editorInput.selectedStep);
			selectedSlideContent?.appendChild(this.stepMediaComponent);
			setTimeout(() => (selectedSlideContent as HTMLElement).focus(), 0);
		}

		this.gettingStartedService.progressByEvent('stepSelected:' + stepId);
		this.detailsPageScrollbar?.scanDomNode();
		this.detailsScrollbar?.scanDomNode();
	}

	private buildCategorySlide(categoryID: string, selectedStep?: string) {
		this.container.classList.remove('newSlide');

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
							'aria-checked': step.done ? 'true' : 'false',
							'aria-label': step.done
								? localize('stepDone', "Checkbox for Step {0}: Completed", step.title)
								: localize('stepNotDone', "Checkbox for Step {0}: Not completed", step.title),
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
					} else if (step.media.type === 'video') {
						stepDescription.appendChild(
							$('.video-description', { 'aria-label': localize('videoShowing', "Video showing {0}", step.media.altText) }),
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
			if (e.affectsSome(contextKeysToWatch) && this.currentWalkthrough) {
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
	}

	private getKeybindingLabel(command: string) {
		command = command.replace(/^command:/, '');
		const label = this.keybindingService.lookupKeybinding(command)?.getLabel();
		if (!label) { return ''; }
		else {
			return `(${label})`;
		}
	}

	private getKeyBinding(command: string) {
		command = command.replace(/^command:/, '');
		return this.keybindingService.lookupKeybinding(command);
	}

	private async scrollPrev() {
		this.inProgressScroll = this.inProgressScroll.then(async () => {
			if (this.prevWalkthrough && this.prevWalkthrough !== this.currentWalkthrough) {
				this.currentWalkthrough = this.prevWalkthrough;
				this.prevWalkthrough = undefined;
				this.makeCategoryVisibleWhenAvailable(this.currentWalkthrough.id);
			} else {
				this.currentWalkthrough = undefined;
				this.editorInput.selectedCategory = undefined;
				this.editorInput.selectedStep = undefined;
				this.editorInput.showTelemetryNotice = false;
				this.editorInput.walkthroughPageTitle = undefined;

				if (this.gettingStartedCategories.length !== this.gettingStartedList?.itemCount) {
					// extensions may have changed in the time since we last displayed the walkthrough list
					// rebuild the list
					this.buildCategoriesSlide();
				}

				this.selectStep(undefined);
				this.setSlide('categories');
				this.container.focus();
			}
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

	private setSlide(toEnable: 'details' | 'categories', firstLaunch: boolean = false) {
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
			const prevButton = this.container.querySelector<HTMLButtonElement>('.prev-button.button-link');
			prevButton!.style.display = this.editorInput.showWelcome || this.prevWalkthrough ? 'block' : 'none';

			if (this.editorInput.selectedCategory === 'NewWelcomeExperience') {
				prevButton!.style.display = 'none';
			} else {
				const moreTextElement = prevButton!.querySelector('.moreText');
				moreTextElement!.textContent = firstLaunch ? localize('welcome', "Welcome") : localize('goBack', "Go Back");
			}

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

		return instantiationService.invokeFunction(accessor => {
			try {
				const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
				return new GettingStartedInput({ selectedCategory, selectedStep });
			} catch { }
			return new GettingStartedInput({});

		});
	}
}
