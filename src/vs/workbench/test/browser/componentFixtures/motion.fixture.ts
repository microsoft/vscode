/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IKeyboardEvent, StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { FindInput } from '../../../../base/browser/ui/findinput/findInput.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { HoverStyle, IHoverOptions } from '../../../../base/browser/ui/hover/hover.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { List } from '../../../../base/browser/ui/list/listWidget.js';
import { createPixelSpinner } from '../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action } from '../../../../base/common/actions.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Keybinding, KeyCodeChord, ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { isMacintosh, OS } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { localize } from '../../../../nls.js';
import { TestCommandService } from '../../../../editor/test/browser/editorTestServices.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { AbstractKeybindingService } from '../../../../platform/keybinding/common/abstractKeybindingService.js';
import { KeybindingResolver } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, SESSIONS_MARK_AS_DONE_CONFETTI_SETTING } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../platform/contextview/browser/contextViewService.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { MultiSelectDropdown } from '../../../../platform/actionWidget/browser/multiSelectDropdown.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { QuickInputService } from '../../../../platform/quickinput/browser/quickInputService.js';
import { IQuickInputService, IQuickPick, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { defaultButtonStyles, defaultInputBoxStyles, defaultListStyles, defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../platform/hover/browser/hoverService.js';
import { ILanguageModelsService } from '../../../contrib/chat/common/languageModels.js';
import { NullLanguageModelsService } from '../../../contrib/chat/test/common/languageModels.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../contrib/chat/common/model/chatModel.js';
import { ChatContextUsageWidget } from '../../../contrib/chat/browser/widgetHosts/viewPane/chatContextUsageWidget.js';
import { NotificationsToasts } from '../../../browser/parts/notifications/notificationsToasts.js';
import { NotificationsModel } from '../../../common/notifications.js';
import { ChatQuestionCarouselPart } from '../../../contrib/chat/browser/widget/chatContentParts/chatQuestionCarouselPart.js';
import { ITerminalChatService } from '../../../contrib/terminal/browser/terminal.js';
import { AgentSessionsControl } from '../../../contrib/chat/browser/agentSessions/agentSessionsControl.js';
import { IAgentSession, IAgentSessionsModel, AgentSessionStatus } from '../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatSessionsService } from '../../../contrib/chat/common/chatSessionsService.js';
import { MockChatSessionsService } from '../../../contrib/chat/test/common/mockChatSessionsService.js';
import { IVoicePlaybackService } from '../../../contrib/chat/common/voicePlaybackService.js';
import { ChatSessionArchiveNudge } from '../../../contrib/chat/browser/widget/input/chatSessionArchiveNudge.js';
import { ChatWorkingLogo } from '../../../contrib/chat/browser/widget/chatWorkingLogo.js';
import { drawChatPetComposite, hasChatPetBodyImageDimensions } from '../../../contrib/chat/browser/widget/chatPetAccessoryRenderer.js';
import { getChatPetAnimationFrame, getChatPetSpriteSources } from '../../../contrib/chat/browser/widget/chatPetWidget.js';
import { ChatImageGenerationProgressPart } from '../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatImageGenerationProgressPart.js';
import { GlyphSurface } from '../../../contrib/chat/browser/attachments/chatImageGlyphSurface.js';
import { createVoiceRimLight, IVoiceRimLight } from '../../../contrib/chat/browser/voiceClient/voiceGlowController.js';
import { resolveVoiceGlowColors } from '../../../contrib/chat/browser/voiceClient/voiceGlow.js';
import { IChatQuestionCarousel, IChatToolInvocationSerialized } from '../../../contrib/chat/common/chatService/chatService.js';
import { ChatProgressAnimation, ThinkingDisplayMode } from '../../../contrib/chat/common/constants.js';
import { CustomizationToggle } from '../../../contrib/chat/browser/aiCustomization/customizationToggle.js';
import { createModelCardChoiceControl } from '../../../contrib/chat/browser/widget/input/modelPicker/modelPickerCard.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatResponseViewModel } from '../../../contrib/chat/common/model/chatViewModel.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../services/assignment/test/common/nullAssignmentService.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices, waitForFixtureCondition, waitForFixtureDomCondition, z } from './fixtureUtils.js';
import { FixtureMotionAccessibilityService, registerChatFixtureServices } from './chat/chatFixtureUtils.js';
import { configureChatPetFixtureFileRoot } from './chat/chatPetFixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from './chat/chatWidget.fixture.js';
import { renderChatInput } from './chat/renderChatInput.js';
import '../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../platform/quickinput/browser/quickInputActions.js';
import '../../../contrib/chat/browser/agentSessions/media/agentsessionsviewer.css';

const motionInput = z.object({
	action: z.enum(['reset', 'enter', 'exit', 'toggle', 'advance', 'working', 'input', 'stop', 'complete']).default('reset'),
	sequence: z.number().int().nonnegative().default(0),
	reduced: z.boolean().default(false),
	paused: z.boolean().default(false),
	playbackRate: z.number().min(0.25).max(4).default(1),
	variant: z.enum(['grid', 'ring', 'fast', 'slow', 'failure']).optional(),
});
const inputSchema = z.object({ motion: motionInput.default({ action: 'reset', sequence: 0, reduced: false, paused: false, playbackRate: 1 }) });
type MotionInput = z.infer<typeof motionInput>;

const fixture = (render: (context: ComponentFixtureContext, clock: MotionPreviewClock) => void | Promise<void>, actions: readonly MotionInput['action'][] = ['enter', 'exit']) =>
	defineComponentFixture({
		inputSchema: z.object({ motion: motionInput.extend({ action: z.enum(['reset', ...actions]).default('reset') }).default({ action: 'reset', sequence: 0, reduced: false, paused: false, playbackRate: 1 }) }),
		virtualTime: { enabled: false },
		render: context => {
			context.container.style.padding = 'var(--vscode-spacing-size160)';
			context.container.style.backgroundColor = 'var(--vscode-editor-background)';
			context.container.style.boxSizing = 'border-box';
			context.container.style.width = 'min(480px, 100vw)';
			context.container.style.maxWidth = '100%';
			context.container.style.height = 'auto';
			context.container.style.minHeight = '160px';
			context.container.style.display = 'flex';
			context.container.style.flexDirection = 'column';
			context.container.style.justifyContent = 'center';
			context.container.style.alignItems = 'center';
			return render(context, context.disposableStore.add(new MotionPreviewClock(context)));
		},
	});

export default defineThemedFixtureGroup({ labels: { primitive: true } }, {
	InputFocus: fixture(renderInputFocus, ['enter']),
	Fade: fixture(renderHover),
	Scale: fixture(renderThemePicker),
	AnchoredMenu: fixture(renderAnchoredMenu),
	ActionWidget: fixture(renderAnchoredMenu),
	ContentChange: fixture(renderContentReplacement, ['advance']),
	DelayedContent: fixture(renderDelayedContent, ['working']),
	Visibility: fixture(renderScrollbarVisibility, ['enter', 'exit']),
	ContextUsage: fixture(renderContextUsage, ['enter']),
	Interaction: fixture(renderInteraction, ['advance']),
	ListeningColor: fixture(renderListeningColor, ['enter']),
	Translate: fixture(renderNotification),
	Control: fixture(renderControl, ['toggle']),
	Selection: fixture(renderSelection, ['advance']),
	FindOptions: fixture(renderFindOptions, ['toggle']),
	Surface: fixture(renderThemePicker),
	Disclosure: fixture(renderDisclosure),
	Notification: fixture(renderNotification),
	CompactActivity: fixture((context, clock) => renderActivity(context, false, clock), ['working', 'stop', 'complete']),
	Progress: fixture((context, clock) => renderProgress(context, false, clock), ['advance']),
	UnknownProgress: fixture((context, clock) => renderProgress(context, true, clock), ['working', 'stop', 'complete']),
	AgentActivity: fixture((context, clock) => renderActivity(context, true, clock), ['working', 'input', 'stop', 'complete']),
	RingActivity: fixture((context, clock) => renderActivity(context, true, clock, 'ring'), ['working', 'input', 'stop', 'complete']),
	WorkingLogo: fixture(renderWorkingLogo, ['working', 'stop', 'complete']),
	ImageGeneration: fixture(renderImageGeneration, ['working', 'stop']),
	Blobby: fixture(renderBlobby, ['enter', 'working', 'stop']),
	Completion: fixture(renderCompletion, ['complete']),
});

function sceneHeading(container: HTMLElement, text: string): void {
	const heading = dom.append(container, dom.$('p', undefined, text));
	heading.style.margin = '0 0 var(--vscode-spacing-size120)';
	heading.style.fontWeight = 'var(--vscode-fontWeight-semiBold)';
}

function renderEditorContext(context: ComponentFixtureContext, container: HTMLElement, height: number, scrollable = false): CodeEditorWidget {
	const host = dom.append(container, dom.$('div'));
	host.style.height = `${height}px`;
	host.style.width = '100%';
	const services = createEditorServices(context.disposableStore, { colorTheme: context.theme });
	const source = scrollable
		? [
			'export const shortcuts = [',
			'  { name: "Quick Open", key: "Ctrl+P" },',
			'  { name: "Command Palette", key: "Ctrl+Shift+P" },',
			'  { name: "Find", key: "Ctrl+F" },',
			'  { name: "Replace", key: "Ctrl+H" },',
			'  { name: "Go to Line", key: "Ctrl+G" },',
			'  { name: "Save", key: "Ctrl+S" },',
			'  { name: "Format", key: "Shift+Alt+F" },',
			'  { name: "Rename", key: "F2" },',
			'  { name: "Definition", key: "F12" },',
			'  { name: "References", key: "Shift+F12" },',
			'];',
			'',
			'export function findShortcut(name: string) {',
			'  return shortcuts.find(item => item.name === name);',
			'}',
		].join('\n')
		: ['export function greet(name: string) {', '  const message = `Hello, ${name}!`;', '  return message;', '}', '', 'console.log(greet("world"));'].join('\n');
	const model = context.disposableStore.add(createTextModel(services, source, URI.parse('inmemory://motion/example.ts'), 'typescript'));
	const editor = context.disposableStore.add(services.createInstance(CodeEditorWidget, host, {
		automaticLayout: true, minimap: { enabled: false }, lineNumbers: 'on', readOnly: true,
		scrollBeyondLastLine: false, wordWrap: 'on', folding: false, glyphMargin: false, overviewRulerLanes: 0,
		scrollbar: { vertical: scrollable ? 'auto' : 'hidden', horizontal: 'hidden', alwaysConsumeMouseWheel: false },
	}, { contributions: [] }));
	editor.setModel(model);
	editor.layout();
	editor.render(true);
	return editor;
}

function renderScrollbarVisibility(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.style.alignItems = 'stretch';
	sceneHeading(context.container, 'shortcuts.ts');
	const editor = renderEditorContext(context, context.container, 200, true);
	const finish = context.disposableStore.add(new MutableDisposable());
	observe(context, (_input, _reduced, replay) => {
		if (!replay) { return; }
		editor.setScrollTop(editor.getScrollTop() === 0 ? editor.getScrollHeight() - editor.getLayoutInfo().height : 0);
		finish.value = clock.finishWhenSettled();
	}, () => { finish.clear(); editor.setScrollTop(0); });
}

function renderContextUsage(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(ILanguageModelsService, new NullLanguageModelsService());
			reg.define(IHoverService, HoverService);
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = context.container;
				override readonly activeContainer = context.container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer() { return context.container; }
			}());
		},
	});
	context.container.style.minHeight = '220px';
	sceneHeading(context.container, localize('motion.fixture.conversationContext', "Conversation context"));
	const widget = context.disposableStore.add(services.createInstance(ChatContextUsageWidget));
	context.container.append(widget.domNode);
	widget.update(upcastPartial<IChatRequestModel>({
		modelId: 'fixture',
		response: upcastPartial<IChatResponseModel>({
			usage: { kind: 'usage', promptTokens: 63000, completionTokens: 0, contextUsage: { currentTokens: 63000, tokenLimit: 100000 } },
			onDidChange: Event.None,
			session: upcastPartial<IChatModel>({ sessionCost: 0 }),
		}),
	}));
	const finish = context.disposableStore.add(new MutableDisposable());
	const start = () => { clock.start(); finish.value = clock.finishWhenSettled(); };
	context.disposableStore.add(dom.addDisposableListener(widget.domNode, 'mouseenter', start));
	context.disposableStore.add(dom.addDisposableListener(widget.domNode, 'focus', start));
	observe(context, (_input, _reduced, replay) => {
		if (replay) { widget.domNode.focus(); start(); }
	}, () => { services.get(IHoverService).hideHover(); widget.domNode.blur(); });
}

