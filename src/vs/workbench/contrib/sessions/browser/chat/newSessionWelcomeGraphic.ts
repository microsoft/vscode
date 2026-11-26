/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newSessionWelcomeGraphic.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowUsage } from '../../../chat/common/agentsWindowUsage.js';
import { NEW_SESSION_WELCOME_GRAPHIC_SETTING, NEW_SESSION_WELCOME_GRAPHICS, NewSessionWelcomeGraphicKind } from '../../common/chatConstants.js';

/** The graphic shows until the user has started this many sessions from the Agents window. */
const WELCOME_GRAPHIC_SESSION_LIMIT = 2;

export interface INewSessionWelcomeGraphicOptions {
	/** The column of the new-session view that the graphic is appended to, above its welcome message and composer. */
	readonly content: HTMLElement;
	/** The fixed-height host of {@link content}. The graphic collapses when both cannot fit in it, so the composer is never clipped. */
	readonly layoutRoot: HTMLElement;
	/** Whether the new-session view is shown. */
	readonly visible: IObservable<boolean>;
	/** Whether the user is writing a prompt, which pauses the graphic's motion. */
	readonly composing: IObservable<boolean>;
}

/**
 * The graphic that introduces the Agents window above the welcome message of a new session, as configured by
 * {@link NEW_SESSION_WELCOME_GRAPHIC_SETTING}, until the user has started {@link WELCOME_GRAPHIC_SESSION_LIMIT} sessions.
 */
export class NewSessionWelcomeGraphic extends Disposable {

	private static _nextId = 0;

	readonly element: HTMLElement;
	private readonly _id = NewSessionWelcomeGraphic._nextId++;
	private readonly _scheduledFit = this._register(new MutableDisposable());

	constructor(
		private readonly _options: INewSessionWelcomeGraphicOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this.element = dom.append(_options.content, dom.$('.new-session-welcome-graphic', { role: 'img' }));
		this.element.hidden = true;

		const usage = new AgentsWindowUsage(storageService);
		const isNewUser = observableFromEvent(this, usage.onDidChangeCreatedSessionCount(this._store), () => usage.createdSessionCount < WELCOME_GRAPHIC_SESSION_LIMIT);
		const configuredKind = observableConfigValue<string>(NEW_SESSION_WELCOME_GRAPHIC_SETTING, 'none', configurationService);
		const kind = derived(this, reader => {
			if (!isNewUser.read(reader)) {
				return 'none';
			}
			const value = configuredKind.read(reader);
			return NEW_SESSION_WELCOME_GRAPHICS.find(candidate => candidate === value) ?? 'none';
		});

		this._register(autorun(reader => {
			// Every arm, including the one without a graphic, reaches this moment for the same new users.
			if (isNewUser.read(reader) && _options.visible.read(reader)) {
				logSettingExperimentTrigger(telemetryService, NEW_SESSION_WELCOME_GRAPHIC_SETTING);
			}
		}));
		this._register(autorun(reader => this._render(kind.read(reader))));
		this._register(autorun(reader => this.element.classList.toggle('paused', _options.composing.read(reader))));

		// Fits the graphic in the next frame: changing the observed content from the observer would loop it.
		const resizeObserver = this._register(new dom.DisposableResizeObserver('NewSessionWelcomeGraphic', () => {
			this._scheduledFit.value ??= dom.scheduleAtNextAnimationFrame(dom.getWindow(this.element), () => {
				this._scheduledFit.clear();
				this._updateFit();
			});
		}, dom.getWindow(_options.layoutRoot)));
		this._register(resizeObserver.observe(_options.layoutRoot));
		this._register(resizeObserver.observe(_options.content));
	}

	private _render(kind: NewSessionWelcomeGraphicKind): void {
		const graphic = kind === 'none' ? undefined : this._createGraphic(kind);
		this.element.hidden = !graphic;
		if (graphic) {
			this.element.setAttribute('aria-label', graphic.label);
			dom.reset(this.element, graphic.content);
		} else {
			this.element.removeAttribute('aria-label');
			dom.clearNode(this.element);
		}
		this._updateFit();
	}

	/** Collapses the graphic when the view is too short to show it above the welcome message and the composer. */
	private _updateFit(): void {
		const root = this._options.layoutRoot;
		if (this.element.hidden || !root.isConnected) {
			return;
		}
		const targetWindow = dom.getWindow(root);
		const rootStyle = targetWindow.getComputedStyle(root);
		const available = root.clientHeight - parseFloat(rootStyle.paddingTop) - parseFloat(rootStyle.paddingBottom);
		if (available <= 0) {
			return;
		}
		// A collapsed graphic is taken out of the flow but keeps its size, so it can be measured either way.
		const collapsed = this.element.classList.contains('collapsed');
		const graphicHeight = this.element.offsetHeight + parseFloat(targetWindow.getComputedStyle(this.element).marginBottom);
		const otherContentHeight = this._options.content.offsetHeight - (collapsed ? 0 : graphicHeight);
		this.element.classList.toggle('collapsed', otherContentHeight + graphicHeight > available);
	}

