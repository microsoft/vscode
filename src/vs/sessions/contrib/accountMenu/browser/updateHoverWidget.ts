/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Downloading, IUpdate, IUpdateService, State, StateType, Updating } from '../../../../platform/update/common/update.js';
import './media/updateHoverWidget.css';

export class UpdateHoverWidget {

	constructor(
		private readonly updateService: IUpdateService,
		private readonly productService: IProductService,
		private readonly hoverService: IHoverService,
	) { }

	attachTo(target: HTMLElement) {
		return this.hoverService.setupDelayedHover(
			target,
			() => ({
				content: this.createHoverContent(),
				position: { hoverPosition: HoverPosition.RIGHT },
				appearance: { showPointer: true }
			}),
			{ groupId: 'sessions-account-update' }
		);
	}

	createHoverContent(state: State = this.updateService.state): HTMLElement {
		const update = this.getUpdateFromState(state);
		const currentVersion = this.productService.version ?? localize('unknownVersion', "Unknown");
		const targetVersion = update?.productVersion ?? update?.version ?? localize('unknownVersion', "Unknown");
		const currentCommit = this.productService.commit;
		const targetCommit = update?.version;
		const progressPercent = this.getUpdateProgressPercent(state);

		const container = document.createElement('div');
		container.classList.add('sessions-update-hover');

		// Header: e.g. "Downloading VS Code Insiders"
		const header = document.createElement('div');
		header.classList.add('sessions-update-hover-header');
		header.textContent = this.getUpdateHeaderLabel(state.type);
		container.appendChild(header);

		// Progress bar
		if (progressPercent !== undefined) {
			const progressTrack = document.createElement('div');
			progressTrack.classList.add('sessions-update-hover-progress-track');
			const progressFill = document.createElement('div');
			progressFill.classList.add('sessions-update-hover-progress-fill');
			progressFill.style.width = `${progressPercent}%`;
			progressTrack.appendChild(progressFill);
			container.appendChild(progressTrack);
		}

		// Version info grid
		const detailsGrid = document.createElement('div');
		detailsGrid.classList.add('sessions-update-hover-grid');

		const currentDate = this.productService.date ? new Date(this.productService.date) : undefined;
		const currentAge = currentDate ? this.formatCompactAge(currentDate.getTime()) : undefined;
		const newAge = update?.timestamp ? this.formatCompactAge(update.timestamp) : undefined;

		this.appendGridRow(detailsGrid, localize('updateHoverCurrentVersionLabel', "Current"), currentVersion, currentAge, currentCommit);
		this.appendGridRow(detailsGrid, localize('updateHoverNewVersionLabel', "New"), targetVersion, newAge, targetCommit);

		container.appendChild(detailsGrid);

		return container;
	}

	private appendGridRow(grid: HTMLElement, label: string, version: string, age?: string, commit?: string): void {
		const labelEl = document.createElement('span');
		labelEl.classList.add('sessions-update-hover-label');
		labelEl.textContent = label;
		grid.appendChild(labelEl);

		const versionEl = document.createElement('span');
		versionEl.classList.add('sessions-update-hover-version');
		versionEl.textContent = version;
		grid.appendChild(versionEl);

		const ageEl = document.createElement('span');
		ageEl.classList.add('sessions-update-hover-age');
		ageEl.textContent = age ?? '';
		grid.appendChild(ageEl);

		const commitEl = document.createElement('span');
		commitEl.classList.add('sessions-update-hover-commit');
		commitEl.textContent = commit ? commit.substring(0, 7) : '';
		grid.appendChild(commitEl);
	}

	private formatCompactAge(timestamp: number): string {
		const seconds = Math.round((Date.now() - timestamp) / 1000);
		if (seconds < 60) {
			return localize('compactAgeNow', "now");
		}
		const minutes = Math.round(seconds / 60);
		if (minutes < 60) {
			return localize('compactAgeMinutes', "{0}m ago", minutes);
		}
		const hours = Math.round(seconds / 3600);
		if (hours < 24) {
			return localize('compactAgeHours', "{0}h ago", hours);
		}
		const days = Math.round(seconds / 86400);
		if (days < 7) {
			return localize('compactAgeDays', "{0}d ago", days);
		}
		const weeks = Math.round(days / 7);
		if (weeks < 5) {
			return localize('compactAgeWeeks', "{0}w ago", weeks);
		}
		const months = Math.round(days / 30);
		return localize('compactAgeMonths', "{0}mo ago", months);
	}

	private getUpdateFromState(state: State): IUpdate | undefined {
		switch (state.type) {
			case StateType.AvailableForDownload:
			case StateType.Downloaded:
			case StateType.Ready:
			case StateType.Overwriting:
			case StateType.Updating:
				return state.update;
			case StateType.Downloading:
				return state.update;
			default:
				return undefined;
		}
	}

	/**
	 * Returns progress as a percentage (0-100), or undefined if progress is not applicable.
	 */
	private getUpdateProgressPercent(state: State): number | undefined {
		switch (state.type) {
			case StateType.Downloading: {
				const downloadingState = state as Downloading;
				if (downloadingState.downloadedBytes !== undefined && downloadingState.totalBytes && downloadingState.totalBytes > 0) {
					return Math.min(100, Math.round((downloadingState.downloadedBytes / downloadingState.totalBytes) * 100));
				}
				return 0;
			}
			case StateType.Updating: {
				const updatingState = state as Updating;
				if (updatingState.currentProgress !== undefined && updatingState.maxProgress && updatingState.maxProgress > 0) {
					return Math.min(100, Math.round((updatingState.currentProgress / updatingState.maxProgress) * 100));
				}
				return 0;
			}
			case StateType.Downloaded:
			case StateType.Ready:
				return 100;
			case StateType.AvailableForDownload:
			case StateType.Overwriting:
				return 0;
			default:
				return undefined;
		}
	}

	private getUpdateHeaderLabel(type: StateType): string {
		const productName = this.productService.nameShort;
		switch (type) {
			case StateType.Ready:
				return localize('updateReady', "{0} Update Ready", productName);
			case StateType.AvailableForDownload:
				return localize('downloadAvailable', "{0} Update Available", productName);
			case StateType.Downloading:
			case StateType.Overwriting:
				return localize('downloadingUpdate', "Downloading {0}", productName);
			case StateType.Downloaded:
				return localize('installingUpdate', "Installing {0}", productName);
			case StateType.Updating:
				return localize('updatingApp', "Updating {0}", productName);
			default:
				return localize('updating', "Updating {0}", productName);
		}
	}
}
