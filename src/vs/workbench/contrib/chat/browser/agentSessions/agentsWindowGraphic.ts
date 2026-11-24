/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsWindowGraphic.css';
import { $, reset, setVisibility } from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { AgentsWindowGraphicVariant, AgentsWindowSectionStyle, ChatConfiguration, getAgentsWindowGraphicVariant, getAgentsWindowSectionStyle } from '../../common/constants.js';
import { registerAgentsWindowTreatments } from './agentsWindowTreatments.js';

/** A graphic that can be shown. */
export type AgentsWindowGraphicDesign = AgentsWindowGraphicVariant.WindowComparison | AgentsWindowGraphicVariant.Banner;

/** The treatment whose string value replaces the title of the {@link AgentsWindowGraphicVariant.Banner}. */
export const AGENTS_WINDOW_BANNER_TITLE_TREATMENT = 'chatWelcomeAgentsBannerTitle';
/** The treatment whose string value replaces the description of the {@link AgentsWindowGraphicVariant.Banner}. */
export const AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT = 'chatWelcomeAgentsBannerDescription';

/** The text of the {@link AgentsWindowGraphicVariant.Banner} that treatments replace. Each missing value keeps the default text. */
export interface IAgentsWindowBannerCopy {
	readonly title?: string;
	readonly description?: string;
}

/** Whether the user hid the graphic, in every graphic and on every machine that syncs the profile. */
const HIDDEN_STORAGE_KEY = 'chat.welcomePage.agentsWindowGraphic.hidden';

/** Shows the graphic again after the user hid it, see {@link AgentsWindowGraphic.hide}. */
export function resetAgentsWindowGraphicHidden(storageService: IStorageService): void {
	storageService.remove(HIDDEN_STORAGE_KEY, StorageScope.PROFILE);
}

/**
 * Shows the graphic selected by {@link ChatConfiguration.WelcomePageAgentsWindowGraphic} to signed-in users
 * and updates it when the setting changes, unless the user hid it. The element is hidden while no graphic is shown.
 */
export class AgentsWindowGraphic extends Disposable {

	readonly element: HTMLElement;

	/**
	 * The graphic selected by the setting, or `undefined` for none. Unlike {@link shownDesign}, this ignores whether the user hid
	 * the graphic, which only users who see one can do, so that experiment triggers that depend on it are logged alike in every arm.
	 */
	readonly design: IObservable<AgentsWindowGraphicDesign | undefined>;

	/**
	 * Whether the user is signed in. Graphics are only shown to signed-in users, since the Welcome page offers signed-out users to
	 * sign in instead. Until the default account has been resolved, this follows the chat entitlement that the window restores at
	 * startup, so that a signed-in user's graphic doesn't appear late.
	 */
	readonly signedIn: IObservable<boolean>;

	private readonly _shownDesign = observableValue<AgentsWindowGraphicDesign | undefined>(this, undefined);
	/** The graphic rendered in {@link element}, or `undefined` when none is. Changes after the element has been updated. */
	readonly shownDesign: IObservable<AgentsWindowGraphicDesign | undefined> = this._shownDesign;

	private readonly _shownBannerCopy = observableValue<IAgentsWindowBannerCopy | undefined>(this, undefined);
	/**
	 * The treatment text rendered in the shown {@link AgentsWindowGraphicVariant.Banner}, or `undefined` while the banner shows its
	 * default text or isn't shown. Changes together with {@link shownDesign}, after the element has been updated, so that the page
	 * can fit the graphic again when the banner's text, and so its height, changes.
	 */
	readonly shownBannerCopy: IObservable<IAgentsWindowBannerCopy | undefined> = this._shownBannerCopy;

	/**
	 * How the {@link AgentsWindowGraphicVariant.WindowComparison} graphic, its captions and the Agents window button should be set
	 * apart from the rest of the page, see {@link ChatConfiguration.WelcomePageAgentsWindowSectionStyle}. The page that shows the graphic applies it.
	 */
	readonly sectionStyle: IObservable<AgentsWindowSectionStyle>;