interface PreviewJob {
	remaining: number;
	started: number;
	run: () => void;
	handle: IDisposable | undefined;
	frame: boolean;
}

/** Keeps preview scheduling and native animations on the same pausable timeline. */
class MotionPreviewClock extends Disposable {
	private paused = false;
	private playbackRate = 1;
	private elapsed = 0;
	private readonly jobs = new Set<PreviewJob>();
	private readonly animations = new Set<Animation>();
	private readonly targetWindow = dom.getWindow(this.context.container);
	private updatedAt = this.targetWindow.performance.now();
	private input: MotionInput;
	private pendingOperations = 0;

	constructor(private readonly context: ComponentFixtureContext) {
		super();
		this.input = inputSchema.parse(context.input).motion;
		const update = () => {
			const { paused, playbackRate } = this.input;
			if (paused !== this.paused || playbackRate !== this.playbackRate) {
				const now = this.now();
				for (const job of this.jobs) {
					if (job.handle) {
						job.remaining = Math.max(0, job.remaining - (now - job.started));
						job.handle.dispose();
						job.handle = undefined;
					}
				}
				this.elapsed = now;
				this.updatedAt = this.targetWindow.performance.now();
				this.paused = paused;
				this.playbackRate = playbackRate;
				if (!paused) { for (const job of this.jobs) { this.arm(job); } }
			}
			this.syncAnimations();
		};
		this._register(context.watchInput('motion', (_value, input) => { this.input = inputSchema.parse(input).motion; update(); }));
		const observer = new this.targetWindow.MutationObserver(() => this.syncAnimations());
		this._register(toDisposable(() => observer.disconnect()));
		observer.observe(context.container, { childList: true, subtree: true, attributes: true });
		this._register(dom.addDisposableListener(context.container, 'animationstart', () => this.syncAnimations(), true));
		this._register(dom.addDisposableListener(context.container, 'transitionrun', () => this.syncAnimations(), true));
		const interaction = this._register(new MutableDisposable());
		const onInteraction = () => {
			this.start();
			interaction.value = this.finishWhenSettled();
		};
		this._register(dom.addDisposableListener(context.container, 'click', onInteraction, true));
		this._register(dom.addDisposableListener(context.container, 'keydown', event => {
			if (['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { onInteraction(); }
		}, true));
		this._register(toDisposable(() => {
			for (const job of this.jobs) { job.handle?.dispose(); }
			this.jobs.clear();
			this.animations.clear();
		}));
		update();
	}

	now(): number {
		return this.elapsed + (this.paused ? 0 : (this.targetWindow.performance.now() - this.updatedAt) * this.playbackRate);
	}

	schedule(run: () => void, delay: number, frame = false): IDisposable {
		const job: PreviewJob = { remaining: delay, started: this.now(), run, handle: undefined, frame };
		this.jobs.add(job);
		if (!this.paused) { this.arm(job); }
		return toDisposable(() => { job.handle?.dispose(); this.jobs.delete(job); });
	}

	finish(): void {
		const { sequence } = this.input;
		this.targetWindow.parent.postMessage({ type: 'vscode-motion-preview:ended', sequence }, '*');
	}

	start(): void {
		this.elapsed = this.now();
		this.updatedAt = this.targetWindow.performance.now();
		this.paused = false;
		for (const job of this.jobs) { if (!job.handle) { this.arm(job); } }
		this.syncAnimations();
		this.targetWindow.parent.postMessage({ type: 'vscode-motion-preview:started', sequence: this.input.sequence }, '*');
	}

	async waitFor(operation: Promise<void>): Promise<void> {
		this.pendingOperations++;
		try {
			await operation;
		} finally {
			this.pendingOperations--;
		}
	}

	finishWhenSettled(): IDisposable {
		const pending = new MutableDisposable();
		const sequence = this.input.sequence;
		const check = () => {
			if (sequence !== this.input.sequence) { return; }
			if (this.pendingOperations || this.context.container.getAnimations({ subtree: true }).some(animation => animation.playState === 'running' || animation.playState === 'paused')) {
				pending.value = this.schedule(check, 0, true);
			} else {
				this.finish();
			}
		};
		pending.value = this.schedule(check, 0, true);
		return pending;
	}

	previewLoops(): void {
		if (!this.paused) { return; }
		for (const animation of this.context.container.getAnimations({ subtree: true })) {
			const timing = animation.effect?.getTiming();
			if (timing?.iterations === Infinity && typeof timing.duration === 'number') {
				animation.pause();
				animation.currentTime = (timing.delay ?? 0) + timing.duration / 2;
				this.animations.add(animation);
			}
		}
	}

	private arm(job: PreviewJob): void {
		job.started = this.now();
		const run = () => { this.jobs.delete(job); job.handle = undefined; job.run(); };
		if (job.frame) {
			job.handle = dom.scheduleAtNextAnimationFrame(this.targetWindow, run);
		} else {
			const timer = this.targetWindow.setTimeout(run, job.remaining / this.playbackRate);
			job.handle = toDisposable(() => this.targetWindow.clearTimeout(timer));
		}
	}

	private syncAnimations(): void {
		const current = this.context.container.getAnimations({ subtree: true });
		for (const animation of current) {
			if (animation.playbackRate !== this.playbackRate) { animation.updatePlaybackRate(this.playbackRate); }
			if (this.paused && (animation.playState === 'running' || animation.playState === 'paused')) {
				const time = animation.currentTime;
				animation.pause();
				// Offscreen frames may never resolve a pending pause without an explicit hold time.
				animation.currentTime = time ?? 0;
				this.animations.add(animation);
			}
		}
		if (this.paused) {
			for (const animation of this.animations) { if (!current.includes(animation)) { this.animations.delete(animation); } }
		} else {
			for (const animation of this.animations) { if (animation.playState === 'paused') { animation.play(); } }
			this.animations.clear();
		}
	}
}

function observe(context: ComponentFixtureContext, changed: (input: MotionInput, reduced: boolean, replay: boolean) => void, reset?: (input: MotionInput) => void): void {
	const { container, disposableStore } = context;
	const media = dom.getWindow(container).matchMedia('(prefers-reduced-motion: reduce)');
	let enabled = typeof context.input === 'object' && context.input !== null && Object.getOwnPropertyDescriptor(context.input, 'enableAnimations')?.value === true;
	let input = inputSchema.parse(context.input).motion;
	let sequence = -1;
	const update = () => {
		const reduced = input.reduced || media.matches || !enabled;
		container.classList.toggle('monaco-reduce-motion', reduced);
		container.classList.toggle('monaco-enable-motion', !reduced);
		const replay = input.action !== 'reset' && input.sequence !== sequence;
		if (input.action === 'reset' && input.sequence !== sequence && reset) {
			container.classList.add('monaco-reduce-motion');
			container.classList.remove('monaco-enable-motion');
			reset(input);
			for (const animation of container.getAnimations({ subtree: true })) { animation.cancel(); }
			container.getBoundingClientRect();
			container.classList.toggle('monaco-reduce-motion', reduced);
			container.classList.toggle('monaco-enable-motion', !reduced);
		}
		sequence = input.sequence;
		changed(input, reduced, replay);
	};
	disposableStore.add(context.watchInput('motion', (_value, value) => { input = inputSchema.parse(value).motion; update(); }));
	disposableStore.add(context.onDidChangeEnableAnimations(value => { enabled = value; update(); }));
	disposableStore.add(dom.addDisposableListener(media, 'change', update));
	update();
}

function observeVisibility(context: ComponentFixtureContext, changed: (visible: boolean) => void): void {
	const window = dom.getWindow(context.container);
	let intersecting = true;
	let visible = true;
	const update = () => {
		const next = intersecting && !window.document.hidden;
		if (next !== visible) { visible = next; changed(visible); }
	};
	const observer = new window.IntersectionObserver(entries => {
		intersecting = !!entries[0]?.isIntersecting;
		update();
	});
	context.disposableStore.add(toDisposable(() => observer.disconnect()));
	observer.observe(context.container);
	context.disposableStore.add(dom.addDisposableListener(window.document, 'visibilitychange', update));
}

function createPlayback(context: ComponentFixtureContext, clock: MotionPreviewClock, show: () => void, hide: () => void) {
	const hold = context.disposableStore.add(new MutableDisposable());
	const reset = () => {
		hold.clear();
		hide();
		// Flush the hidden state before showing again so CSS entrances restart.
		for (const animation of context.container.getAnimations({ subtree: true })) {
			animation.cancel();
		}
	};
	context.disposableStore.add(toDisposable(reset));
	return {
		reset,
		play: () => {
			reset();
			clock.start();
			show();
			hold.value = clock.finishWhenSettled();
		},
	};
}

function renderInputFocus(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.style.alignItems = 'stretch';
	const host = dom.append(context.container, dom.$('div'));
	host.style.width = '100%';
	host.style.maxWidth = '320px';
	const input = context.disposableStore.add(new InputBox(host, undefined, {
		ariaLabel: localize('motion.fixture.search', "Search"),
		placeholder: localize('motion.fixture.search', "Search"),
		inputBoxStyles: defaultInputBoxStyles,
	}));
	const finish = context.disposableStore.add(new MutableDisposable());
	context.disposableStore.add(dom.addDisposableListener(input.inputElement, dom.EventType.FOCUS, () => {
		clock.start();
		finish.value = clock.finishWhenSettled();
	}));
	observe(context, (_input, _reduced, replay) => { if (replay) { input.focus(); } }, () => {
		finish.clear();
		input.inputElement.blur();
		input.value = '';
	});
}

function renderHover(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.classList.add('monaco-workbench');
	context.container.style.minHeight = '240px';
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.define(IHoverService, HoverService);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({ workbench: { hover: { delay: isMacintosh ? 1500 : 500 } } }));
			reg.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore));
			reg.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = context.container;
				override readonly activeContainer = context.container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer() { return context.container; }
			}());
		},
	});
	const trigger = context.disposableStore.add(new Button(context.container, { ...defaultButtonStyles, secondary: true }));
	trigger.label = localize('motion.fixture.showDetails', "Show Details");
	trigger.element.style.width = 'fit-content';
	const finish = context.disposableStore.add(new MutableDisposable());
	const hover = services.get(IHoverService);
	const shown = context.disposableStore.add(new MutableDisposable());
	context.disposableStore.add(toDisposable(() => hover.hideHover(true)));
	const options: IHoverOptions = {
		target: trigger.element,
		container: context.container,
		content: localize('motion.fixture.details', "Supporting information stays close to the control it explains."),
		style: HoverStyle.Pointer,
		position: { hoverPosition: HoverPosition.BELOW },
		onDidShow: () => { clock.start(); finish.value = clock.finishWhenSettled(); },
		onDidHide: () => clock.finish(),
	};
	context.disposableStore.add(hover.setupDelayedHover(trigger.element, options));
	const show = () => {
		const widget = hover.showInstantHover(options, true);
		if (widget) { shown.value = widget; }
	};
	let showGeneration = 0;
	context.disposableStore.add(trigger.onDidClick(() => {
		// Let the initiating click finish before the hover installs its dismissal listener.
		const generation = ++showGeneration;
		dom.getWindow(trigger.element).queueMicrotask(() => {
			if (!context.disposableStore.isDisposed && generation === showGeneration) { show(); }
		});
	}));
	observe(context, (input, _reduced, replay) => {
		if (!replay) { return; }
		if (input.action === 'exit') { hover.hideHover(true); }
		else { show(); }
	}, () => { showGeneration++; finish.clear(); shown.clear(); hover.hideHover(true); });
}

