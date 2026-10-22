/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsWindowGraphic.css';
import { $, reset, setVisibility } from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isWorkspaceIdentifier } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration, getAgentsWindowGraphicVariant, getAgentsWindowSectionStyle } from '../../common/constants.js';

/** A graphic that can be shown. {@link AgentsWindowGraphicVariant.Auto} resolves to one of these. */
export type AgentsWindowGraphicDesign = AgentsWindowGraphicVariant.WindowComparison | AgentsWindowGraphicVariant.ManyWindowsToOne;

/**
 * Picks the graphic for a variant, or `undefined` for none. {@link AgentsWindowGraphicVariant.Auto} picks
 * {@link AgentsWindowGraphicVariant.ManyWindowsToOne} when more than one editor window is open and
 * {@link AgentsWindowGraphicVariant.WindowComparison} otherwise, and shows nothing while that is unknown.
 */
export function resolveAgentsWindowGraphicDesign(variant: AgentsWindowGraphicVariant, hasMultipleEditorWindows: boolean | undefined): AgentsWindowGraphicDesign | undefined {
	switch (variant) {
		case AgentsWindowGraphicVariant.WindowComparison:
		case AgentsWindowGraphicVariant.ManyWindowsToOne:
			return variant;
		case AgentsWindowGraphicVariant.Auto:
			if (hasMultipleEditorWindows === undefined) {
				return undefined;
			}
			return hasMultipleEditorWindows ? AgentsWindowGraphicVariant.ManyWindowsToOne : AgentsWindowGraphicVariant.WindowComparison;
		default:
			return undefined;
	}
}

/**
 * Shows the graphic selected by {@link ChatConfiguration.WelcomePageAgentsWindowGraphic}
 * and updates it when the setting changes. The element is hidden while no graphic is shown.
 */
export class AgentsWindowGraphic extends Disposable {

	readonly element: HTMLElement;

	private readonly _shownDesign = observableValue<AgentsWindowGraphicDesign | undefined>(this, undefined);
	/** The graphic rendered in {@link element}, or `undefined` when none is. Changes after the element has been updated. */
	readonly shownDesign: IObservable<AgentsWindowGraphicDesign | undefined> = this._shownDesign;

	/**
	 * How the graphic, its captions and the Agents window button should be set apart from the rest of the page,
	 * see {@link ChatConfiguration.WelcomePageAgentsWindowSectionStyle}. The page that shows the graphic applies it.
	 */
	readonly sectionStyle: IObservable<AgentsWindowSectionStyle>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this.element = $('.agents-window-graphic-container');

		const variant = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic)),
			() => getAgentsWindowGraphicVariant(configurationService),
		);
		this.sectionStyle = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.WelcomePageAgentsWindowSectionStyle)),
			() => getAgentsWindowSectionStyle(configurationService),
		);

		// Count the editor windows when the graphic is shown, and only when the graphic depends on them
		const hasMultipleEditorWindows = observableValue<boolean | undefined>(this, undefined);
		this._register(autorun(reader => {
			if (variant.read(reader) !== AgentsWindowGraphicVariant.Auto) {
				return;
			}
			let disposed = false;
			reader.store.add(toDisposable(() => disposed = true));
			const update = async () => {
				let hasMultiple = false;
				try {
					hasMultiple = await countEditorWindows(hostService, environmentService) > 1;
				} catch (error) {
					onUnexpectedError(error);
				}
				if (!disposed) {
					hasMultipleEditorWindows.set(hasMultiple, undefined);
				}
			};
			update();
		}));

		const design = derived(this, reader => resolveAgentsWindowGraphicDesign(variant.read(reader), hasMultipleEditorWindows.read(reader)));
		this._register(autorun(reader => {
			const shownDesign = design.read(reader);
			reset(this.element, ...(shownDesign ? [renderAgentsWindowGraphic(shownDesign)] : []));
			setVisibility(!!shownDesign, this.element);
			this._shownDesign.set(shownDesign, undefined);
		}));
	}
}

/** Counts the open editor windows, without the Agents window. */
async function countEditorWindows(hostService: IHostService, environmentService: IWorkbenchEnvironmentService): Promise<number> {
	const windows = await hostService.getWindows({ includeAuxiliaryWindows: false });
	return windows.filter(window => !(isWorkspaceIdentifier(window.workspace) && isEqual(window.workspace.configPath, environmentService.agentSessionsWorkspace))).length;
}

/**
 * Renders a graphic and its captions.
 * The drawings are decorative and hidden from screen readers; the captions carry their meaning.
 */