	private readonly _bannerCopy = observableValue<IAgentsWindowBannerCopy | undefined>(this, undefined);
	/**
	 * Whether the treatments that replace the banner's title and description, {@link AGENTS_WINDOW_BANNER_TITLE_TREATMENT} and
	 * {@link AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT}, have been read. They are read while the banner is selected, and
	 * read again when assignments are refetched. Until they have been read, the banner shows its default text.
	 */
	readonly bannerCopyResolved: IObservable<boolean> = this._bannerCopy.map(this, copy => copy !== undefined);

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
		@ILogService logService: ILogService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
	) {
		super();
		this.element = $('.agents-window-graphic-container');

		// The default account is `null` until it has been resolved, also for signed-in users.
		const accountSignedOut = observableValue(this, false);
		const updateAccount = () => accountSignedOut.set(defaultAccountService.currentDefaultAccount === null, undefined);
		this._register(defaultAccountService.onDidChangeDefaultAccount(updateAccount));
		defaultAccountService.getDefaultAccount().then(() => {
			if (!this._store.isDisposed) {
				updateAccount();
			}
		}, onUnexpectedError);
		this.signedIn = derived(this, reader => !accountSignedOut.read(reader) && chatEntitlementService.entitlementObs.read(reader) !== ChatEntitlement.Unknown);

		const variant = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.WelcomePageAgentsWindowGraphic)),
			() => getAgentsWindowGraphicVariant(configurationService),
		);
		this.design = variant.map(this, selected => selected === AgentsWindowGraphicVariant.None ? undefined : selected);
		const hidden = observableFromEvent(this,
			storageService.onDidChangeValue(StorageScope.PROFILE, HIDDEN_STORAGE_KEY, this._store),
			() => storageService.getBoolean(HIDDEN_STORAGE_KEY, StorageScope.PROFILE, false),
		);
		this.sectionStyle = observableFromEvent(this,
			Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.WelcomePageAgentsWindowSectionStyle)),
			() => getAgentsWindowSectionStyle(configurationService),
		);

		this._register(autorun(reader => {
			if (this.design.read(reader) === AgentsWindowGraphicVariant.Banner) {
				reader.store.add(registerAgentsWindowTreatments(
					[AGENTS_WINDOW_BANNER_TITLE_TREATMENT, AGENTS_WINDOW_BANNER_DESCRIPTION_TREATMENT],
					'AgentsWindowGraphic',
					([title, description]) => this._bannerCopy.set({ title, description }, undefined),
					assignmentService,
					logService,
				));
			}
		}));

		this._register(autorun(reader => {
			const shownDesign = hidden.read(reader) || !this.signedIn.read(reader) ? undefined : this.design.read(reader);
			const bannerCopy = shownDesign === AgentsWindowGraphicVariant.Banner ? this._bannerCopy.read(reader) : undefined;
			reset(this.element, ...(shownDesign ? [renderAgentsWindowGraphic(shownDesign, bannerCopy)] : []));
			setVisibility(!!shownDesign, this.element);
			transaction(tx => {
				this._shownDesign.set(shownDesign, tx);
				this._shownBannerCopy.set(bannerCopy, tx);
			});
		}));
	}

	/** Hides the graphic in this profile, also on other machines that sync it, until {@link resetAgentsWindowGraphicHidden}. */
	hide(): void {
		this.storageService.store(HIDDEN_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
	}
}

/**
 * Renders a graphic and its captions, with the banner's title and description replaced by `bannerCopy`.
 * The drawings are decorative and hidden from screen readers; the captions carry their meaning.
 */
export function renderAgentsWindowGraphic(design: AgentsWindowGraphicDesign, bannerCopy?: IAgentsWindowBannerCopy): HTMLElement {
	const ids = new GraphicIds();
	const agentsWindowTitle = localize('agentsWindowGraphic.agentsWindow.title', "Agents window");
	const newBadge = localize('agentsWindowGraphic.new', "New");
	switch (design) {
		case AgentsWindowGraphicVariant.WindowComparison:
			return $('.agents-window-graphic.window-comparison', {},
				figure(
					graphicSvg(300, 180, editorWindow(ids, 0, 0)),
					localize('agentsWindowGraphic.editorWindow.title', "Editor window"),
					localize('agentsWindowGraphic.editorWindow.description', "Work on one task at a time, with AI at your side."),
				),
				figure(
					graphicSvg(300, 180, agentsWindow(ids, 0, 0, false)),
					agentsWindowTitle,
					localize('agentsWindowGraphic.agentsWindow.description', "Run multiple tasks at the same time, isolated from each other."),
					newBadge,
				),
			);
		case AgentsWindowGraphicVariant.Banner:
			// The page places the Agents window button below the text, see `.agents-window-banner-text`.
			return $('.agents-window-graphic.banner', {},
				$('.agents-window-banner-text', {},
					$('.agents-window-banner-eyebrow', {},
						$('span.agents-window-banner-icon', { 'aria-hidden': 'true' }),
						$('span', {}, agentsWindowTitle),
						$('span.agents-window-graphic-badge', {}, newBadge),
					),
					$('.agents-window-banner-title', { role: 'heading', 'aria-level': '2' }, bannerCopy?.title ?? localize('agentsWindowGraphic.banner.title', "All your agents, across all your projects, in one window")),
					$('.agents-window-banner-description', {}, bannerCopy?.description ?? localize('agentsWindowGraphic.banner.description', "Built to make you more productive when working with agents. Run several at the same time, each on its own task, and review their changes independently of each other when they're ready.")),
				),
				$('.agents-window-banner-drawing', {}, graphicSvg(300, 180, agentsWindow(ids, 0, 0, true))),
			);
	}
}