/** Dispatches the product's default keybindings without workbench user-profile services. */
class MotionFixtureKeybindingService extends AbstractKeybindingService {
	private readonly resolver = new KeybindingResolver(
		KeybindingsRegistry.getDefaultKeybindings().flatMap(item => {
			const bindings = item.keybinding ? this.resolveKeybinding(item.keybinding) : [undefined];
			return bindings.map(binding => new ResolvedKeybindingItem(binding, item.command, item.commandArgs, item.when ?? undefined, true, null, false));
		}), [], () => { },
	);

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
		@ILogService logService: ILogService,
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, logService);
	}

	protected override _getResolver(): KeybindingResolver { return this.resolver; }
	protected override _documentHasFocus(): boolean { return dom.getActiveWindow().document.hasFocus(); }
	override resolveKeybinding(keybinding: Keybinding): ResolvedKeybinding[] { return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS); }
	override resolveKeyboardEvent(event: IKeyboardEvent): ResolvedKeybinding {
		return this.resolveKeybinding(new KeyCodeChord(event.ctrlKey, event.shiftKey, event.altKey, event.metaKey, event.keyCode).toKeybinding())[0];
	}
	override resolveUserBinding(): ResolvedKeybinding[] { return []; }
	override registerSchemaContribution() { return Disposable.None; }
	override _dumpDebugInfo(): string { return this._dumpDebugInfoJSON(); }
	override _dumpDebugInfoJSON(): string { return JSON.stringify(this.getKeybindings().map(binding => binding.command)); }
	override enableKeybindingHoldMode() { return undefined; }
}

