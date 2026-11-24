/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPlanAwareness.css';
import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { language } from '../../../../../base/common/platform.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, isCodeEditor, IViewZone } from '../../../../../editor/browser/editorBrowser.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatModeKind } from '../../common/constants.js';
import { CUSTOMIZATION_HINT_SETTING_ID, CustomizationFileKind, CustomizationHintTreatment, getCustomizationFileKind, getCustomizationHintPresentation, getPlanCreditsAmount, getPlanCreditsPhrase, getPlanFactText, ICustomizationHintPresentation, IPlanFact, PlanNudgeId, PlanNudgeSurface, shouldShowCustomizationHint } from '../../common/planAwareness/chatPlanAwareness.js';
import { PromptsConfig } from '../../common/promptSyntax/config/config.js';
import { CHAT_CATEGORY } from '../actions/chatActions.js';
import { IChatPlanAwarenessService, PlanNudgeAction } from './chatPlanAwarenessService.js';

const $ = dom.$;

const USE_COPILOT_FROM_CUSTOMIZATION_ACTION_ID = 'workbench.action.chat.planAwareness.useCopilotFromCustomization';
const USE_COPILOT_FROM_BANNER_COMMAND_ID = '_chat.planAwareness.useCopilotFromBanner';

const customizationBannerVisible = new RawContextKey<boolean>('chatPlanCustomizationBannerVisible', false, { type: 'boolean', description: localize('chatPlanCustomizationBannerVisible', "True when the active editor shows that Copilot follows its agent instructions, skill, agent or prompt.") });

/** The space between the banner and the first line of the file, and the scroll bar. */
const BANNER_SPACING = 8;
/** Below this width next to the line numbers, the banner starts at the edge of the editor to keep its text readable. */
const MIN_ALIGNED_WIDTH = 320;

let bannerCount = 0;

interface IBannerDelegate {
	use(): void;
	dismiss(): void;
}

function appendFact(container: HTMLElement, fact: IPlanFact): void {
	dom.append(container, document.createTextNode(fact.before));
	if (fact.emphasis) {
		dom.append(container, $('strong', undefined, fact.emphasis));
	}
	dom.append(container, document.createTextNode(fact.after));
}

function getPresentationText(presentation: ICustomizationHintPresentation): string {
	const text = getPlanFactText(presentation.text);
	return presentation.credits ? localize('planAwareness.fileBanner.label', "{0}. {1}", text, getPlanFactText(presentation.credits)) : text;
}

/**
 * One line above the first line of a customization file, separated from the
 * text by a rule. A view zone reserves its space, so it never covers the text,
 * and it scrolls away with the text.
 */
class CustomizationBannerWidget extends Disposable implements IOverlayWidget {

	private readonly id = `chat.planAwareness.customizationBanner.${++bannerCount}`;
	private readonly domNode: HTMLElement;
	private readonly zone: IViewZone;
	private zoneId: string | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		readonly key: string,
		presentation: ICustomizationHintPresentation,
		delegate: IBannerDelegate,
		hoverService: IHoverService,
	) {
		super();

		const fullText = getPresentationText(presentation);
		this.domNode = $('div.chat-plan-file-banner', { role: 'region', 'aria-label': fullText });
		const icon = dom.append(this.domNode, $('span.chat-plan-file-banner-icon', { 'aria-hidden': 'true' }));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.copilot));

		// The text shortens with an ellipsis in narrow editors, so its hover has all of it
		const text = dom.append(this.domNode, $('span.chat-plan-file-banner-text'));
		appendFact(dom.append(text, $('span.chat-plan-file-banner-title')), presentation.text);
		if (presentation.credits) {
			dom.append(text, $('span.chat-plan-file-banner-separator', { 'aria-hidden': 'true' }, '·'));
			appendFact(dom.append(text, $('span.chat-plan-file-banner-credits')), presentation.credits);
		}
		this._register(hoverService.setupDelayedHover(text, { content: fullText }));

		// Before the close action, so that Tab reaches it first
		const link = dom.append(this.domNode, $('button.chat-plan-file-banner-link', { type: 'button' }, presentation.action));
		this._register(dom.addDisposableListener(link, dom.EventType.CLICK, () => delegate.use()));
		const toolbar = this._register(new ActionBar(dom.append(this.domNode, $('div.chat-plan-file-banner-close')), { hoverDelegate: getDefaultHoverDelegate('element') }));
		toolbar.push(this._register(new Action('chatPlanFileBanner.dismiss', localize('planAwareness.fileBanner.dismiss', "Don't Show Again"), ThemeIcon.asClassName(Codicon.close), true, async () => delegate.dismiss())), { icon: true, label: false });

		editor.addOverlayWidget(this);
		this._register(toDisposable(() => editor.removeOverlayWidget(this)));

		this.zone = {
			afterLineNumber: 0,
			heightInPx: 0,
			domNode: $('div'),
			// Above CodeLenses on the first line
			ordinal: -1,
			suppressMouseDown: true,
			onDomNodeTop: top => {
				this.domNode.style.top = `${top}px`;
			},
		};
		editor.changeViewZones(accessor => this.zoneId = accessor.addZone(this.zone));
		this._register(toDisposable(() => editor.changeViewZones(accessor => {
			if (this.zoneId) {
				accessor.removeZone(this.zoneId);
			}
		})));

		this.layout();
		this._register(editor.onDidLayoutChange(() => this.layout()));
		// The reserved space follows the height of the line, which depends on the font size
		const observer = this._register(new dom.DisposableResizeObserver('chatPlanCustomizationBanner', () => this.updateZoneHeight(), dom.getWindow(this.domNode)));
		this._register(observer.observe(this.domNode));
		this.updateZoneHeight();
	}

	/**
	 * Gives the banner the width between the start of the text and the scroll bar.
	 */
	private layout(): void {
		const info = this.editor.getLayoutInfo();
		const minimapLeft = info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0 ? info.minimap.minimapWidth : 0;
		const right = info.width - (minimapLeft ? 0 : info.minimap.minimapWidth) - info.verticalScrollbarWidth;
		const left = right - info.contentLeft >= MIN_ALIGNED_WIDTH ? info.contentLeft : minimapLeft + BANNER_SPACING;
		this.domNode.style.left = `${left}px`;
		this.domNode.style.width = `${Math.max(0, right - left - BANNER_SPACING * 2)}px`;
	}

	private updateZoneHeight(): void {
		const height = this.domNode.offsetHeight + BANNER_SPACING;
		if (height !== this.zone.heightInPx && this.zoneId) {
			this.zone.heightInPx = height;
			this.editor.changeViewZones(accessor => accessor.layoutZone(this.zoneId!));
		}
	}

	getId(): string {
		return this.id;
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		// Positioned at the top of its view zone
		return null;
	}
}

