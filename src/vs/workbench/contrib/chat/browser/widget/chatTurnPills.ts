/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, reset } from '../../../../../base/browser/dom.js';
import { ActionsOrientation } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button, IButtonStyles } from '../../../../../base/browser/ui/button/button.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { Action, IAction, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AnimatedCounterWidget } from '../../../../browser/animatedCounterWidget.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import { ChatConfiguration } from '../../common/constants.js';
import '../media/chatTurnPills.css';

const CHANGES_PILL_ACTION_ID = 'chat.turnPills.changes';
const PREVIEW_PILL_ACTION_ID = 'chat.turnPills.preview';
const LIVE_BROWSER_PILL_ACTION_ID = 'chat.turnPills.liveBrowser';

/**
 * All-transparent button styles so the inner preview-pill buttons inherit the
 * pill container's own background/border and read as a single control.
 */
const TRANSPARENT_BUTTON_STYLES: IButtonStyles = {
	buttonBackground: undefined,
	buttonHoverBackground: undefined,
	buttonForeground: undefined,
	buttonSeparator: undefined,
	buttonSecondaryBackground: undefined,
	buttonSecondaryHoverBackground: undefined,
	buttonSecondaryForeground: undefined,
	buttonSecondaryBorder: undefined,
	buttonBorder: undefined,
};

/** Aggregate diff counts shown in the changes pill (scoped to a single turn). */
export interface IDiffStats {
	readonly files: number;
	readonly insertions: number;
	readonly deletions: number;
}

export const EMPTY_DIFF_STATS: IDiffStats = { files: 0, insertions: 0, deletions: 0 };

/** A markdown file the preview pill can open. */
export interface IPreviewFile {
	readonly uri: URI;
	readonly kind: 'markdown';
	/** Whether the file was created (vs. edited) during the turn. */
	readonly created: boolean;
}

/** Classify a resource as a previewable markdown file, if applicable. */
export function previewKind(uri: URI): 'markdown' | undefined {
	const path = uri.path.toLowerCase();
	if (path.endsWith('.md') || path.endsWith('.markdown')) {
		return 'markdown';
	}
	return undefined;
}

export function diffStatsEqual(a: IDiffStats, b: IDiffStats): boolean {
	return a.files === b.files && a.insertions === b.insertions && a.deletions === b.deletions;
}

export function previewFilesEqual(a: readonly IPreviewFile[], b: readonly IPreviewFile[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i].kind !== b[i].kind || a[i].created !== b[i].created || !isEqual(a[i].uri, b[i].uri)) {
			return false;
		}
	}
	return true;
}

/**
 * Open a previewable file: markdown files open as a markdown preview, falling
 * back to the default opener when it is not available (e.g. web).
 */
export async function openChatPreviewFile(file: IPreviewFile, commandService: ICommandService, openerService: IOpenerService, logService: ILogService): Promise<void> {
	try {
		await commandService.executeCommand('markdown.showPreview', file.uri);
	} catch (err) {
		logService.trace('[ChatTurnPills] Falling back to default opener for preview', err);
		await openerService.open(file.uri);
	}
}

/** The data and interactions a {@link ChatTurnPillsWidget} reflects. */
export interface IChatTurnPillsModel {
	readonly stats: IObservable<IDiffStats>;
	readonly previewFiles: IObservable<readonly IPreviewFile[]>;
	/**
	 * The URL of the last browser tool call in the turn, or `undefined` when the
	 * turn used no URL-carrying browser tool. Drives the "Live Browser" pill.
	 */
	readonly browserUrl: IObservable<string | undefined>;
	/** When `false` the changes pill stays hidden regardless of the data. */
	readonly changesEnabled: IObservable<boolean>;
	/** When `false` the preview pill stays hidden regardless of the data. */
	readonly previewEnabled: IObservable<boolean>;
	/** When `false` the "Live Browser" pill stays hidden regardless of the data. */
	readonly browserEnabled: IObservable<boolean>;
	openChanges(): void;
	openPreviewFile(file: IPreviewFile): void;
	openBrowser(url: string): void;
}

