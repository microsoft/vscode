/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionsWidgets';
import { Disposable, IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { IExtension, IExtensionsWorkbenchService, IExtensionContainer } from '../common/extensions';
import { append, $, addClass } from 'vs/base/browser/dom';
import * as platform from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IExtensionManagementServerService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ILabelService } from 'vs/platform/label/common/label';
import { extensionButtonProminentBackground, extensionButtonProminentForeground } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { STATUS_BAR_HOST_NAME_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_FOREGROUND } from 'vs/workbench/common/theme';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';

export abstract class ExtensionWidget extends Disposable implements IExtensionContainer {
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }
	update(): void { this.render(); }
	abstract render(): void;
}

export class Label extends ExtensionWidget {

	constructor(
		private element: HTMLElement,
		private fn: (extension: IExtension) => string,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super();
		this.render();
	}

	render(): void {
		this.element.textContent = this.extension ? this.fn(this.extension) : '';
	}
}

export class InstallCountWidget extends ExtensionWidget {

	constructor(
		private container: HTMLElement,
		private small: boolean,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super();
		addClass(container, 'extension-install-count');
		this.render();
	}

	render(): void {
		this.container.innerHTML = '';

		if (!this.extension) {
			return;
		}

		const installCount = this.extension.installCount;

		if (installCount === undefined) {
			return;
		}

		let installLabel: string;

		if (this.small) {
			if (installCount > 1000000) {
				installLabel = `${Math.floor(installCount / 100000) / 10}M`;
			} else if (installCount > 1000) {
				installLabel = `${Math.floor(installCount / 1000)}K`;
			} else {
				installLabel = String(installCount);
			}
		}
		else {
			installLabel = installCount.toLocaleString(platform.locale);
		}

		append(this.container, $('span.octicon.octicon-cloud-download'));
		const count = append(this.container, $('span.count'));
		count.textContent = installLabel;
	}
}

export class RatingsWidget extends ExtensionWidget {

	constructor(
		private container: HTMLElement,
		private small: boolean
	) {
		super();
		addClass(container, 'extension-ratings');

		if (this.small) {
			addClass(container, 'small');
		}

		this.render();
	}

	render(): void {
		this.container.innerHTML = '';

		if (!this.extension) {
			return;
		}

		if (this.extension.rating === undefined) {
			return;
		}

		if (this.small && !this.extension.ratingCount) {
			return;
		}

		const rating = Math.round(this.extension.rating * 2) / 2;

		if (this.small) {
			append(this.container, $('span.full.star'));

			const count = append(this.container, $('span.count'));
			count.textContent = String(rating);
		} else {
			for (let i = 1; i <= 5; i++) {
				if (rating >= i) {
					append(this.container, $('span.full.star'));
				} else if (rating >= i - 0.5) {
					append(this.container, $('span.half.star'));
				} else {
					append(this.container, $('span.empty.star'));
				}
			}
		}
		this.container.title = this.extension.ratingCount > 1 ? localize('ratedByUsers', "Rated by {0} users", this.extension.ratingCount) : localize('ratedBySingleUser', "Rated by 1 user");
	}
}

export class RecommendationWidget extends ExtensionWidget {

	private element: HTMLElement;
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionTipsService private readonly extensionTipsService: IExtensionTipsService
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		this.parent.title = '';
		this.parent.setAttribute('aria-label', this.extension ? localize('viewExtensionDetailsAria', "{0}. Press enter for extension details.", this.extension.displayName) : '');
		if (this.element) {
			this.parent.removeChild(this.element);
		}
		this.element = null;
		this.disposables = dispose(this.disposables);
	}

	render(): void {
		this.clear();
		if (!this.extension) {
			return;
		}
		const updateRecommendationMarker = () => {
			this.clear();
			const extRecommendations = this.extensionTipsService.getAllRecommendationsWithReason();
			if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
				this.element = append(this.parent, $('div.bookmark'));
				const recommendation = append(this.element, $('.recommendation'));
				append(recommendation, $('span.octicon.octicon-star'));
				const applyBookmarkStyle = (theme) => {
					const bgColor = theme.getColor(extensionButtonProminentBackground);
					const fgColor = theme.getColor(extensionButtonProminentForeground);
					recommendation.style.borderTopColor = bgColor ? bgColor.toString() : 'transparent';
					recommendation.style.color = fgColor ? fgColor.toString() : 'white';
				};
				applyBookmarkStyle(this.themeService.getTheme());
				this.themeService.onThemeChange(applyBookmarkStyle, this, this.disposables);
				this.parent.title = extRecommendations[this.extension.identifier.id.toLowerCase()].reasonText;
				this.parent.setAttribute('aria-label', localize('viewRecommendedExtensionDetailsAria', "{0}. {1} Press enter for extension details.", this.extension.displayName, extRecommendations[this.extension.identifier.id.toLowerCase()].reasonText));
			}
		};
		updateRecommendationMarker();
		this.extensionTipsService.onRecommendationChange(() => updateRecommendationMarker(), this, this.disposables);
	}

}


export class RemoteBadgeWidget extends ExtensionWidget {

	private element: HTMLElement | null;
	private disposables: IDisposable[] = [];

	constructor(
		private parent: HTMLElement,
		@ILabelService private readonly labelService: ILabelService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this.render();
		this._register(toDisposable(() => this.clear()));
	}

	private clear(): void {
		if (this.element) {
			this.parent.removeChild(this.element);
		}
		this.element = null;
		this.disposables = dispose(this.disposables);
	}

	render(): void {
		this.clear();
		if (!this.extension || !this.extension.local) {
			return;
		}
		const server = this.extensionManagementServerService.getExtensionManagementServer(this.extension.local.location);
		if (server === this.extensionManagementServerService.remoteExtensionManagementServer) {
			this.element = append(this.parent, $('div.extension-remote-badge'));
			append(this.element, $('span.octicon.octicon-file-symlink-directory'));

			const applyBadgeStyle = () => {
				const bgColor = this.themeService.getTheme().getColor(STATUS_BAR_HOST_NAME_BACKGROUND);
				const fgColor = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY ? this.themeService.getTheme().getColor(STATUS_BAR_NO_FOLDER_FOREGROUND) : this.themeService.getTheme().getColor(STATUS_BAR_FOREGROUND);
				this.element.style.backgroundColor = bgColor ? bgColor.toString() : '';
				this.element.style.color = fgColor ? fgColor.toString() : '';
			};
			applyBadgeStyle();
			this.themeService.onThemeChange(applyBadgeStyle, this, this.disposables);
			this.workspaceContextService.onDidChangeWorkbenchState(applyBadgeStyle, this, this.disposables);

			const updateTitle = () => this.element.title = localize('remote extension title', "Extension in {0}", this.labelService.getHostLabel());
			this.labelService.onDidChangeFormatters(() => updateTitle(), this, this.disposables);
			updateTitle();
		}
	}

}