	private _createGraphic(kind: Exclude<NewSessionWelcomeGraphicKind, 'none'>): { readonly content: HTMLElement; readonly label: string } {
		switch (kind) {
			case 'windowOverview':
				return { content: this._windowOverview(), label: windowOverviewLabel() };
			case 'windowOverviewStatic':
				return { content: windowOverviewStatic(), label: windowOverviewLabel() };
			case 'workingCopies':
				return { content: this._workingCopies(), label: workingCopiesLabel() };
			case 'workingCopiesStatic':
				return { content: workingCopiesStatic(), label: workingCopiesLabel() };
			case 'windowComparison':
				return { content: this._windowComparison(), label: windowComparisonLabel() };
		}
	}

	/** One task in a window that splits into tasks side by side, with the window labels trading emphasis. */
	private _windowOverview(): HTMLElement {
		return dom.$('.welcome-graphic-figure', { 'aria-hidden': 'true' },
			diagram('0 0 360 134',
				this._skeletonDefs(),
				...windowHeader(134),
				...parallelTasks(this._skeletonFill()),
			),
		);
	}

	/** A project that splits into sessions in separate copies of it, joined by a session in another project. */
	private _workingCopies(): HTMLElement {
		const fill = this._skeletonFill();
		return dom.$('.welcome-graphic-figure', { 'aria-hidden': 'true' },
			diagram('0 0 360 174',
				this._skeletonDefs(),
				...windowHeader(174),
				svg('g', {},
					svg('rect', { class: 'welcome-graphic-outline welcome-graphic-motion welcome-graphic-project', x: 8, y: 36, width: 344, height: 128, rx: 3 }),
					projectName(18, localize('newSession.welcomeGraphic.projectA', "Project A")),
					svg('g', {},
						svg('rect', { class: 'welcome-graphic-copy welcome-graphic-motion welcome-graphic-reveal', x: 16, y: 68, width: 101, height: 86, rx: 3 }),
						...workingCopyContent(26, 8, fill),
					),
					svg('g', { class: 'welcome-graphic-motion welcome-graphic-extra' },
						svg('rect', { class: 'welcome-graphic-copy', x: 125, y: 68, width: 101, height: 86, rx: 3 }),
						...workingCopyContent(135, 0, fill),
					),
				),
				svg('g', { class: 'welcome-graphic-motion welcome-graphic-last' },
					svg('rect', { class: 'welcome-graphic-outline', x: 242, y: 36, width: 110, height: 128, rx: 3 }),
					projectName(252, localize('newSession.welcomeGraphic.projectB', "Project B")),
					svg('rect', { class: 'welcome-graphic-copy', x: 250, y: 68, width: 94, height: 86, rx: 3 }),
					...workingCopyContent(260, 0, fill),
				),
			),
		);
	}

	/** The window overview below a sentence that contrasts the two windows, both trading emphasis as the tasks split. */
	private _windowComparison(): HTMLElement {
		const editor = dom.$('span.welcome-graphic-motion.welcome-graphic-editor', undefined, localize('newSession.welcomeGraphic.oneTask', "One task at a time"));
		const agents = dom.$('span.welcome-graphic-motion.welcome-graphic-agents', undefined, localize('newSession.welcomeGraphic.parallelTasks', "parallel tasks across copies and projects"));
		return dom.$('.welcome-graphic-figure.welcome-graphic-comparison', { 'aria-hidden': 'true' },
			dom.$('.welcome-graphic-modes', undefined,
				dom.$('span.welcome-graphic-motion.welcome-graphic-editor', undefined, editorWindowLabel()),
				dom.$('span.welcome-graphic-motion.welcome-graphic-agents', undefined, agentsWindowLabel()),
			),
			dom.$('.welcome-graphic-sentence', undefined,
				...formatWithElements(localize({ key: 'newSession.welcomeGraphic.comparison', comment: ['{0} is "One task at a time", {1} is "parallel tasks across copies and projects"'] }, "{0}, or {1}."), [editor, agents]),
			),
			diagram('0 28 360 104',
				this._skeletonDefs(),
				...parallelTasks(this._skeletonFill()),
			),
		);
	}