function renderThemePicker(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.classList.add('modern-ui');
	const host = dom.append(context.container, dom.$('div'));
	host.style.position = 'relative';
	host.style.width = '100%';
	host.style.height = '220px';
	const result = dom.append(context.container, dom.$('p', { role: 'status' }));
	const layoutChanged = context.disposableStore.add(new Emitter<dom.IDimension>());
	const dimension = () => ({ width: host.clientWidth, height: host.clientHeight });
	const pickerLifetime = context.disposableStore.add(new MutableDisposable<IQuickPick<IQuickPickItem>>());
	const pickerEvents = context.disposableStore.add(new DisposableStore());
	const layout = new class extends mock<ILayoutService>() {
		override activeContainer = host;
		override mainContainer = host;
		override containers = [host];
		override get activeContainerDimension() { return dimension(); }
		override get mainContainerDimension() { return dimension(); }
			override activeContainerOffset = { top: 0, quickPickTop: 16 };
			override mainContainerOffset = { top: 0, quickPickTop: 16 };
		override onDidLayoutMainContainer = Event.None;
		override onDidLayoutContainer = Event.None;
		override onDidLayoutActiveContainer = layoutChanged.event;
		override onDidAddContainer = Event.None;
		override onDidChangeActiveContainer = Event.None;
		override getContainer() { return host; }
		override whenContainerStylesLoaded() { return undefined; }
		override focus() { }
	}();
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(ILayoutService, layout);
			reg.define(IListService, ListService);
			reg.define(IQuickInputService, QuickInputService);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IKeybindingService, MotionFixtureKeybindingService);
			reg.defineInstance(IContextViewService, new class extends mock<IContextViewService>() {
				override anchorAlignment = 0;
				override showContextView() { return { close: () => { } }; }
				override hideContextView() { }
				override getContextViewElement() { return host; }
				override layout() { }
			}());
			reg.defineInstance(IContextMenuService, new class extends mock<IContextMenuService>() {
				override onDidShowContextMenu = Event.None;
				override onDidHideContextMenu = Event.None;
				override showContextMenu() { }
			}());
		},
	});
	services.stub(ICommandService, new TestCommandService(services));
	const quickInput = services.get(IQuickInputService);
	const keybindings = services.get(IKeybindingService);
	context.disposableStore.add(dom.addDisposableListener(host, dom.EventType.KEY_DOWN, event => {
		const keyEvent = new StandardKeyboardEvent(event);
		if (keybindings.dispatchEvent(keyEvent, keyEvent.target)) {
			keyEvent.preventDefault();
			keyEvent.stopPropagation();
		}
	}));
	const resize = context.disposableStore.add(new dom.DisposableResizeObserver('motionFixture.quickInput', () => layoutChanged.fire(dimension()), dom.getWindow(host)));
	context.disposableStore.add(resize.observe(host));
	let step: 'commands' | 'themes' = 'commands';
	const show = () => {
		pickerEvents.clear();
		const picker = quickInput.createQuickPick();
		pickerLifetime.value = picker;
		const showCommands = () => {
			step = 'commands';
			picker.title = localize('motion.fixture.commandPalette', "Command Palette");
			picker.placeholder = localize('motion.fixture.typeCommand', "Type the name of a command to run");
			picker.items = [{ label: localize('motion.fixture.themeCommand', "Preferences: Color Theme") }];
			picker.activeItems = [picker.items[0]];
		};
		showCommands();
		picker.ignoreFocusOut = true;
		pickerEvents.add(picker.onDidAccept(() => {
			if (step === 'commands') {
				step = 'themes';
				picker.value = '';
				picker.title = localize('motion.fixture.colorTheme', "Color Theme");
				picker.placeholder = localize('motion.fixture.selectTheme', "Select Color Theme");
				picker.items = [{ label: 'Dark Modern' }, { label: 'Light Modern' }, { label: 'Dark+ (default dark)' }, { label: 'Light+ (default light)' }];
				picker.activeItems = [picker.items[0]];
			} else {
				const selected = picker.selectedItems[0] ?? picker.activeItems[0];
				result.textContent = localize('motion.fixture.themeSelected', "Selected theme: {0}", selected.label);
				picker.hide();
			}
		}));
		pickerEvents.add(picker.onDidHide(() => { pickerEvents.clear(); clock.finish(); }));
		picker.show();
	};
	const playback = createPlayback(context, clock, show, () => pickerLifetime.value?.hide());
	observe(context, (_input, _reduced, replay) => { if (replay) { playback.play(); } }, () => {
		result.textContent = '';
		show();
	});
}

function renderAnchoredMenu(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.classList.add('modern-ui');
	const host = dom.append(context.container, dom.$('div.monaco-workbench'));
	host.style.position = 'relative';
	host.style.width = '100%';
	host.style.height = '320px';
	host.style.boxSizing = 'border-box';
	host.style.paddingTop = 'var(--vscode-spacing-size320)';
	host.style.display = 'flex';
	host.style.flexDirection = 'column';
	host.style.alignItems = 'center';
	host.style.justifyContent = 'flex-start';
	sceneHeading(host, localize('motion.fixture.automationSchedule', "Automation schedule"));
	const trigger = context.disposableStore.add(new Button(host, { ...defaultButtonStyles, secondary: true }));
	trigger.element.style.width = '280px';
	trigger.element.style.maxWidth = '100%';
	trigger.element.setAttribute('aria-label', localize('motion.fixture.repeatOn', "Repeat on"));
	const dimension = () => ({ width: host.clientWidth, height: host.clientHeight });
	const layout = new class extends mock<ILayoutService>() {
		override activeContainer = host;
		override mainContainer = host;
		override containers = [host];
		override get activeContainerDimension() { return dimension(); }
		override get mainContainerDimension() { return dimension(); }
		override onDidLayoutMainContainer = Event.None;
		override onDidLayoutContainer = Event.None;
		override onDidLayoutActiveContainer = Event.None;
		override onDidAddContainer = Event.None;
		override onDidChangeActiveContainer = Event.None;
		override getContainer() { return host; }
		override whenContainerStylesLoaded() { return undefined; }
		override focus() { }
	}();
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(ILayoutService, layout);
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IKeybindingService, MotionFixtureKeybindingService);
			reg.define(IActionWidgetService, ActionWidgetService);
		},
	});
	services.stub(ICommandService, new TestCommandService(services));
	const keybindings = services.get(IKeybindingService);
	context.disposableStore.add(dom.addDisposableListener(host, dom.EventType.KEY_DOWN, event => {
		const keyEvent = new StandardKeyboardEvent(event);
		if (keybindings.dispatchEvent(keyEvent, keyEvent.target)) {
			keyEvent.preventDefault();
			keyEvent.stopPropagation();
		}
	}));
	const dropdown = context.disposableStore.add(services.createInstance(MultiSelectDropdown));
	const finish = context.disposableStore.add(new MutableDisposable());
	const days = [
		localize('motion.fixture.monday', "Monday"), localize('motion.fixture.tuesday', "Tuesday"),
		localize('motion.fixture.wednesday', "Wednesday"), localize('motion.fixture.thursday', "Thursday"),
		localize('motion.fixture.friday', "Friday"), localize('motion.fixture.saturday', "Saturday"), localize('motion.fixture.sunday', "Sunday"),
	];
	let selected = [days[0], days[2], days[4]];
	const update = () => { trigger.label = selected.length ? selected.join(', ') : localize('motion.fixture.selectDays', "Select Days"); };
	const show = () => {
		clock.start();
		dropdown.show({ anchor: trigger.element, ariaLabel: localize('motion.fixture.repeatOn', "Repeat on"), sections: [{ label: localize('motion.fixture.days', "Days"), items: days.map(label => ({ id: label, label })) }], selectedIds: selected });
		finish.value = clock.finishWhenSettled();
	};
	context.disposableStore.add(trigger.onDidClick(show));
	context.disposableStore.add(dropdown.onDidChangeSelection(ids => { selected = [...ids]; update(); }));
	context.disposableStore.add(dropdown.onDidHide(() => { finish.value = clock.finishWhenSettled(); }));
	observe(context, (input, _reduced, replay) => {
		if (!replay) { return; }
		finish.clear();
		if (input.action === 'exit') {
			clock.start();
			dropdown.hide();
			finish.value = clock.finishWhenSettled();
		} else {
			show();
		}
	}, () => {
		finish.clear();
		dropdown.hide();
		selected = [days[0], days[2], days[4]];
		update();
	});
}

