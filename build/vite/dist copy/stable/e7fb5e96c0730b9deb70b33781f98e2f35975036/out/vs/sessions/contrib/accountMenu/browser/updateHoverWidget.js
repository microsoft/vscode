/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import './media/updateHoverWidget.css';
export class UpdateHoverWidget {
    constructor(updateService, productService, hoverService, stateProvider) {
        this.updateService = updateService;
        this.productService = productService;
        this.hoverService = hoverService;
        this.stateProvider = stateProvider;
    }
    attachTo(target) {
        return this.hoverService.setupDelayedHover(target, () => ({
            content: this.createHoverContent(),
            position: { hoverPosition: 1 /* HoverPosition.RIGHT */ },
            appearance: { showPointer: true }
        }), { groupId: 'sessions-account-update' });
    }
    createHoverContent(state = this.stateProvider?.() ?? this.updateService.state) {
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
    appendGridRow(grid, label, version, age, commit) {
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
    formatCompactAge(timestamp) {
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
    getUpdateFromState(state) {
        switch (state.type) {
            case "available for download" /* StateType.AvailableForDownload */:
            case "downloaded" /* StateType.Downloaded */:
            case "ready" /* StateType.Ready */:
            case "overwriting" /* StateType.Overwriting */:
            case "updating" /* StateType.Updating */:
                return state.update;
            case "downloading" /* StateType.Downloading */:
                return state.update;
            default:
                return undefined;
        }
    }
    /**
     * Returns progress as a percentage (0-100), or undefined if progress is not applicable.
     */
    getUpdateProgressPercent(state) {
        switch (state.type) {
            case "downloading" /* StateType.Downloading */: {
                const downloadingState = state;
                if (downloadingState.downloadedBytes !== undefined && downloadingState.totalBytes && downloadingState.totalBytes > 0) {
                    return Math.min(100, Math.round((downloadingState.downloadedBytes / downloadingState.totalBytes) * 100));
                }
                return 0;
            }
            case "updating" /* StateType.Updating */: {
                const updatingState = state;
                if (updatingState.currentProgress !== undefined && updatingState.maxProgress && updatingState.maxProgress > 0) {
                    return Math.min(100, Math.round((updatingState.currentProgress / updatingState.maxProgress) * 100));
                }
                return 0;
            }
            case "downloaded" /* StateType.Downloaded */:
            case "ready" /* StateType.Ready */:
                return 100;
            case "available for download" /* StateType.AvailableForDownload */:
            case "overwriting" /* StateType.Overwriting */:
                return 0;
            default:
                return undefined;
        }
    }
    getUpdateHeaderLabel(type) {
        const productName = this.productService.nameShort;
        switch (type) {
            case "ready" /* StateType.Ready */:
                return localize('updateReady', "{0} Update Ready", productName);
            case "available for download" /* StateType.AvailableForDownload */:
                return localize('downloadAvailable', "{0} Update Available", productName);
            case "downloading" /* StateType.Downloading */:
            case "overwriting" /* StateType.Overwriting */:
                return localize('downloadingUpdate', "Downloading {0}", productName);
            case "downloaded" /* StateType.Downloaded */:
                return localize('installingUpdate', "Installing {0}", productName);
            case "updating" /* StateType.Updating */:
                return localize('updatingApp', "Updating {0}", productName);
            default:
                return localize('updating', "Updating {0}", productName);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlSG92ZXJXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FjY291bnRNZW51L2Jyb3dzZXIvdXBkYXRlSG92ZXJXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBSTlDLE9BQU8sK0JBQStCLENBQUM7QUFFdkMsTUFBTSxPQUFPLGlCQUFpQjtJQUU3QixZQUNrQixhQUE2QixFQUM3QixjQUErQixFQUMvQixZQUEyQixFQUMzQixhQUEyQjtRQUgzQixrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDN0IsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQy9CLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQzNCLGtCQUFhLEdBQWIsYUFBYSxDQUFjO0lBQ3pDLENBQUM7SUFFTCxRQUFRLENBQUMsTUFBbUI7UUFDM0IsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUN6QyxNQUFNLEVBQ04sR0FBRyxFQUFFLENBQUMsQ0FBQztZQUNOLE9BQU8sRUFBRSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7WUFDbEMsUUFBUSxFQUFFLEVBQUUsYUFBYSw2QkFBcUIsRUFBRTtZQUNoRCxVQUFVLEVBQUUsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFO1NBQ2pDLENBQUMsRUFDRixFQUFFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxDQUN0QyxDQUFDO0lBQ0gsQ0FBQztJQUVELGtCQUFrQixDQUFDLFFBQWUsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLO1FBQ25GLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QyxNQUFNLGNBQWMs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