	/** The shimmer that runs over the lines of a skeleton while its task works. */
	private _skeletonDefs(): SVGElement {
		return svg('defs', {},
			svg('linearGradient', { id: this._gradientId },
				svg('stop', { class: 'welcome-graphic-wave-edge', offset: 0 }),
				svg('stop', { class: 'welcome-graphic-wave-center', offset: 0.5 }),
				svg('stop', { class: 'welcome-graphic-wave-edge', offset: 1 }),
			),
			svg('clipPath', { id: this._clipId, clipPathUnits: 'userSpaceOnUse' },
				svg('rect', { x: 0, y: 71.5, width: 68, height: 3, rx: 1.5 }),
				svg('rect', { x: 0, y: 80.5, width: 48, height: 3, rx: 1.5 }),
				svg('rect', { x: 0, y: 89.5, width: 58, height: 3, rx: 1.5 }),
			),
		);
	}

	private _skeletonFill(): ISkeletonFill {
		return { gradient: `url(#${this._gradientId})`, clip: `url(#${this._clipId})` };
	}

	private get _gradientId(): string {
		return `new-session-welcome-graphic-gradient-${this._id}`;
	}

	private get _clipId(): string {
		return `new-session-welcome-graphic-clip-${this._id}`;
	}
}

/** Fills the lines of an animated skeleton with a shimmer. */
interface ISkeletonFill {
	readonly gradient: string;
	readonly clip: string;
}

type SvgAttributes = Record<string, string | number>;

/** Creates an SVG element. Classes go in its `class` attribute: an SVG element's `className` cannot be assigned. */
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: SvgAttributes, ...children: (Node | string)[]): SVGElementTagNameMap[K] {
	return dom.$.SVG<SVGElementTagNameMap[K]>(tag, attributes, ...children);
}

function diagram(viewBox: string, ...children: Node[]): SVGSVGElement {
	return svg('svg', { class: 'welcome-graphic-diagram', viewBox, fill: 'none', focusable: 'false' }, ...children);
}

/** Splits `template` at its `{n}` placeholders and puts `elements[n]` in their place. */
function formatWithElements(template: string, elements: readonly Node[]): (Node | string)[] {
	const result: (Node | string)[] = [];
	let lastIndex = 0;
	for (const match of template.matchAll(/\{(?<index>\d+)\}/g)) {
		result.push(template.slice(lastIndex, match.index));
		result.push(elements[Number(match.groups?.index)] ?? match[0]);
		lastIndex = match.index + match[0].length;
	}
	result.push(template.slice(lastIndex));
	return result.filter(part => part !== '');
}

function editorWindowLabel(): string {
	return localize('newSession.welcomeGraphic.editorWindow', "Editor window");
}

function agentsWindowLabel(): string {
	return localize('newSession.welcomeGraphic.agentsWindow', "Agents window");
}

function windowOverviewLabel(): string {
	return localize('newSession.welcomeGraphic.windowOverview.label', "Illustration: the editor window works on one task at a time, while the Agents window runs several tasks side by side.");
}

function workingCopiesLabel(): string {
	return localize('newSession.welcomeGraphic.workingCopies.label', "Illustration: three sessions in the Agents window, each with its own working folder. Two sessions work on different changes in separate copies of Project A, and a third works in Project B.");
}

function windowComparisonLabel(): string {
	return localize('newSession.welcomeGraphic.windowComparison.label', "Illustration: the editor window works on one task at a time, while the Agents window runs parallel tasks across copies and projects.");
}

/** The frame of an animated window, with its title row naming the editor window and the Agents window. */
function windowHeader(height: number): SVGElement[] {
	return [
		svg('rect', { class: 'welcome-graphic-outline', x: 0.5, y: 0.5, width: 359, height: height - 1, rx: 4 }),
		svg('path', { class: 'welcome-graphic-outline', d: 'M1 28.5h358' }),
		svg('text', { class: 'welcome-graphic-label welcome-graphic-motion welcome-graphic-editor', x: 12, y: 14.5 }, editorWindowLabel()),
		svg('text', { class: 'welcome-graphic-label welcome-graphic-motion welcome-graphic-agents', x: 348, y: 14.5, 'text-anchor': 'end' }, agentsWindowLabel()),
	];
}

/** A task that shrinks to make room for two more beside it. */
function parallelTasks(fill: ISkeletonFill): SVGElement[] {
	return [
		svg('rect', { class: 'welcome-graphic-outline welcome-graphic-motion welcome-graphic-workspace', x: 8, y: 36, width: 344, height: 88, rx: 3 }),
		skeleton(18, { fill, prompt: true }),
		svg('g', { class: 'welcome-graphic-motion welcome-graphic-extra' },
			svg('rect', { class: 'welcome-graphic-outline', x: 125.333333, y: 36, width: 109.333333, height: 88, rx: 3 }),
			skeleton(135.333333, { fill, prompt: true }),
		),
		svg('g', { class: 'welcome-graphic-motion welcome-graphic-last' },
			svg('rect', { class: 'welcome-graphic-outline', x: 242.666667, y: 36, width: 109.333333, height: 88, rx: 3 }),
			skeleton(252.666667, { fill, prompt: true }),
		),
	];
}