type ProjectColor = 'blue' | 'purple' | 'orange';

/** A session's state in the sessions list: its agent is working, it finished with results the user hasn't seen, or it opened a pull request. */
type SessionState = 'working' | 'unread' | 'pullRequest';

/** A project and its sessions in the Agents window, with the widths of the bars that stand in for their names. */
interface IProjectSessions {
	readonly color: ProjectColor;
	readonly nameWidth: number;
	readonly sessions: readonly { readonly state: SessionState; readonly titleWidth: number; readonly selected?: boolean }[];
}

/** The projects in the Agents window, from top to bottom. The top project runs two tasks at the same time. */
const agentsWindowProjects: readonly IProjectSessions[] = [
	{ color: 'orange', nameWidth: 30, sessions: [{ state: 'working', titleWidth: 62, selected: true }, { state: 'working', titleWidth: 48 }] },
	{ color: 'purple', nameWidth: 22, sessions: [{ state: 'unread', titleWidth: 66 }] },
	{ color: 'blue', nameWidth: 26, sessions: [{ state: 'working', titleWidth: 44 }, { state: 'pullRequest', titleWidth: 54 }] },
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

function figure(graphic: SVGSVGElement, title: string, description: string, badge?: string): HTMLElement {
	return $('figure.agents-window-graphic-figure', {},
		graphic,
		$('figcaption.agents-window-graphic-caption', {},
			$('.agents-window-graphic-title', {}, title, ...(badge ? [$('span.agents-window-graphic-badge', {}, badge)] : [])),
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

function done(cx: number, cy: number): SVGPathElement {
	return svg('path', 'awg-done', { d: `M${cx - 2.4} ${cy + 0.16}l1.76 1.76l3.2-3.68` });
}

/** An open pull request: a branch on the left and, on the right, a line that points back into it. */
function pullRequest(cx: number, cy: number): SVGGElement {
	const nodes = [[cx - 3, cy - 3.5], [cx - 3, cy + 3.5], [cx + 3, cy + 3.5]];
	return svg('g', undefined, {},
		svg('path', 'awg-pull-request', { d: `M${cx - 3} ${cy - 3.5}v7M${cx + 3} ${cy + 3.5}v-5a2 2 0 0 0-2-2h-1M${cx + 1.5} ${cy - 5}l-1.5 1.5l1.5 1.5` }),
		...nodes.map(([x, y]) => svg('circle', 'awg-pull-request-node', { cx: x, cy: y, r: 1.5 })),
	);
}

/** The icon for a session's state in the sessions list, like the Agents window shows it. */
function sessionStateIcon(state: SessionState, cx: number, cy: number): SVGElement {
	switch (state) {
		case 'working':
			return spinner(cx, cy, 4);
		case 'unread':
			return svg('circle', 'awg-unread', { cx, cy, r: 3 });
		case 'pullRequest':
			return pullRequest(cx, cy);
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
				sessionStateIcon(state, sessionIconCenter, rowCenter),
				// Sessions that are selected or unread stand out.
				bar(selected || state === 'unread' ? 'awg-ink-strong' : 'awg-ink-medium', sessionIconCenter + 10, rowCenter - 2, titleWidth),
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
function agentsWindow(ids: GraphicIds, x: number, y: number, shadow: boolean): SVGGElement {
	return windowFrame(ids, x, y, 300, 180, 24, { x: 105.5, y: 6.5, width: 89, height: 11 }, shadow,
		bar('awg-ink-medium', 132, 10, 36, 3),

		// Sessions
		rect('awg-sidebar', 0, 25, 124, 155),
		rect('awg-divider', 124, 25, 1, 155),
		rect('awg-button awg-radius-small', 8, 33, 50, 14, 4),
		svg('path', 'awg-button-icon', { d: 'M13.5 40h5M16 37.5v5' }),
		bar('awg-button-label', 23, 38.5, 27, 3),
		...sessionsList(agentsWindowProjects),

		// Selected session
		bar('awg-ink-strong', 134, 33.5, 70),
		rect('awg-surface-subtle awg-radius-medium', 190, 46, 102, 22, 6),
		bar('awg-ink-medium', 196, 51, 80, 3),
		bar('awg-ink-medium', 196, 58, 56, 3),
		...([['done', 80, 70], ['done', 92, 56], ['working', 104, 64]] as const).flatMap(([state, cy, width]) => [
			state === 'done' ? done(139, cy) : spinner(139, cy, 3),
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