/** Per-pill visibility for the agent turn status pills ({@link ChatConfiguration.TurnStatusPills}). */
export interface IChatTurnStatusPillsConfig {
	readonly changes: boolean;
	readonly preview: boolean;
	readonly browser: boolean;
}

const TURN_STATUS_PILLS_DEFAULT: IChatTurnStatusPillsConfig = { changes: false, preview: false, browser: false };

/** Observe the per-pill turn status pills visibility setting. */
export function observeTurnStatusPillsConfig(configurationService: IConfigurationService): IObservable<IChatTurnStatusPillsConfig> {
	return observableConfigValue(ChatConfiguration.TurnStatusPills, TURN_STATUS_PILLS_DEFAULT, configurationService);
}

/**
 * The changes pill: `<diff-icon> <n> Files +insertions -deletions`, updating
 * live as {@link _statsObs} changes.
 */
class ChangesPillActionViewItem extends BaseActionViewItem {

	private _button: Button | undefined;
	private _filesLabel: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _statsObs: IObservable<IDiffStats>,
		private readonly _instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-turn-pill-changes');

		const button = this._button = this._register(new Button(container, { secondary: true, small: true, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-turn-pill-changes-button');
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.actionRunner.run(this._action, this._context);
			}
		}));

		// Build the label structure once so the animated counters persist across
		// updates and can transition smoothly between values instead of being
		// torn down and rebuilt on every stats change.
		this._filesLabel = $('span.chat-turn-pill-meta-label');
		reset(
			button.element,
			$(`span.chat-turn-pill-meta-icon${ThemeIcon.asCSSSelector(Codicon.diffMultiple)}`),
			this._filesLabel,
		);

		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, button.element, {
			prefix: '+',
			direction: 'topToBottom',
			cssClassName: 'chat-turn-pill-meta-added',
			count: derived(this, reader => this._statsObs.read(reader).insertions),
		}));
		this._register(this._instantiationService.createInstance(AnimatedCounterWidget, button.element, {
			prefix: '-',
			direction: 'bottomToTop',
			cssClassName: 'chat-turn-pill-meta-removed',
			count: derived(this, reader => this._statsObs.read(reader).deletions),
		}));

		this._register(autorun(reader => {
			this._updateLabel(this._statsObs.read(reader));
		}));
	}

	private _updateLabel(stats: IDiffStats): void {
		if (!this._button || !this._filesLabel) {
			return;
		}
		const { files, insertions, deletions } = stats;
		const filesLabel = files === 1
			? localize('chatTurnPills.changes.file', "{0} File", files)
			: localize('chatTurnPills.changes.files', "{0} Files", files);
		this._filesLabel.textContent = filesLabel;
		this._button.setTitle(localize('chatTurnPills.changes.tooltip', "View Changes"));
		this._button.element.setAttribute('aria-label', localize('chatTurnPills.changes.ariaLabel', "View Changes: {0}, +{1}, -{2}", filesLabel, insertions, deletions));
	}

	override focus(): void {
		this._button?.focus();
	}
}

/**
 * The "Live Browser" pill: `<browser-icon> Live Browser`, rendered as a compact
 * secondary button. Activating it opens the integrated browser at the turn's
 * last browser URL ({@link _browserUrlObs}); the URL is surfaced in the tooltip.
 */
class LiveBrowserPillActionViewItem extends BaseActionViewItem {

	private _button: Button | undefined;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _browserUrlObs: IObservable<string | undefined>,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-turn-pill-browser');

		const button = this._button = this._register(new Button(container, { secondary: true, small: true, ...defaultButtonStyles }));
		button.element.classList.add('monaco-text-button', 'chat-turn-pill-browser-button');
		this._register(button.onDidClick(() => {
			if (this._action.enabled) {
				this.actionRunner.run(this._action, this._context);
			}
		}));

		reset(
			button.element,
			$(`span.chat-turn-pill-meta-icon${ThemeIcon.asCSSSelector(Codicon.globe)}`),
			$('span.chat-turn-pill-browser-label', undefined, localize('chatTurnPills.browser.label', "Live Browser")),
		);