export function renderAgentsWindowGraphic(design: AgentsWindowGraphicDesign): HTMLElement {
	const ids = new GraphicIds();
	switch (design) {
		case AgentsWindowGraphicVariant.WindowComparison:
			return $('.agents-window-graphic.window-comparison', {},
				figure(
					graphicSvg(300, 180, editorWindow(ids, 0, 0)),
					localize('agentsWindowGraphic.editorWindow.title', "Editor window"),
					localize('agentsWindowGraphic.editorWindow.description', "Work on one task at a time, with AI at your side."),
				),
				figure(
					graphicSvg(300, 180, agentsWindow(ids, 0, 0, false, windowComparisonProjects)),
					localize('agentsWindowGraphic.agentsWindow.title', "Agents window"),
					localize('agentsWindowGraphic.agentsWindow.description', "Run multiple tasks at the same time, isolated from each other."),
					localize('agentsWindowGraphic.new', "New"),
				),
			);
		case AgentsWindowGraphicVariant.ManyWindowsToOne:
			return $('.agents-window-graphic.many-windows-to-one', {},
				figure(
					graphicSvg(672, 204,
						...agentsWindowProjects.map(({ color, sessions }, index) => projectEditorWindow(ids, 8 + 32 * index, 8 + 36 * index, color, sessions[0].state)),
						svg('path', 'awg-arrow', { d: 'M290 104H340M333 97L340 104L333 111' }),
						agentsWindow(ids, 364, 14, true, agentsWindowProjects),
					),
					undefined,
					localize('agentsWindowGraphic.manyWindowsToOne.description', "All your projects and agents, in one window."),
				),
			);
	}
}

type ProjectColor = 'blue' | 'purple' | 'orange';
type AgentState = 'working' | 'waiting' | 'done';

/** A project and its sessions in the Agents window, with the widths of the bars that stand in for their names. */
interface IProjectSessions {
	readonly color: ProjectColor;
	readonly nameWidth: number;
	readonly sessions: readonly { readonly state: AgentState; readonly titleWidth: number; readonly selected?: boolean }[];
}

/**
 * The projects in the Agents window, from top to bottom. In the second design, the editor windows stack
 * in the same order, from back to front, and each shows the state of its project's first session.
 */
const agentsWindowProjects: readonly IProjectSessions[] = [
	{ color: 'orange', nameWidth: 30, sessions: [{ state: 'working', titleWidth: 62, selected: true }, { state: 'done', titleWidth: 48 }] },
	{ color: 'purple', nameWidth: 22, sessions: [{ state: 'waiting', titleWidth: 66 }] },
	{ color: 'blue', nameWidth: 26, sessions: [{ state: 'working', titleWidth: 44 }, { state: 'done', titleWidth: 54 }] },
];

/** The same projects in the first design, where the top project runs two tasks at the same time, as its caption describes. */
const [topProject, ...otherProjects] = agentsWindowProjects;
const windowComparisonProjects: readonly IProjectSessions[] = [
	{ ...topProject, sessions: [{ state: 'working', titleWidth: 62, selected: true }, { state: 'working', titleWidth: 48 }] },
	...otherProjects,
];

/** Creates IDs that are unique across all rendered graphics, so that clip paths of several instances cannot clash. */
class GraphicIds {
	private static instanceCount = 0;
	private readonly prefix = `agents-window-graphic-${++GraphicIds.instanceCount}`;
	private count = 0;

	next(): string {
		return `${this.prefix}-${++this.count}`;
	}
}

function figure(graphic: SVGSVGElement, title: string | undefined, description: string, badge?: string): HTMLElement {
	return $('figure.agents-window-graphic-figure', {},
		graphic,
		$('figcaption.agents-window-graphic-caption', {},
			...(title ? [$('.agents-window-graphic-title', {}, title, ...(badge ? [$('span.agents-window-graphic-badge', {}, badge)] : []))] : []),
			$('.agents-window-graphic-description', {}, description),
		),
	);
}