function renderInteraction(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	const surface = dom.append(context.container, dom.$('div'));
	const renderer: IListRenderer<string, HTMLElement> = {
		templateId: 'option',
		renderTemplate: element => {
			element.style.paddingInline = 'var(--vscode-spacing-size120)';
			return element;
		},
		renderElement: (label, _index, element) => { element.textContent = label; },
		disposeTemplate: () => { },
	};
	const list = context.disposableStore.add(new List<string>('motion-interaction', surface, {
		getHeight: () => 24,
		getTemplateId: () => 'option',
	}, [renderer], {
		multipleSelectionSupport: false,
		horizontalScrolling: false,
		accessibilityProvider: {
			getWidgetAriaLabel: () => localize('motion.fixture.options', "Options"),
			getWidgetRole: () => 'listbox',
			getRole: () => 'option',
			getAriaLabel: label => label,
		},
		keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: label => label },
	}));
	list.style(defaultListStyles);
	list.layout(72);
	list.splice(0, 0, [
		localize('motion.fixture.optionA', "Option A"),
		localize('motion.fixture.optionB', "Option B"),
		localize('motion.fixture.optionC', "Option C"),
	]);
	const completion = context.disposableStore.add(new MutableDisposable());
	observe(context, (_input, _reduced, replay) => {
		if (replay) {
			list.domFocus();
			list.setFocus([1]);
			completion.value = clock.finishWhenSettled();
		}
	}, () => {
		completion.clear();
		list.setFocus([]);
		list.setSelection([]);
	});
}

function renderContentReplacement(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.classList.add('interactive-session');
	context.container.style.alignItems = 'stretch';
	context.container.style.justifyContent = 'flex-start';
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.definePartialInstance(ITerminalChatService, { getTerminalInstanceByExecutionId: () => undefined });
			reg.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore));
		},
	});
	const response = dom.append(context.container, dom.$('.interactive-response.chat-persistent-progress'));
	const host = dom.append(response, dom.$('.value'));
	const renderContext: IChatContentPartRenderContext = {
		...chatContext(context),
		element: new class extends mock<IChatResponseViewModel>() { override readonly isComplete = false; }(),
		container: host,
	};
	const part = context.disposableStore.add(new MutableDisposable<ChatQuestionCarouselPart>());
	const finish = context.disposableStore.add(new MutableDisposable());
	let shouldAutoFocus = false;
	for (const event of ['click', 'keydown']) {
		context.disposableStore.add(dom.addDisposableListener(host, event, () => { shouldAutoFocus = true; }, true));
	}
	const reset = () => {
		finish.clear();
		shouldAutoFocus = false;
		// The interactive card is viewport-constrained; don't size its viewport from its own height.
		context.container.style.minHeight = '380px';
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel', allowSkip: true, answerPresentation: 'conversation',
			questions: [
				{ id: 'language', type: 'singleSelect', title: localize('motion.fixture.questionLanguage', "Which language should we use?"), options: [{ id: 'ts', label: 'TypeScript', value: 'typescript' }, { id: 'js', label: 'JavaScript', value: 'javascript' }], defaultValue: 'ts' },
				{ id: 'tests', type: 'singleSelect', title: localize('motion.fixture.questionTests', "Which tests should we add?"), options: [{ id: 'unit', label: localize('motion.fixture.unitTests', "Unit tests"), value: 'unit' }, { id: 'integration', label: localize('motion.fixture.integrationTests', "Integration tests"), value: 'integration' }], defaultValue: 'unit' },
			],
		};
		part.value = services.createInstance(ChatQuestionCarouselPart, carousel, renderContext, {
			get shouldAutoFocus() { return shouldAutoFocus; },
			onSubmit: answers => {
				carousel.isUsed = true;
				carousel.data = answers ? Object.fromEntries(answers) : undefined;
				context.container.style.minHeight = '0';
				clock.finish();
			},
		});
		dom.reset(host, part.value.domNode);
	};
	observe(context, (_input, _reduced, replay) => {
		if (replay && part.value) {
			clock.start();
			part.value.navigateToNextQuestion();
			finish.value = clock.finishWhenSettled();
		}
	}, reset);
}

async function renderDelayedContent(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	context.container.style.alignItems = 'stretch';
	const header = dom.append(context.container, dom.$('div'));
	header.style.display = 'flex';
	header.style.alignItems = 'center';
	header.style.justifyContent = 'space-between';
	sceneHeading(header, localize('motion.fixture.sessions', "Sessions"));
	const actions = dom.append(header, dom.$('div'));
	const host = dom.append(context.container, dom.$('div'));
	host.style.height = '260px';
	const status = dom.append(context.container, dom.$('p', { role: 'status' }));
	const changes = context.disposableStore.add(new Emitter<void>());
	const starts = context.disposableStore.add(new Emitter<string>());
	const ends = context.disposableStore.add(new Emitter<string>());
	const pending = context.disposableStore.add(new MutableDisposable());
	const settled = context.disposableStore.add(new MutableDisposable());
	let generation = 0;
	context.disposableStore.add(toDisposable(() => generation++));
	let variant: 'fast' | 'slow' | 'failure' = 'slow';
	const created = Date.now();
	const session = (id: string, label: string, minutesAgo: number): IAgentSession => ({
		resource: URI.parse(`vscode-chat-session://local/${id}`), providerType: 'local', providerLabel: 'Local',
		label, status: AgentSessionStatus.Completed, icon: Codicon.comment, timing: { created: created - minutesAgo * 60_000, lastRequestStarted: undefined, lastRequestEnded: undefined },
		isArchived: () => false, setArchived: () => { }, isPinned: () => false, setPinned: () => { }, isRead: () => true, isMarkedUnread: () => false, setRead: () => { },
	});
	const original = [session('navigation', 'Improve keyboard navigation', 2), session('parser', 'Review parser changes', 12), session('docs', 'Update documentation', 30)];
	let sessions = original;
	const model: IAgentSessionsModel = {
		get sessions() { return sessions; }, resolved: true, getSession: uri => sessions.find(session => session.resource.toString() === uri.toString()),
		observeSession: uri => constObservable(sessions.find(session => session.resource.toString() === uri.toString())),
		onDidChangeSessions: changes.event, onWillResolve: starts.event, onDidResolve: ends.event, onDidChangeSessionArchivedState: Event.None,
		resolve: async (_provider, onError) => {
			const current = ++generation;
			starts.fire('local');
			status.textContent = localize('motion.fixture.refreshingSessions', "Refreshing sessions...");
			await new Promise<void>(resolve => {
				const timer = clock.schedule(resolve, variant === 'fast' ? 30 : 1600);
				pending.value = toDisposable(() => { timer.dispose(); resolve(); });
			});
			if (generation !== current) { return; }
			if (variant === 'failure') {
				onError?.(new Error(localize('motion.fixture.refreshFailed', "Couldn't refresh sessions. Your existing sessions are still available.")));
			} else {
				sessions = [...original, session(`tests-${current}`, 'Review new test coverage', 40)];
				changes.fire();
				status.textContent = localize('motion.fixture.sessionsUpdated', "Sessions updated");
			}
			ends.fire('local');
		},
	};
	const services = workbenchInstantiationService(undefined, context.disposableStore);
	services.stub(IThemeService, createEditorServices(context.disposableStore, { colorTheme: context.theme }).get(IThemeService));
	services.stub(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore));
	services.stub(INotificationService, new class extends mock<INotificationService>() { override error(error: string | Error) { status.textContent = error instanceof Error ? error.message : error; } }());
	services.stub(IChatSessionsService, new class extends MockChatSessionsService {
		override getChatSessionContribution() { return undefined; }
		override async resolveChatSessionItem() { return undefined; }
	}());
	services.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
		override readonly pendingResponseVersion = constObservable(0);
		override hasPendingResponse() { return false; }
	}());
	services.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
		override readonly model = model;
		override readonly onDidChangeSessionArchivedState = Event.None;
		override getSession(resource: URI) { return model.getSession(resource); }
	}());
	const control = context.disposableStore.add(services.createInstance(AgentSessionsControl, host, {
		overrideStyles: {}, source: 'motionFixture', disableHover: true,
		filter: { onDidChange: Event.None, exclude: () => false, getExcludes: () => ({ providers: [], states: [], archived: false, read: false, repositoryGroupCapped: true }), isDefault: () => true, reset: () => { } },
		createNewChat: () => { }, getHoverPosition: () => HoverPosition.BELOW, trackActiveEditorSession: () => false,
		overrideSessionOpen: async resource => { status.textContent = localize('motion.fixture.sessionSelected', "Selected: {0}", model.getSession(resource)!.label); },
	}));
	control.layout(260, 440);
	let refreshing = false;
	const refresh = async () => {
		if (refreshing) { return; }
		refreshing = true;
		refreshAction.enabled = false;
		clock.start();
		const operation = control.refresh();
		const current = generation;
		try {
			await clock.waitFor(operation);
			if (current !== generation) { return; }
			settled.value = clock.finishWhenSettled();
		} finally {
			if (current === generation) {
				refreshing = false;
				refreshAction.enabled = true;
			}
		}
	};
	const refreshAction = context.disposableStore.add(new Action('workbench.action.chat.refreshAgentSessions', localize('motion.fixture.refreshSessions', "Refresh Sessions"), ThemeIcon.asClassName(Codicon.refresh), true, refresh));
	const toolbar = context.disposableStore.add(services.createInstance(WorkbenchToolBar, actions, { ariaLabel: localize('motion.fixture.sessionActions', "Session actions") }));
	toolbar.setActions([refreshAction]);
	observe(context, (input, _reduced, replay) => {
		variant = input.variant === 'fast' || input.variant === 'failure' ? input.variant : 'slow';
		if (replay) { void refresh().catch(onUnexpectedError); }
	}, () => {
		generation++;
		pending.clear();
		ends.fire('local');
		refreshing = false;
		refreshAction.enabled = true;
		settled.clear();
		sessions = original;
		changes.fire();
		status.textContent = localize('motion.fixture.sessionsCurrent', "Your recent sessions");
	});
	await control.update();
}