		this._register(autorun(reader => {
			const url = this._browserUrlObs.read(reader);
			const tooltip = url
				? localize('chatTurnPills.browser.tooltip', "Open Live Browser: {0}", url)
				: localize('chatTurnPills.browser.label', "Live Browser");
			this._button?.setTitle(tooltip);
			this._button?.element.setAttribute('aria-label', tooltip);
		}));
	}

	override focus(): void {
		this._button?.focus();
	}
}

/**
 * The preview pill: renders the primary previewable file as a resource label
 * (file icon + name). When more than one previewable file exists, a separator
 * and a dropdown chevron are shown; the chevron lists every previewable file.
 * Activating the label opens the primary file's preview.
 */
class PreviewPillActionViewItem extends BaseActionViewItem {

	private _primary: Button | undefined;

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _previewFilesObs: IObservable<readonly IPreviewFile[]>,
		private readonly _resourceLabels: ResourceLabels,
		private readonly _openFile: (file: IPreviewFile) => void,
		private readonly _showAll: (anchor: HTMLElement) => void,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-turn-pill-preview');

		const primary = this._primary = this._register(new Button(container, { ...TRANSPARENT_BUTTON_STYLES }));
		primary.element.classList.add('chat-turn-pill-preview-primary');
		const label = this._register(this._resourceLabels.create(primary.element));
		this._register(primary.onDidClick(() => {
			const primaryFile = this._previewFilesObs.get().at(0);
			if (primaryFile) {
				this._openFile(primaryFile);
			}
		}));

		const separator = append(container, $('.chat-turn-pill-preview-separator'));

