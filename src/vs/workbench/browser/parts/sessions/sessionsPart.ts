/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPart.css';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { Parts, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { LayoutPriority } from '../../../../base/browser/ui/splitview/splitview.js';
import { Part } from '../../part.js';
import { $ } from '../../../../base/browser/dom.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../../services/progress/browser/progressIndicator.js';
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize, getSessionsPartCardMarginRight, getSessionsPartFrameInset } from './agentsPartCard.js';
import { isPhoneLayout } from './mobileLayout.js';
import { ISessionsHostLayoutService } from '../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionsPartContent, ISessionsPartContentHost, ISessionsPartContentLayout, SessionsPartContentRegistry } from './sessionsPartContent.js';

/**
 * The Sessions part: the card that hosts what a window shows of its sessions. The window names the kind of content to
 * show (see {@link SessionsPartContentRegistry}); the part creates that content, renders it in its card, lays it out
 * and disposes it with itself.
 */
export class SessionsPart extends Part implements ISessionsPartContentHost {

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	get snap(): boolean { return false; }

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/** The content the part shows, of the kind its window named. */
	readonly content: ISessionsPartContent;

	/** Lazily-created progress bar shown at the top of the content area. */
	private _progressBar: ProgressBar | undefined;
	private _progressIndicator: IProgressIndicator | undefined;

	protected _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	/**
	 * Whether the part itself is visible in the workbench grid. Starts `true`
	 * because the workbench grid only calls {@link setVisible} on change.
	 */
	private _isPartVisible = true;

	/** Whether the workbench permits the content to render. */
	private _contentVisible = true;

	private get _isContentShown(): boolean {
		return this._isPartVisible && this._contentVisible;
	}

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.High;

	constructor(
		contentId: string,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ISessionsHostLayoutService private readonly hostLayoutService: ISessionsHostLayoutService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			Parts.SESSIONS_PART,
			{ hasTitle: false, borderWidth: () => 0 },
			themeService,
			storageService,
			layoutService
		);

		const descriptor = SessionsPartContentRegistry.get(contentId);
		if (!descriptor) {
			// The part registered itself with the layout in its base constructor; release that before failing.
			this.dispose();
			throw new Error(`No Sessions part content is registered for '${contentId}'`);
		}
		this.content = this._register(instantiationService.createInstance(descriptor.ctor, this));
	}

	/**
	 * Returns the content when it is of the given kind. The window that named the kind uses it to reach the content's
	 * own API.
	 */
	getContent<T extends ISessionsPartContent>(kind: abstract new (...args: never[]) => T): T | undefined {
		return this.content instanceof kind ? this.content : undefined;
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		parent.classList.add('sessionspart');

		super.create(parent);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.content.renderBackground?.(parent);

		const contentArea = $('.content');
		parent.appendChild(contentArea);

		// Progress bar pinned to the top of the content area (see sessionsPart.css
		// rule `.part.sessionspart > .content > .monaco-progress-container`).
		this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
		this._progressBar.hide();

		this.content.render(contentArea);

		return contentArea;
	}

	requestLayout(): void {
		if (this._lastLayout) {
			const { width, height, top, left } = this._lastLayout;
			this.layout(width, height, top, left);
		}
	}

	/**
	 * Returns the progress indicator for the part. Drives the progress bar shown
	 * at the top of the content area. Indicator state is scoped to the part's
	 * visibility, mirroring how view panes manage their own progress indicators.
	 */
	getProgressIndicator(): IProgressIndicator {
		if (!this._progressIndicator) {
			const progressBar = assertReturnsDefined(this._progressBar);
			const scopeId = Parts.SESSIONS_PART;
			const isVisible = this.layoutService.isVisible(scopeId);
			const onDidVisibilityChange = this.onDidVisibilityChange;
			const scope = this._register(new class extends AbstractProgressScope {
				constructor() {
					super(scopeId, isVisible);
					this._register(onDidVisibilityChange(visible => visible ? this.onScopeOpened(scopeId) : this.onScopeClosed(scopeId)));
				}
			}());
			this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
		}
		return this._progressIndicator;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		applyAgentsPartCardStyles(container, this.theme);

		this.content.updateStyles(this.theme);
	}

	setContentVisible(visible: boolean): void {
		if (this._contentVisible === visible) {
			return;
		}

		this._contentVisible = visible;
		this.content.setVisible(this._isContentShown);
	}

	override setVisible(visible: boolean): void {
		if (this._isPartVisible !== visible) {
			// Update before `super`, whose event re-enters this method.
			this._isPartVisible = visible;
			this.content.setVisible(this._isContentShown);
		}

		super.setVisible(visible);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		const phoneLayout = isPhoneLayout(this.layoutService);
		const compactLayout = this.layoutService.isModernUICompact();
		const spacing = this.layoutService.getPanelSpacing();
		const container = this.layoutService.mainContainer;
		const borderWidth = !phoneLayout && container.classList.contains('modern-ui-tabs')
			? getSessionsPartFrameInset(container, spacing)
			: 1;
		const cardSize = getAgentsPartCardContentSize(
			width,
			height,
			(this.hostLayoutService.sidePane?.isEditorPaneVisible() ?? false),
			this.layoutService.isVisible(Parts.SIDEBAR_PART),
			phoneLayout,
			compactLayout,
			getSessionsPartCardMarginRight(container, spacing),
			borderWidth
		);

		// Size the content area with the reduced dimensions.
		const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);

		// Layout the content within the content area.
		const gap = phoneLayout || compactLayout ? 0 : spacing;
		this.layoutContent(contentSize.width, contentSize.height, top, left, { phoneLayout, gap });

		// Store the full grid-allocated dimensions so that Part.relayout() works correctly.
		super.layout(width, height, top, left);
	}

	protected layoutContent(width: number, height: number, top: number, left: number, options: ISessionsPartContentLayout): void {
		this.content.layout(width, height, top, left, options);
	}

	toJSON(): object {
		return {
			type: Parts.SESSIONS_PART
		};
	}
}