async function renderListeningColor(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	context.container.style.alignItems = 'stretch';
	const host = dom.append(context.container, dom.$('div'));
	await renderChatInput({ ...context, container: host }, {
		width: context.container.clientWidth - 32,
		voiceControl: 'voiceListening',
		voiceInputMode: true,
		focusInput: false,
	});
	const input = host.querySelector<HTMLElement>('.chat-input-container');
	if (!input) { throw new Error('Listening preview requires the product chat input.'); }
	const light = dom.append(input, dom.$('div'));
	light.style.position = 'absolute';
	light.style.inset = '0';
	light.style.borderRadius = 'inherit';
	const colors = resolveVoiceGlowColors(context.theme);
	const rim = context.disposableStore.add(new MutableDisposable<IVoiceRimLight>());
	const frames = context.disposableStore.add(new MutableDisposable());
	let working = false;
	let reduced = true;
	let visible = true;
	const draw = () => {
		frames.clear();
		if (!rim.value || !visible) { return; }
		if (!working || reduced) { rim.value.driveStatic(0.3); return; }
		rim.value.drive(0.3);
		frames.value = clock.schedule(draw, 0, true);
	};
	observe(context, (_input, nextReduced, replay) => {
		const changed = reduced !== nextReduced;
		reduced = nextReduced;
		if (replay) {
			working = true;
		}
		if (replay || changed) { draw(); }
	}, () => {
		working = false;
		frames.clear();
		rim.value ??= createVoiceRimLight(light, colors.listening, isDark(context.theme.type) ? 'dark' : 'light', 'cool', colors.background, { now: () => clock.now() / 1000 });
		draw();
	});
	observeVisibility(context, value => { visible = value; draw(); });
}

function renderControl(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	const setting = context.disposableStore.add(new CustomizationToggle({ ariaLabel: localize('motion.fixture.enableSkill', "Enable Code Review Skill"), checked: true }));
	const row = dom.append(context.container, dom.$('div'));
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = 'var(--vscode-spacing-size80)';
	row.append(setting.domNode, dom.$('span', undefined, localize('motion.fixture.reviewSkill', "Code review — skill")));
	const run = context.disposableStore.add(new MutableDisposable());
	observe(context, (_input, _reduced, replay) => {
		if (!replay) { return; }
		run.clear();
		setting.checked = false;
		run.value = clock.finishWhenSettled();
	}, () => { run.clear(); setting.checked = true; });
}

function renderSelection(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.style.display = 'flex';
	context.container.style.flexDirection = 'column';
	context.container.style.justifyContent = 'center';
	const title = localize('motion.fixture.reasoningEffort', "Reasoning effort");
	const label = dom.append(context.container, dom.$('p', undefined, title));
	label.style.margin = '0 0 var(--vscode-spacing-size80)';
	label.style.fontSize = 'var(--vscode-fontSize-label1)';
	const radio = context.disposableStore.add(createModelCardChoiceControl(title, [
		{ label: localize('motion.fixture.low', "Low"), checked: false },
		{ label: localize('motion.fixture.medium', "Medium"), checked: true },
		{ label: localize('motion.fixture.high', "High"), checked: false },
	]));
	context.container.append(radio.domNode);
	const run = context.disposableStore.add(new MutableDisposable());
	observe(context, (_input, _reduced, replay) => {
		if (!replay) { return; }
		run.clear();
		radio.setActiveItem(2);
		run.value = clock.finishWhenSettled();
	}, () => { run.clear(); radio.setActiveItem(1); });
}

function renderFindOptions(context: ComponentFixtureContext): void {
	const find = context.disposableStore.add(new FindInput(context.container, undefined, {
		label: localize('motion.fixture.find', "Find in editor"),
		placeholder: localize('motion.fixture.find', "Find in editor"),
		showCommonFindToggles: true,
		inputBoxStyles: defaultInputBoxStyles,
		toggleStyles: defaultToggleStyles,
	}));
	find.setValue('Editor');
	const source = 'const editor = createEditor();\neditor.focus();';
	const code = dom.append(context.container, dom.$('pre'));
	code.style.whiteSpace = 'pre-wrap';
	const result = dom.append(context.container, dom.$('p', { role: 'status' }));
	const update = () => {
		const query = find.getValue();
		let matches: RegExpMatchArray[] = [];
		try {
			const pattern = find.getRegex() ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const expression = new RegExp(find.getWholeWords() ? `\\b(?:${pattern})\\b` : pattern, find.getCaseSensitive() ? 'g' : 'gi');
			matches = query ? [...source.matchAll(expression)].filter(match => match[0].length > 0) : [];
		} catch { /* Invalid regular expressions are handled by the find input. */ }
		dom.clearNode(code);
		let offset = 0;
		for (const match of matches) {
			code.append(source.slice(offset, match.index));
			const mark = dom.append(code, dom.$('mark', undefined, match[0]));
			mark.style.background = 'var(--vscode-editor-findMatchHighlightBackground)';
			mark.style.color = 'inherit';
			offset = match.index! + match[0].length;
		}
		code.append(source.slice(offset));
		result.textContent = matches.length ? localize('motion.fixture.matches', "{0} matches", matches.length) : localize('motion.fixture.noMatches', "No results");
	};
	context.disposableStore.add(find.onInput(update));
	context.disposableStore.add(find.onDidOptionChange(() => {
		update();
		if (result.textContent === localize('motion.fixture.noMatches', "No results")) { find.highlightFindOptions(); }
	}));
	update();
	observe(context, () => { });
}

function chatContext(context: ComponentFixtureContext): IChatContentPartRenderContext {
	return {
		element: new class extends mock<IChatResponseViewModel>() { override readonly isComplete = true; }(),
		container: context.container, content: [], contentIndex: 0, elementIndex: 0,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		editorPool: undefined!, diffEditorPool: undefined!,
		codeBlockStartIndex: 0, treeStartIndex: 0,
		currentWidth: observableValue('currentWidth', 360),
		onDidChangeVisibility: Event.None,
	};
}

async function renderDisclosure(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	context.container.style.alignItems = 'stretch';
	context.container.style.justifyContent = 'flex-start';
	const host = dom.append(context.container, dom.$('div'));
	let chat: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: host }, {
		width: context.container.clientWidth - 32,
		height: 280,
		listHeight: 280,
		inputVisible: false,
		responseFooterAction: false,
		thinkingStyle: ThinkingDisplayMode.Collapsed,
		persistentProgress: ChatProgressAnimation.Draw,
		collapseCompletedResponses: false,
		messages: [{
			user: 'Review the changes',
			requestHidden: true,
			responseComplete: true,
			assistant: [
				{ kind: 'thinking', text: '**Checking the interaction**\n\nReview keyboard navigation and loading feedback while keeping the surrounding content readable.' },
				{ kind: 'markdown', text: 'The review is complete. Keyboard navigation and loading feedback work as expected.' },
			],
		}],
		additionalServices: reg => {
			reg.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore));
		},
		onRendered: handle => { chat = handle; },
	});
	const header = () => {
		const element = host.querySelector<HTMLElement>('.chat-thinking-box [aria-expanded]');
		if (!element) { throw new Error('Missing native reasoning disclosure'); }
		return element;
	};
	await waitForFixtureDomCondition(host, () => !!host.querySelector('.chat-thinking-box [aria-expanded]'), context.disposableStore);
	const layout = () => chat?.listWidget.layout(280, host.clientWidth);
	const resize = context.disposableStore.add(new dom.DisposableResizeObserver('motionFixture.disclosure', layout, dom.getWindow(host)));
	context.disposableStore.add(resize.observe(host));
	const run = context.disposableStore.add(new MutableDisposable());
	observe(context, (_input, _reduced, replay) => {
		if (!replay) { return; }
		run.clear();
		if (header().getAttribute('aria-expanded') === 'false') { header().click(); }
		run.value = clock.finishWhenSettled();
	}, () => {
		run.clear();
		if (header().getAttribute('aria-expanded') === 'true') { header().click(); }
	});
}