/**
 * Tells paid users who hardly use Copilot, right in their agent instructions,
 * skills, agents and prompts, that Copilot picks them up too and how many AI
 * credits they have, until they close it. Experiments can tune the copy and how
 * long a user has to be inactive. The empty Chat view tells more once they open it.
 */
export class ChatPlanCustomizationBanner extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPlanCustomizationBanner';

	private readonly banners = this._register(new DisposableMap<ICodeEditor, CustomizationBannerWidget>());
	private readonly editorListeners = this._register(new DisposableMap<ICodeEditor, IDisposable>());
	private readonly visibleContext: IContextKey<boolean>;

	private treatments: { readonly inactiveDays: unknown; readonly text: unknown; readonly action: unknown } = { inactiveDays: undefined, text: undefined, action: undefined };
	private treatmentsRequest = 0;
	private shownInSession = false;
	/** The user closed a banner, so banners stay away for this window, also in developer mode, which ignores that they were closed. */
	private hiddenInSession = false;

	constructor(
		@IChatPlanAwarenessService private readonly planAwarenessService: IChatPlanAwarenessService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.visibleContext = customizationBannerVisible.bindTo(contextKeyService);

		this.updateTreatments();
		this._register(assignmentService.onDidRefetchAssignments(() => this.updateTreatments()));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('experiments.override')) {
				this.updateTreatments();
			} else if (e.affectsConfiguration(CUSTOMIZATION_HINT_SETTING_ID) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_MD) || e.affectsConfiguration(PromptsConfig.USE_AGENT_MD) || e.affectsConfiguration(PromptsConfig.USE_AGENT_SKILLS)) {
				this.update();
			}
		}));
		this._register(CommandsRegistry.registerCommand(USE_COPILOT_FROM_BANNER_COMMAND_ID, () => this.use()));
		this._register(editorService.onDidVisibleEditorsChange(() => this.update()));
		this._register(editorService.onDidActiveEditorChange(() => this.updateContext()));
		this._register(autorun(reader => {
			planAwarenessService.plan.read(reader);
			planAwarenessService.recentChatRequests.read(reader);
			planAwarenessService.developerMode.read(reader);
			this.update();
		}));
	}

	private async updateTreatments(): Promise<void> {
		const request = ++this.treatmentsRequest;
		const [inactiveDays, text, action] = await Promise.all([
			this.assignmentService.getTreatment<number>(CustomizationHintTreatment.InactiveDays),
			this.assignmentService.getTreatment<string>(CustomizationHintTreatment.Text),
			this.assignmentService.getTreatment<string>(CustomizationHintTreatment.Action),
		]);
		if (request === this.treatmentsRequest && !this._store.isDisposed) {
			this.treatments = { inactiveDays, text, action };
			this.update();
		}
	}

	private update(): void {
		// Only editors of editor tabs, not diff editors or editors embedded in other views
		const editors = new Set(this.editorService.visibleTextEditorControls.filter(isCodeEditor));
		for (const editor of [...this.editorListeners.keys()]) {
			if (!editors.has(editor)) {
				this.editorListeners.deleteAndDispose(editor);
				this.banners.deleteAndDispose(editor);
			}
		}
		for (const editor of editors) {
			if (!this.editorListeners.has(editor)) {
				this.editorListeners.set(editor, editor.onDidChangeModel(() => this.updateEditor(editor)));
			}
			this.updateEditor(editor);
		}
	}

	private updateEditor(editor: ICodeEditor): void {
		const model = editor.getModel();
		const presentation = model && this.getPresentation(model);
		if (!presentation) {
			this.banners.deleteAndDispose(editor);
		} else {
			const key = `${model.uri.toString()}|${JSON.stringify(presentation)}`;
			if (this.banners.get(editor)?.key !== key) {
				this.banners.set(editor, new CustomizationBannerWidget(editor, key, presentation, {
					use: () => this.use(),
					dismiss: () => this.dismiss(editor),
				}, this.hoverService));
				this.onDidShow(presentation);
			}
		}
		this.updateContext();
	}

	private updateContext(): void {
		const active = this.editorService.activeTextEditorControl;
		this.visibleContext.set(isCodeEditor(active) && this.banners.has(active));
	}

	private isReadByCopilot(kind: CustomizationFileKind, model: ITextModel): boolean {
		const name = basename(model.uri);
		if (name.startsWith('CLAUDE')) {
			return !!this.configurationService.getValue<boolean>(PromptsConfig.USE_CLAUDE_MD);
		}
		if (name === 'AGENTS.md') {
			return !!this.configurationService.getValue<boolean>(PromptsConfig.USE_AGENT_MD);
		}
		if (kind === 'skill') {
			return !!this.configurationService.getValue<boolean>(PromptsConfig.USE_AGENT_SKILLS);
		}
		return true;
	}

	private getPresentation(model: ITextModel): ICustomizationHintPresentation | undefined {
		const kind = getCustomizationFileKind(model.uri);
		const plan = this.planAwarenessService.plan.get();
		if (!kind || !plan || this.hiddenInSession || !this.isReadByCopilot(kind, model)) {
			return undefined;
		}

		// Developer mode ignores the setting, the inactivity and the limits, and is not part of experiments
		const previewing = this.planAwarenessService.isDeveloperMode(PlanNudgeId.CustomizationFile);
		if (!previewing && !shouldShowCustomizationHint({
			enabled: !!this.configurationService.getValue<boolean>(CUSTOMIZATION_HINT_SETTING_ID),
			recentChatRequests: this.planAwarenessService.recentChatRequests.get(),
			inactiveDays: this.treatments.inactiveDays,
			withinLimits: this.planAwarenessService.isWithinLimits(PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint),
			now: Date.now(),
		}, this.telemetryService)) {
			return undefined;
		}

		return getCustomizationHintPresentation(this.treatments, {
			text: getCustomizationKindText(kind),
			credits: getPlanCreditsPhrase(plan, language),
			action: localize('planAwareness.fileBanner.action', "Use Now"),
		}, { credits: getPlanCreditsAmount(plan.credits, language), plan: plan.planName }, previewing ? undefined : this.telemetryService);
	}

	private onDidShow(presentation: ICustomizationHintPresentation): void {
		if (!this.shownInSession) {
			this.shownInSession = true;
			this.planAwarenessService.markShown(PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint);
		}
		if (this.accessibilityService.isScreenReaderOptimized()) {
			status(localize('planAwareness.fileBanner.announce', "{0}. Run the command Use Copilot to open Copilot.", getPresentationText(presentation)));
		}
	}

	private use(): Promise<void> {
		// The banner stays, only closing it hides it
		this.planAwarenessService.recordAction(PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint, PlanNudgeAction.Primary);
		return this.planAwarenessService.openChat({ mode: ChatModeKind.Agent });
	}

	private dismiss(editor: ICodeEditor): void {
		this.planAwarenessService.dismiss(PlanNudgeId.CustomizationFile, PlanNudgeSurface.Hint);
		this.hiddenInSession = true;
		this.update();
		editor.focus();
		status(localize('planAwareness.fileBanner.dismissed', "Copilot suggestion dismissed"));
	}
}

function getCustomizationKindText(kind: CustomizationFileKind): string {
	switch (kind) {
		case 'instructions': return localize('planAwareness.fileBanner.instructions', "Copilot picks up your instruction files");
		case 'skill': return localize('planAwareness.fileBanner.skill', "Copilot picks up your skill files");
		case 'agent': return localize('planAwareness.fileBanner.agent', "Copilot picks up your agent files");
		case 'prompt': return localize('planAwareness.fileBanner.prompt', "Copilot picks up your prompt files");
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: USE_COPILOT_FROM_CUSTOMIZATION_ACTION_ID,
			title: localize2('planAwareness.fileBanner.useAction', "Use Copilot"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, customizationBannerVisible),
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(ICommandService).executeCommand(USE_COPILOT_FROM_BANNER_COMMAND_ID);
	}
});