function graphicSvg(width: number, height: number, ...children: SVGElement[]): SVGSVGElement {
	return svg('svg', 'agents-window-graphic-svg', { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' }, ...children);
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string | undefined, attributes: Record<string, string | number>, ...children: SVGElement[]): SVGElementTagNameMap[K] {
	return $.SVG<SVGElementTagNameMap[K]>(tag, className ? { class: className, ...attributes } : attributes, ...children);
}

function rect(className: string, x: number, y: number, width: number, height: number, rx?: number): SVGRectElement {
	return svg('rect', className, rx === undefined ? { x, y, width, height } : { x, y, width, height, rx });
}

/** A rounded bar that stands in for a line of text. */
function bar(className: string, x: number, y: number, width: number, height = 4): SVGRectElement {
	return rect(className, x, y, width, height, height / 2);
}

function folder(color: ProjectColor, x: number, y: number): SVGPathElement {
	return svg('path', `awg-project-${color}`, { d: `M${x} ${y + 1.5}a1.5 1.5 0 0 1 1.5-1.5h2.5l1 1h3.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5z` });
}

function spinner(cx: number, cy: number, r: number): SVGGElement {
	return svg('g', 'awg-spinner', {},
		svg('circle', 'awg-spinner-track', { cx, cy, r }),
		svg('path', 'awg-spinner-arc', { d: `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx + r} ${cy}` }),
	);
}

function done(cx: number, cy: number, compact: boolean): SVGPathElement {
	return svg('path', 'awg-done', { d: compact ? `M${cx - 2.4} ${cy + 0.16}l1.76 1.76l3.2-3.68` : `M${cx - 3} ${cy + 0.2}l2.2 2.2l4-4.6` });
}

function waiting(cx: number, cy: number, halo: boolean): SVGElement[] {
	const dot = svg('circle', 'awg-waiting', { cx, cy, r: 3 });
	return halo ? [svg('circle', 'awg-waiting-halo', { cx, cy, r: 5.5 }), dot] : [dot];
}

/** The icon for an agent's state. Compact icons appear in title bars and in a session's progress. */
function agentStateIcon(state: AgentState, cx: number, cy: number, compact: boolean): SVGElement[] {
	switch (state) {
		case 'working':
			return [spinner(cx, cy, compact ? 3 : 4)];
		case 'waiting':
			return waiting(cx, cy, !compact);
		case 'done':
			return [done(cx, cy, compact)];
	}
}

/** Lists each project's folder, followed by its sessions, which are indented one tree level. */
function sessionsList(projects: readonly IProjectSessions[]): SVGElement[] {
	const sessionIconCenter = 23;
	const elements: SVGElement[] = [];
	let rowCenter = 56.5;
	for (const [index, { color, nameWidth, sessions }] of projects.entries()) {
		if (index > 0) {
			rowCenter += 17.5;
		}
		elements.push(folder(color, 10, rowCenter - 3.5), bar('awg-ink-medium', 23, rowCenter - 2, nameWidth));
		for (const [sessionIndex, { state, titleWidth, selected }] of sessions.entries()) {
			rowCenter += sessionIndex === 0 ? 14.5 : 16;
			if (selected) {
				elements.push(rect('awg-row-selected awg-radius-small', 4, rowCenter - 8, 116, 16, 4));
			}
			elements.push(
				...agentStateIcon(state, sessionIconCenter, rowCenter, false),
				// Sessions that are selected or need the user stand out.
				bar(selected || state === 'waiting' ? 'awg-ink-strong' : 'awg-ink-medium', sessionIconCenter + 10, rowCenter - 2, titleWidth),
			);
		}
	}
	return elements;
}

/** A window frame with an editor background, title bar and command center, which clips its content to its rounded corners. */
function windowFrame(ids: GraphicIds, x: number, y: number, width: number, height: number, titleBarHeight: number, commandCenter: { x: number; y: number; width: number; height: number }, shadow: boolean, ...content: SVGElement[]): SVGGElement {
	const clipId = ids.next();
	return svg('g', shadow ? 'awg-window awg-window-shadow' : 'awg-window', { transform: `translate(${x} ${y})` },
		svg('clipPath', undefined, { id: clipId }, rect('awg-window-shape', 0, 0, width, height, 8)),
		svg('g', undefined, { 'clip-path': `url(#${clipId})` },
			rect('awg-editor', 0, 0, width, height),
			rect('awg-titlebar', 0, 0, width, titleBarHeight),
			rect('awg-divider', 0, titleBarHeight, width, 1),
			rect('awg-command-center', commandCenter.x, commandCenter.y, commandCenter.width, commandCenter.height, commandCenter.height / 2),
			...content,
		),
		rect('awg-window-frame', 0.5, 0.5, width - 1, height - 1, 7.5),
	);
}

/** One project in the editor: activity bar, file tree, code with a cursor, and chat on the side. */
function editorWindow(ids: GraphicIds, x: number, y: number): SVGGElement {
	const tree: [indent: number, y: number, width: number][] = [[0, 46, 34], [1, 57, 22], [1, 68, 18], [1, 79, 28], [0, 90, 28], [1, 101, 24], [1, 112, 16], [1, 123, 22], [0, 134, 26], [1, 145, 26], [1, 156, 14]];
	const code: [x: number, width: number, className: string][][] = [
		[[112, 14, 'awg-syntax-blue'], [130, 30, 'awg-syntax-yellow'], [164, 8, 'awg-ink-subtle']],
		[[120, 12, 'awg-syntax-blue'], [136, 20, 'awg-ink-medium'], [160, 6, 'awg-ink-subtle'], [170, 26, 'awg-syntax-orange']],
		[[120, 10, 'awg-syntax-blue'], [134, 18, 'awg-ink-medium'], [156, 22, 'awg-syntax-yellow']],
		[[128, 26, 'awg-syntax-yellow'], [158, 16, 'awg-syntax-orange']],
		[[120, 6, 'awg-ink-subtle']],
		[[120, 14, 'awg-syntax-blue'], [138, 28, 'awg-ink-medium']],
		[[112, 6, 'awg-ink-subtle']],
		[],
		[[112, 14, 'awg-syntax-blue'], [130, 24, 'awg-syntax-yellow'], [158, 8, 'awg-ink-subtle']],
		[[120, 22, 'awg-ink-medium'], [146, 30, 'awg-syntax-orange']],
		[[112, 6, 'awg-ink-subtle']],
	];
	const cursorLine = 5;
	return windowFrame(ids, x, y, 300, 180, 24, { x: 105.5, y: 6.5, width: 89, height: 11 }, false,
		folder('blue', 136, 8.5),
		bar('awg-ink-medium', 149, 10, 16, 3),

		// Activity bar
		rect('awg-sidebar', 0, 25, 24, 155),
		rect('awg-ink-full', 0, 33, 2, 12),
		rect('awg-icon-active', 7.5, 33.5, 9, 9, 2),
		rect('awg-icon', 7.5, 53.5, 9, 9, 2),
		rect('awg-icon', 7.5, 73.5, 9, 9, 2),
		rect('awg-divider', 24, 25, 1, 155),

		// Explorer
		rect('awg-sidebar', 25, 25, 67, 155),
		folder('blue', 32, 32),
		bar('awg-ink-medium', 45, 33.5, 30),
		rect('awg-row-selected', 25, 64.5, 67, 11),
		...tree.flatMap(([indent, rowY, width]) => [
			rect(indent ? 'awg-ink-faint' : 'awg-ink-subtle', 32 + 8 * indent, rowY - 0.5, 5, 5, 1),
			bar('awg-ink-subtle', 41 + 8 * indent, rowY, width),
		]),
		rect('awg-divider', 92, 25, 1, 155),

		// Editor with one tab
		rect('awg-titlebar', 93, 25, 131, 16),
		rect('awg-editor', 93, 25, 60, 16),
		rect('awg-accent', 93, 25, 60, 1),
		rect('awg-syntax-blue', 99, 30.5, 5, 5, 1),
		bar('awg-ink-strong', 108, 31, 32),
		rect('awg-surface-faint', 93, 50 + 11 * cursorLine - 3.5, 131, 11),
		...code.flatMap((tokens, line) => [
			bar('awg-ink-faint', 99, 50.5 + 11 * line, 6, 3),
			...tokens.map(([tokenX, width, className]) => bar(className, tokenX, 50 + 11 * line, width)),
		]),
		rect('awg-ink-full', 168, 50 + 11 * cursorLine - 2.5, 1.5, 9),
		rect('awg-divider', 224, 25, 1, 155),

		// Chat
		rect('awg-sidebar', 225, 25, 75, 155),
		bar('awg-ink-medium', 232, 33.5, 28),
		rect('awg-surface-subtle awg-radius-medium', 244, 46, 48, 22, 6),
		bar('awg-ink-medium', 250, 51, 34, 3),
		bar('awg-ink-medium', 250, 58, 24, 3),
		svg('circle', 'awg-avatar', { cx: 235, cy: 79, r: 3 }),
		bar('awg-ink-subtle', 243, 77, 46, 3),
		bar('awg-ink-subtle', 243, 84, 42, 3),
		bar('awg-ink-subtle', 243, 91, 30, 3),
		rect('awg-input awg-radius-medium', 231.5, 148.5, 62, 23, 6),
		bar('awg-ink-faint', 238, 158.5, 28, 3),
	);
}

/** Sessions grouped by project with their agents' states, and the selected session with changes to review. */
function agentsWindow(ids: GraphicIds, x: number, y: number, shadow: boolean, projects: readonly IProjectSessions[]): SVGGElement {
	return windowFrame(ids, x, y, 300, 180, 24, { x: 105.5, y: 6.5, width: 89, height: 11 }, shadow,
		bar('awg-ink-medium', 132, 10, 36, 3),

		// Sessions
		rect('awg-sidebar', 0, 25, 124, 155),
		rect('awg-divider', 124, 25, 1, 155),
		rect('awg-button awg-radius-small', 8, 33, 50, 14, 4),
		svg('path', 'awg-button-icon', { d: 'M13.5 40h5M16 37.5v5' }),
		bar('awg-button-label', 23, 38.5, 27, 3),
		...sessionsList(projects),

		// Selected session
		bar('awg-ink-strong', 134, 33.5, 70),
		rect('awg-surface-subtle awg-radius-medium', 190, 46, 102, 22, 6),
		bar('awg-ink-medium', 196, 51, 80, 3),
		bar('awg-ink-medium', 196, 58, 56, 3),
		...([['done', 80, 70], ['done', 92, 56], ['working', 104, 64]] as const).flatMap(([state, cy, width]) => [
			...agentStateIcon(state, 139, cy, true),
			bar('awg-ink-subtle', 148, cy - 1.5, width, 3),
		]),

		// Changes to review
		rect('awg-input awg-radius-medium', 134.5, 114.5, 157, 29, 6),
		rect('awg-ink-medium', 142, 121, 5, 6, 1),
		bar('awg-ink-medium', 152, 122.5, 56, 3),
		bar('awg-diff-added', 254, 122.5, 14, 3),
		bar('awg-diff-removed', 272, 122.5, 8, 3),
		rect('awg-ink-medium', 142, 131, 5, 6, 1),
		bar('awg-ink-medium', 152, 132.5, 44, 3),
		bar('awg-diff-added', 254, 132.5, 10, 3),
		bar('awg-diff-removed', 272, 132.5, 4, 3),

		rect('awg-input awg-radius-medium', 134.5, 152.5, 157, 19, 6),
		bar('awg-ink-faint', 142, 160.5, 48, 3),
	);
}

/** A small editor window for one project, whose title shows the project and its agent's state. */
function projectEditorWindow(ids: GraphicIds, x: number, y: number, color: ProjectColor, state: AgentState): SVGGElement {
	const tree: [x: number, y: number, width: number][] = [[22, 28, 28], [28, 38, 16], [28, 48, 20], [22, 58, 18], [28, 68, 18], [28, 78, 14]];
	const code: [x: number, y: number, width: number, className: string][] = [
		[68, 28, 10, 'awg-syntax-blue'], [81, 28, 22, 'awg-syntax-yellow'],
		[74, 38, 8, 'awg-syntax-blue'], [85, 38, 14, 'awg-ink-medium'], [102, 38, 20, 'awg-syntax-orange'],
		[74, 48, 18, 'awg-syntax-yellow'], [95, 48, 12, 'awg-syntax-orange'],
		[68, 58, 4, 'awg-ink-medium'],
		[68, 78, 10, 'awg-syntax-blue'], [81, 78, 18, 'awg-syntax-yellow'],
		[74, 88, 16, 'awg-ink-medium'], [93, 88, 22, 'awg-syntax-orange'],
		[68, 98, 4, 'awg-ink-medium'],
	];
	return windowFrame(ids, x, y, 188, 112, 20, { x: 56.5, y: 5.5, width: 75, height: 10 }, true,
		folder(color, 64, 7),
		bar('awg-ink-medium', 77, 9, 26, 3),
		...agentStateIcon(state, 118, 10.5, true),

		rect('awg-sidebar', 0, 21, 16, 91),
		rect('awg-icon-active', 4.5, 27.5, 7, 7, 1.5),
		rect('awg-icon', 4.5, 41.5, 7, 7, 1.5),
		rect('awg-sidebar', 16, 21, 44, 91),
		rect('awg-divider', 60, 21, 1, 91),
		...tree.map(([barX, barY, width]) => bar('awg-ink-faint', barX, barY, width, 3)),
		...code.map(([barX, barY, width, className]) => bar(className, barX, barY, width, 3)),

		rect('awg-divider', 148, 21, 1, 91),
		rect('awg-sidebar', 149, 21, 39, 91),
		rect('awg-surface-subtle awg-radius-small', 155, 28, 27, 14, 4),
		bar('awg-ink-subtle', 155, 50, 26, 3),
		bar('awg-ink-subtle', 155, 57, 22, 3),
		bar('awg-ink-subtle', 155, 64, 16, 3),
	);
}