function createNotificationScene(context: ComponentFixtureContext): { stage: HTMLElement; model: NotificationsModel } {
	context.container.style.position = 'relative';
	context.container.style.alignItems = 'stretch';
	const stage = dom.append(context.container, dom.$('div.monaco-workbench'));
	stage.style.position = 'relative';
	stage.style.height = '120px';
	stage.style.overflow = 'hidden';
	const themeService = createEditorServices(context.disposableStore, { colorTheme: context.theme }).get(IThemeService);
	const services = workbenchInstantiationService(undefined, context.disposableStore);
	services.stub(IThemeService, themeService);
	const model = context.disposableStore.add(new NotificationsModel());
	context.disposableStore.add(toDisposable(() => { for (const notification of [...model.notifications]) { notification.close(); } }));
	const toasts = context.disposableStore.add(services.createInstance(NotificationsToasts, stage, model));
	const layout = () => toasts.layout(new dom.Dimension(stage.clientWidth, stage.clientHeight));
	layout();
	const resizeObserver = context.disposableStore.add(new dom.DisposableResizeObserver('motionFixture.notification', () => layout(), dom.getWindow(stage)));
	context.disposableStore.add(resizeObserver.observe(stage));
	return { stage, model };
}

async function renderNotification(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	const trigger = context.disposableStore.add(new Button(context.container, { ...defaultButtonStyles, secondary: true }));
	trigger.label = localize('motion.fixture.showNotification', "Show Notification");
	trigger.element.style.width = 'fit-content';
	const { stage, model } = createNotificationScene(context);
	const show = () => {
		return model.addNotification({ severity: Severity.Info, message: localize('motion.fixture.notification', "The operation completed successfully.") });
	};
	const hide = () => { for (const notification of [...model.notifications]) { notification.close(); } };
	show();
	await waitForFixtureDomCondition(stage, () => !!stage.querySelector('.notification-toast'), context.disposableStore);
	hide();
	const playback = createPlayback(context, clock, show, hide);
	context.disposableStore.add(trigger.onDidClick(() => playback.play()));
	observe(context, (_input, reduced, replay) => {
		stage.classList.toggle('monaco-reduce-motion', reduced);
		stage.classList.toggle('monaco-enable-motion', !reduced);
		if (replay) { playback.play(); }
	}, () => { playback.reset(); show(); });
}

async function renderProgress(context: ComponentFixtureContext, unknown: boolean, clock: MotionPreviewClock): Promise<void> {
	const { stage, model } = createNotificationScene(context);
	let amount = 10;
	const notification = model.addNotification({
		severity: Severity.Info,
		message: localize('motion.fixture.downloading', "Downloading..."),
		progress: unknown ? { infinite: true } : { total: 100, worked: amount },
	});
	await waitForFixtureDomCondition(stage, () => !!stage.querySelector('.monaco-progress-container.active'), context.disposableStore);
	const progress = notification.progress;
	const run = context.disposableStore.add(new MutableDisposable());
	const stop = (completed: boolean) => {
		progress.done();
		notification.updateMessage(completed ? localize('motion.fixture.complete', "Complete") : localize('motion.fixture.stopped', "Stopped"));
		clock.finish();
	};
	const reset = () => {
		run.clear();
		amount = 10;
		progress.done();
		progress.total(100);
		progress.worked(amount);
		notification.updateMessage(localize('motion.fixture.downloading', "Downloading..."));
	};
	observe(context, (input, _reduced, replay) => {
		if (input.action === 'reset' && unknown) { clock.previewLoops(); }
		if (!replay) { return; }
		if (!unknown) {
			reset();
			const increment = 5;
			const interval = 120;
			const advance = () => {
				amount = Math.min(100, amount + increment);
				progress.worked(increment);
				if (amount === 100) {
					notification.updateMessage(localize('motion.fixture.complete', "Complete"));
					progress.done();
					run.value = clock.finishWhenSettled();
				} else {
					run.value = clock.schedule(advance, interval);
				}
			};
			run.value = clock.schedule(advance, interval);
		} else if (input.action === 'working') {
			progress.infinite();
			notification.updateMessage(localize('motion.fixture.downloading', "Downloading..."));
		} else { stop(input.action === 'complete'); }
	}, () => {
		if (!unknown) { reset(); }
		else {
			run.clear();
			progress.done();
			progress.infinite();
			notification.updateMessage(localize('motion.fixture.downloading', "Downloading..."));
		}
	});
}

function renderActivity(context: ComponentFixtureContext, agent: boolean, clock: MotionPreviewClock, variant: 'grid' | 'ring' = 'grid'): void {
	const row = dom.append(context.container, dom.$('div', { role: 'status' }));
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = 'var(--vscode-spacing-size80)';
	const icon = dom.append(row, dom.$('span', { 'aria-hidden': 'true' }));
	const label = dom.append(row, dom.$('span'));
	const spinner = context.disposableStore.add(new MutableDisposable());
	let state: 'working' | 'input' | 'stop' | 'complete' = 'working';
	let working = true;
	let visible = true;
	const update = (next: typeof state) => {
		state = next;
		working = state === 'working';
		spinner.clear();
		dom.clearNode(icon);
		row.setAttribute('aria-busy', String(working));
		label.textContent = working ? agent ? localize('motion.fixture.reviewing', "Reviewing your changes...") : localize('motion.fixture.runningTests', "Running tests...")
			: state === 'input' ? localize('motion.fixture.inputNeeded', "Input needed")
				: state === 'complete' ? localize('motion.fixture.complete', "Complete") : localize('motion.fixture.stopped', "Stopped");
		if (working && agent) { spinner.value = createPixelSpinner(icon, { variant }); }
		else { icon.append(dom.$(`span${ThemeIcon.asCSSSelector(working ? ThemeIcon.modify(Codicon.loading, 'spin') : state === 'input' ? Codicon.question : state === 'complete' ? Codicon.check : Codicon.debugStop)}`)); }
		if (!agent && icon.firstElementChild instanceof HTMLElement) { icon.firstElementChild.style.animationPlayState = visible ? '' : 'paused'; }
	};
	update('working');
	observe(context, (input, _reduced, replay) => {
		const nextVariant = input.variant === 'grid' || input.variant === 'ring' ? input.variant : variant;
		const variantChanged = nextVariant !== variant;
		variant = nextVariant;
		const nextState = replay ? input.action === 'working' ? 'working' : input.action === 'input' ? 'input' : input.action === 'complete' ? 'complete' : 'stop' : state;
		if (nextState !== state || variantChanged) {
			update(nextState);
		}
		if (input.action === 'reset') { clock.previewLoops(); }
		if (replay && nextState !== 'working') { clock.finish(); }
	}, input => { variant = input.variant === 'grid' || input.variant === 'ring' ? input.variant : variant; update('working'); });
	if (!agent) {
		observeVisibility(context, value => {
			visible = value;
			if (icon.firstElementChild instanceof HTMLElement) { icon.firstElementChild.style.animationPlayState = visible ? '' : 'paused'; }
		});
	}
}

function renderCompletion(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	context.container.classList.add('monaco-workbench');
	sceneHeading(context.container, localize('motion.fixture.sessionTitle', "Improve keyboard navigation"));
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IConfigurationService, new TestConfigurationService({
				[ChatSessionArchiveActionWordingSettingId]: ChatSessionArchiveActionWording.MarkAsDone,
				[SESSIONS_MARK_AS_DONE_CONFETTI_SETTING]: true,
			}));
			reg.defineInstance(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
			reg.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(context.container, context.disposableStore));
		},
	});
	const host = dom.append(context.container, dom.$('div'));
	const result = dom.append(context.container, dom.$('p', { role: 'status' }));
	const nudge = context.disposableStore.add(new MutableDisposable<ChatSessionArchiveNudge>());
	const run = context.disposableStore.add(new MutableDisposable());
	const reset = () => {
		run.clear();
		result.textContent = '';
		nudge.value = services.createInstance(ChatSessionArchiveNudge, {
			hasWorktree: false, pullRequestCount: 1, compact: true,
			onArchive: async () => {
				nudge.value?.domNode.remove();
				result.textContent = localize('motion.fixture.sessionDone', "Session marked as done");
				run.value = clock.finishWhenSettled();
			},
			onDismiss: () => { nudge.clear(); },
			onOpenCleanupSettings: async () => { },
		});
		dom.reset(host, nudge.value.domNode);
	};
	observe(context, (_input, _reduced, replay) => {
		if (replay) {
			const button = nudge.value?.domNode.querySelector<HTMLElement>('.chat-session-archive-nudge-footer .monaco-button');
			if (!button) { throw new Error('Missing session completion action'); }
			button.click();
		}
	}, reset);
}