		const chevron = this._register(new Button(container, { ...TRANSPARENT_BUTTON_STYLES }));
		chevron.element.classList.add('chat-turn-pill-preview-chevron');
		// Render the chevron as a child element (not via `chevron.icon`, which puts a
		// fixed-height codicon class on the button itself) so the button can stretch
		// to the pill's full height and its hover background spans top to bottom.
		append(chevron.element, $(`span${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		const moreLabel = localize('chatTurnPills.preview.more', "Show All Previewable Files");
		chevron.setTitle(moreLabel);
		chevron.setAriaLabel(moreLabel);
		this._register(chevron.onDidClick(() => this._showAll(chevron.element)));

		this._register(autorun(reader => {
			const files = this._previewFilesObs.read(reader);
			const primaryFile = files.at(0);
			if (primaryFile) {
				label.setResource(
					{ resource: primaryFile.uri, name: basename(primaryFile.uri) },
					{ fileKind: FileKind.FILE },
				);
				const tooltip = localize('chatTurnPills.preview.tooltipOne', "Open Preview: {0}", basename(primaryFile.uri));
				primary.setTitle(tooltip);
				primary.setAriaLabel(tooltip);
			}
			const hasMultiple = files.length > 1;
			separator.classList.toggle('hidden', !hasMultiple);
			chevron.element.classList.toggle('hidden', !hasMultiple);
		}));
	}

	override focus(): void {
		this._primary?.focus();
	}
}

/**
 * A toolbar of clickable pills reflecting a single turn's status. Used both as a
 * floating widget above the chat input (live, active turn) and inside a completed
 * chat response. The pills are actions inside a {@link ToolBar}:
 *
 * - **Changes** — `<n> Files +ins -del` for the turn. Activating it opens the
 *   changes.
 * - **Preview** — shown when the turn created or edited a markdown file.
 *   Rendered as a resource label for the primary file. Activating it opens that
 *   file as a markdown preview; when several exist, a dropdown lists them all.
 * - **Live Browser** — shown when the turn made a browser tool call that carries
 *   a URL. Rendered as `<browser-icon> Live Browser`; activating it opens the
 *   integrated browser at the turn's last browser URL.
 *
 * The data and the open actions are supplied by the {@link IChatTurnPillsModel}
 * so the same widget serves surfaces with different data sources.
 */
export class ChatTurnPillsWidget extends Disposable {

	readonly element: HTMLElement;

	/** Whether the widget currently has any pill to show. */
	readonly isVisible: IObservable<boolean>;

	private readonly _toolbar: ToolBar;
	private readonly _changesAction: Action;
	private readonly _previewAction: Action;
	private readonly _browserAction: Action;
	private readonly _resourceLabels: ResourceLabels;

	/** Ids of the currently mounted pills, so we only rebuild the toolbar when the set changes. */
	private _visibleSignature: string | undefined;

	constructor(
		private readonly _model: IChatTurnPillsModel,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		// `show-file-icons` lets the preview pill's resource label render the file's
		// themed icon — the label always computes the file-icon classes, but they
		// only paint when an ancestor opts in.
		this.element = $('.chat-turn-pills.show-file-icons.hidden');
		this._resourceLabels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		this._changesAction = this._register(new Action(CHANGES_PILL_ACTION_ID, localize('chatTurnPills.changes.tooltip', "View Changes"), undefined, true, async () => this._model.openChanges()));
		this._previewAction = this._register(new Action(PREVIEW_PILL_ACTION_ID, localize('chatTurnPills.preview.label', "Open Preview"), undefined, true, async () => this._openPrimaryPreview()));
		this._browserAction = this._register(new Action(LIVE_BROWSER_PILL_ACTION_ID, localize('chatTurnPills.browser.label', "Live Browser"), undefined, true, async () => this._openBrowser()));

		this._toolbar = this._register(new ToolBar(this.element, this._contextMenuService, {
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('chatTurnPills.ariaLabel', "Turn status"),
			actionViewItemProvider: (action, options) => {
				if (action.id === CHANGES_PILL_ACTION_ID) {
					return new ChangesPillActionViewItem(action, options, this._model.stats, this._instantiationService);
				}
				if (action.id === PREVIEW_PILL_ACTION_ID) {
					return new PreviewPillActionViewItem(action, options, this._model.previewFiles, this._resourceLabels, file => this._model.openPreviewFile(file), anchor => this._showAllPreviews(anchor));
				}
				if (action.id === LIVE_BROWSER_PILL_ACTION_ID) {
					return new LiveBrowserPillActionViewItem(action, options, this._model.browserUrl);
				}
				return undefined;
			},
		}));

		this.isVisible = derived(this, reader => this._showChanges(reader) || this._showPreview(reader) || this._showBrowser(reader));

		this._register(autorun(reader => {
			this._updateVisibleActions(this._showChanges(reader), this._showPreview(reader), this._showBrowser(reader));
		}));
	}

	private _showChanges(reader: IReader): boolean {
		return this._model.changesEnabled.read(reader) && this._model.stats.read(reader).files > 0;
	}

	private _showPreview(reader: IReader): boolean {
		return this._model.previewEnabled.read(reader) && this._model.previewFiles.read(reader).length > 0;
	}

	private _showBrowser(reader: IReader): boolean {
		return this._model.browserEnabled.read(reader) && this._model.browserUrl.read(reader) !== undefined;
	}

	private _updateVisibleActions(showChanges: boolean, showPreview: boolean, showBrowser: boolean): void {
		const actions: IAction[] = [];
		if (showChanges) {
			actions.push(this._changesAction);
		}
		if (showPreview) {
			actions.push(this._previewAction);
		}
		if (showBrowser) {
			actions.push(this._browserAction);
		}

		const signature = actions.map(a => a.id).join(',');
		if (signature !== this._visibleSignature) {
			this._visibleSignature = signature;
			this._toolbar.setActions(actions);
		}
		this.element.classList.toggle('hidden', actions.length === 0);
	}

	private _openPrimaryPreview(): void {
		const primaryFile = this._model.previewFiles.get().at(0);
		if (primaryFile) {
			this._model.openPreviewFile(primaryFile);
		}
	}

	private _openBrowser(): void {
		const url = this._model.browserUrl.get();
		if (url !== undefined) {
			this._model.openBrowser(url);
		}
	}

	private _showAllPreviews(anchor: HTMLElement): void {
		const files = this._model.previewFiles.get();
		if (files.length === 0) {
			return;
		}
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => files.map(file => toAction({
				id: `${PREVIEW_PILL_ACTION_ID}.${file.uri.toString()}`,
				label: basename(file.uri),
				class: ThemeIcon.asClassName(Codicon.openPreview),
				run: () => this._model.openPreviewFile(file),
			})),
		});
	}
}