/** The lines of a task's progress, with an optional shimmer and the prompt that directs it. */
function skeleton(x: number, options: { readonly fill?: ISkeletonFill; readonly prompt?: boolean }): SVGGElement {
	const group = svg('g', { transform: `translate(${x} -18)` },
		svg('path', { class: 'welcome-graphic-line', d: 'M0 73h68m-68 9h48m-48 9h58' }),
	);
	if (options.fill) {
		group.append(svg('g', { 'clip-path': options.fill.clip },
			svg('rect', { class: 'welcome-graphic-wave', x: 0, y: 71.5, width: 68, height: 21, fill: options.fill.gradient }),
		));
	}
	if (options.prompt) {
		group.append(svg('g', { class: 'welcome-graphic-prompt' },
			svg('rect', { x: 0, y: 108, width: 89, height: 24, rx: 3 }),
			svg('path', { class: 'welcome-graphic-prompt-send', d: 'M78 125v-6m-3 3 3-3 3 3' }),
		));
	}
	return group;
}

function projectName(x: number, name: string): SVGTextElement {
	return svg('text', { class: 'welcome-graphic-project-name', x, y: 55 }, name);
}

/** A file and the progress of the session that works in one copy of a project. */
function workingCopyContent(x: number, progressOffset: number, fill?: ISkeletonFill): SVGElement[] {
	return [
		svg('path', { class: 'welcome-graphic-file-icon', d: `M${x} 81h5l3 3v7h-8Zm5 0v3h3` }),
		svg('path', { class: 'welcome-graphic-file-label', d: `M${x + 19} 86h32` }),
		svg('g', { transform: `translate(${progressOffset} 55)` }, skeleton(x - progressOffset, { fill })),
	];
}

/** A labelled window of a static comparison. */
function staticWindow(label: string, viewBox: string, ...children: Node[]): HTMLElement {
	return dom.$('.welcome-graphic-window', undefined,
		dom.$('span.welcome-graphic-window-label', undefined, label),
		diagram(viewBox, ...children),
	);
}

function staticComparison(editorWindow: HTMLElement, agentsWindow: HTMLElement): HTMLElement {
	return dom.$('.welcome-graphic-figure.welcome-graphic-windows', { 'aria-hidden': 'true' },
		editorWindow,
		svg('svg', { class: 'welcome-graphic-arrow', viewBox: '0 0 44 12', fill: 'none', focusable: 'false' },
			svg('path', { d: 'M1 6h37', stroke: 'currentColor', 'stroke-dasharray': '1 2' }),
			svg('path', { d: 'm38 2 6 4-6 4Z', fill: 'currentColor' }),
		),
		agentsWindow,
	);
}

function windowOverviewStatic(): HTMLElement {
	return staticComparison(
		staticWindow(editorWindowLabel(), '0 28 360 106',
			svg('rect', { class: 'welcome-graphic-outline', x: 8, y: 36, width: 344, height: 88, rx: 3 }),
			skeleton(18, { prompt: true }),
		),
		staticWindow(agentsWindowLabel(), '0 28 360 106',
			...[8, 125.333333, 242.666667].flatMap(x => [
				svg('rect', { class: 'welcome-graphic-outline', x, y: 36, width: 109.333333, height: 88, rx: 3 }),
				skeleton(x + 10, { prompt: true }),
			]),
		),
	);
}

function workingCopiesStatic(): HTMLElement {
	const projectA = localize('newSession.welcomeGraphic.projectA', "Project A");
	return staticComparison(
		staticWindow(editorWindowLabel(), '0 28 360 146',
			svg('rect', { class: 'welcome-graphic-outline', x: 8, y: 36, width: 344, height: 128, rx: 3 }),
			projectName(18, projectA),
			...workingCopyContent(26, 8),
		),
		staticWindow(agentsWindowLabel(), '0 28 360 146',
			svg('rect', { class: 'welcome-graphic-outline', x: 8, y: 36, width: 226, height: 128, rx: 3 }),
			projectName(18, projectA),
			svg('rect', { class: 'welcome-graphic-copy', x: 16, y: 68, width: 101, height: 86, rx: 3 }),
			...workingCopyContent(26, 8),
			svg('rect', { class: 'welcome-graphic-copy', x: 125, y: 68, width: 101, height: 86, rx: 3 }),
			...workingCopyContent(135, 0),
			svg('rect', { class: 'welcome-graphic-outline', x: 242, y: 36, width: 110, height: 128, rx: 3 }),
			projectName(252, localize('newSession.welcomeGraphic.projectB', "Project B")),
			svg('rect', { class: 'welcome-graphic-copy', x: 250, y: 68, width: 94, height: 86, rx: 3 }),
			...workingCopyContent(260, 0),
		),
	);
}