function renderWorkingLogo(context: ComponentFixtureContext, clock: MotionPreviewClock): void {
	let reduced = true;
	let active = false;
	let animation = ChatProgressAnimation.Draw;
	const logo = context.disposableStore.add(new ChatWorkingLogo(animation, 'stable', {
		now: () => clock.now(),
		scheduleFrame: (_window, runner) => clock.schedule(runner, 0, true),
		isMotionReduced: () => reduced,
	}));
	logo.setActive(active);
	const row = dom.append(context.container, dom.$('div'));
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = 'var(--vscode-spacing-size80)';
	const label = dom.$('span', { role: 'status' }, localize('motion.fixture.logoWorking', "Working on your request..."));
	row.append(logo.domNode, label);
	observe(context, (input, value, replay) => {
		reduced = value;
		if (replay) {
			logo.setActive(false);
			active = input.action === 'working';
			label.textContent = active ? localize('motion.fixture.logoWorking', "Working on your request...")
				: input.action === 'complete' ? localize('motion.fixture.workspaceReady', "Workspace ready") : localize('motion.fixture.stopped', "Stopped");
			if (!active) { clock.finish(); }
		}
		logo.setActive(active);
		const nextAnimation = reduced ? ChatProgressAnimation.Off : ChatProgressAnimation.Draw;
		if (nextAnimation !== animation) { animation = nextAnimation; logo.setAnimation(animation); }
	}, () => { active = false; logo.setActive(false); label.textContent = localize('motion.fixture.logoWorking', "Working on your request..."); });
}

async function renderImageGeneration(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	sceneHeading(context.container, localize('motion.fixture.imageRequest', "Create an illustration of a mountain lake"));
	const stage = dom.append(context.container, dom.$('div'));
	let started = clock.now();
	let working = false;
	const services = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => registration.defineInstance(IAccessibilityService, new FixtureMotionAccessibilityService(stage, context.disposableStore)),
	});
	const invocation: IChatToolInvocationSerialized = {
		kind: 'toolInvocationSerialized', toolId: 'image_generation', toolCallId: 'motion-image-generation',
		invocationMessage: localize('motion.fixture.generatingImage', "Generating image"),
		originMessage: undefined, pastTenseMessage: undefined, presentation: undefined,
		isConfirmed: true, isComplete: false, source: undefined,
	};
	class PreviewGlyphSurface extends GlyphSurface {
		protected override now(): number { return clock.now() - started; }
		protected override scheduleFrame(_window: Window, runner: () => void): IDisposable { return clock.schedule(runner, 0, true); }
	}
	class PreviewImageGeneration extends ChatImageGenerationProgressPart {
		protected override createSurface(container: HTMLElement, instantiationService: IInstantiationService): GlyphSurface {
			return instantiationService.createInstance(PreviewGlyphSurface, container);
		}
	}
	const part = context.disposableStore.add(new MutableDisposable<ChatImageGenerationProgressPart>());
	const mount = () => {
		const next = services.createInstance(PreviewImageGeneration, invocation);
		part.value = next;
		next.domNode.style.setProperty('--chat-generated-image-max-height', 'calc(var(--vscode-spacing-size400) * 6)');
		next.domNode.style.margin = '0';
		next.domNode.style.display = 'flex';
		next.domNode.style.justifyContent = 'flex-start';
		dom.reset(stage, next.domNode);
	};
	context.disposableStore.add(toDisposable(() => dom.clearNode(stage)));
	observe(context, (input, reduced, replay) => {
		if (input.action === 'reset') { working = false; }
		else if (replay) { working = input.action === 'working'; started = clock.now(); }
		stage.classList.toggle('monaco-reduce-motion', reduced || !working);
		if (input.action === 'reset' || working) {
			if (!part.value) { mount(); }
		} else if (replay) {
			part.clear();
			dom.reset(stage, dom.$('p', { role: 'status' }, localize('motion.fixture.generationStopped', "Image generation stopped")));
			clock.finish();
		}
	});
	await waitForFixtureCondition(() => {
		if (!part.value) { return true; }
		const canvas = part.value.domNode.querySelector('canvas');
		if (!canvas || canvas.width === 0 || canvas.height === 0) { return false; }
		const drawing = canvas.getContext('2d');
		return !!drawing?.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
	}, 'Image generation preview did not paint its loading surface.');
}

async function renderBlobby(context: ComponentFixtureContext, clock: MotionPreviewClock): Promise<void> {
	sceneHeading(context.container, localize('motion.fixture.chatCompanion', "Chat companion"));
	configureChatPetFixtureFileRoot(context.disposableStore);
	const sources = getChatPetSpriteSources('stable');
	const states = ['painting', 'cool'] as const;
	const images = new Map<string, HTMLImageElement>();
	await Promise.all(states.flatMap(state => [sources[state].animated, sources[state].reducedMotion]).map(async source => {
		const image = dom.$<HTMLImageElement>('img', { src: source.url });
		await image.decode();
		if (!hasChatPetBodyImageDimensions(image, source.frameWidth, source.frameHeight ?? 96, source.frameCount)) {
			throw new Error(`Invalid Blobby preview sprite dimensions: ${source.url}`);
		}
		images.set(source.url, image);
	}));
	const stage = dom.append(context.container, dom.$('div'));
	stage.style.display = 'flex';
	stage.style.alignItems = 'center';
	stage.style.gap = 'var(--vscode-spacing-size120)';
	stage.style.minHeight = '120px';
	const canvas = dom.append(stage, dom.$<HTMLCanvasElement>('canvas', { 'aria-hidden': 'true' }));
	canvas.width = Math.max(...states.map(state => sources[state].animated.frameWidth));
	canvas.height = Math.max(...states.map(state => sources[state].animated.frameHeight ?? 96));
	canvas.style.width = `${canvas.width}px`;
	canvas.style.height = `${canvas.height}px`;
	canvas.style.imageRendering = 'pixelated';
	const drawing = canvas.getContext('2d');
	if (!drawing) { throw new Error('Blobby preview requires a canvas rendering context.'); }
	drawing.imageSmoothingEnabled = false;
	const label = dom.append(stage, dom.$('span', { role: 'status' }));
	const run = context.disposableStore.add(new MutableDisposable());
	let state: typeof states[number] = 'painting';
	let working = false;
	let reduced = true;
	let visible = true;
	let finished = false;
	let started = clock.now();
	const draw = () => {
		run.clear();
		if (!visible) { return; }
		const source = !working || reduced ? sources[state].reducedMotion : sources[state].animated;
		const image = images.get(source.url);
		if (!image) { throw new Error(`Missing Blobby preview sprite: ${source.url}`); }
		const frame = getChatPetAnimationFrame(source.frameDurations, clock.now() - started, source.iterations);
		const index = source.frameIndices?.[frame.frameIndex] ?? frame.frameIndex;
		drawing.clearRect(0, 0, canvas.width, canvas.height);
		drawChatPetComposite(drawing, image, undefined, index, source.accessoryRigFrame ?? index, source.frameWidth, source.frameHeight ?? 96, 'right', state, source.fixedOrientationDecorations);
		if (!frame.complete) { run.value = clock.schedule(draw, frame.nextFrameDelay); }
		else if (working && state === 'cool' && !finished) { finished = true; clock.finish(); }
	};
	observe(context, (input, value, replay) => {
		reduced = value;
		if (input.action === 'reset') { working = false; state = 'painting'; }
		else if (replay) {
			working = input.action !== 'stop';
			state = input.action === 'enter' ? 'cool' : 'painting';
			started = clock.now();
			finished = false;
		}
		label.textContent = !working ? localize('motion.fixture.blobby', "Blobby")
			: state === 'cool' ? localize('motion.fixture.blobbyCool', "Blobby keeps it cool") : localize('motion.fixture.blobbyPainting', "Blobby paints");
		draw();
		if (replay && !working) { clock.finish(); }
	});
	observeVisibility(context, value => { visible = value; draw(); });
}
