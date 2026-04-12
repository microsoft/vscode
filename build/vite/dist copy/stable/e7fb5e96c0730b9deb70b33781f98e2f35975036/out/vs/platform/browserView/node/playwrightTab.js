/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createCancelablePromise, raceCancellablePromises } from '../../../base/common/async.js';
/**
 * Thrown when a dialog (alert, confirm, prompt) opens while a page action is
 * running. The caller should defer the underlying promise and let the agent
 * handle the dialog before retrying.
 */
export class DialogInterruptedError extends Error {
    constructor() {
        super('Action was interrupted by a dialog');
        this.name = 'DialogInterruptedError';
    }
}
/**
 * Wrapper around a Playwright page that tracks additional state like active dialogs and recent console messages,
 * and can produce a summary of the page's current state for use in tools.
 *
 * Loosely based on https://github.com/microsoft/playwright/blob/main/packages/playwright/src/mcp/browser/tab.ts.
 */
export class PlaywrightTab {
    constructor(
    /**
     * @deprecated prefer accessing the page via safeRunAgainstPage.
     * Only use this directly if you are sure it cannot be blocked by dialogs.
     */
    page) {
        this.page = page;
        this._onDialogStateChanged = new Emitter();
        this._logs = [];
        this._needsFullSnapshot = false;
        page.on('console', event => this._handleConsoleMessage(event))
            .on('pageerror', error => this._handlePageError(error))
            .on('requestfailed', request => this._handleRequestFailed(request))
            .on('dialog', dialog => this._handleDialog(dialog))
            .on('download', download => this._handleDownload(download));
        this._initialized = this._initialize();
    }
    async _initialize() {
        const messages = await this.page.consoleMessages().catch(() => []);
        for (const message of messages) {
            this._handleConsoleMessage(message);
        }
        const errors = await this.page.pageErrors().catch(() => []);
        for (const error of errors) {
            this._handlePageError(error);
        }
    }
    _handleDialog(dialog) {
        this._dialog = dialog;
        // Playwright doesn't give us an event for when a dialog is closed, so we run a no-op script to know when it closes.
        this.page.waitForFunction(() => true, undefined, { timeout: 0 }).then(() => {
            if (this._dialog === dialog) {
                this._dialog = undefined;
                this._onDialogStateChanged.fire();
            }
        });
        this._onDialogStateChanged.fire();
    }
    async replyToDialog(accept, promptText) {
        if (!this._dialog) {
            throw new Error('No active modal dialog to respond to');
        }
        const dialog = this._dialog;
        this._dialog = undefined;
        this._onDialogStateChanged.fire();
        await this.safeRunAgainstPage(async () => {
            if (accept) {
                await dialog.accept(promptText);
            }
            else {
                await dialog.dismiss();
            }
        });
    }
    _handleFileChooser(chooser) {
        this._fileChooser = chooser;
    }
    async replyToFileChooser(files) {
        if (!this._fileChooser) {
            throw new Error('No active file chooser dialog to respond to');
        }
        const chooser = this._fileChooser;
        this._fileChooser = undefined;
        await this.safeRunAgainstPage(() => chooser.setFiles(files));
    }
    async _handleDownload(download) {
        this._logs.push({ type: 'download', time: Date.now(), description: `${download.suggestedFilename()}` });
    }
    _handleRequestFailed(request) {
        const timing = request.timing();
        this._logs.push({ type: 'requestFailed', time: timing.responseEnd + timing.startTime, description: `${request.method()} request to ${request.url()} failed: "${request.failure()?.errorText}"` });
    }
    _handleConsoleMessage(message) {
        if (message.type() === 'error' || message.type() === 'warning') {
            this._logs.push({ type: 'console', time: message.timestamp(), description: `[${message.type()}] ${message.text()}` });
        }
    }
    _handlePageError(error) {
        this._logs.push({ type: 'pageError', time: Date.now(), description: error.stack ?? error.message });
    }
    /**
     * Run a callback against the page and wait for it to complete.
     *
     * Because dialogs pause the page, execution races against any dialog that opens -- if a dialog
     * appears before the callback finishes, the method throws so the caller can surface it to the agent.
     *
     * Also allows for interactions to be handled differently when triggered by agents.
     * E.g. file dialogs should appear when the user triggers one, but not when the agent does.
     */
    async safeRunAgainstPage(action) {
        if (this._dialog) {
            throw new Error(`Cannot perform action while a dialog is open`);
        }
        let actionDidComplete = false;
        let result;
        const dialogOpened = Event.toPromise(this._onDialogStateChanged.event);
        const actionCompleted = createCancelablePromise(async (token) => {
            // Whenever the page has a `filechooser` handler, the default file chooser is disabled.
            // We don't want this during normal user interactions, but we do for agentic interactions.
            // So we add a handler just during the action, and remove it afterwards.
            // This isn't perfect (e.g. the user could trigger it while an action is running), but it's a best effort.
            const handleFileChooser = (chooser) => this._handleFileChooser(chooser);
            this.page.on('filechooser', handleFileChooser);
            try {
                result = await this.runAndWaitForCompletion((token) => action(this.page, token), token);
                actionDidComplete = true;
            }
            finally {
                this.page.off('filechooser', handleFileChooser);
            }
        });
        return raceCancellablePromises([dialogOpened, actionCompleted]).then(() => {
            if (!actionDidComplete) {
                // A dialog was opened before the action completed. Note we don't cancel the action, just ignore its result.
                throw new DialogInterruptedError();
            }
            return result;
        });
    }
    async getSummary(full = this._needsFullSnapshot) {
        await this._initialized;
        if (full && this._needsFullSnapshot) {
            this._needsFullSnapshot = false;
        }
        const snapshotFromPage = await this.safeRunAgainstPage((page) => this.getAiSnapshot(page, full)).catch(() => {
            this._needsFullSnapshot = true;
            return undefined;
        });
        const title = await this.safeRunAgainstPage((page) => page.title()).catch(() => '');
        const logs = this._logs;
        this._logs = [];
        const snapshot = snapshotFromPage?.trim() ?? '';
        return [
            ...(title ? [`Page Title: ${title}`] : []),
            `URL: ${this.page.url()}`,
            ...(this._dialog ? [`Active ${this._dialog.type()} dialog: "${this._dialog.message()}"`] : []),
            ...(this._fileChooser ? [`Active file chooser dialog`] : []),
            ...(logs.length > 0 ? [
                `Recent events:`,
                ...logs.map(log => `- [${new Date(log.time).toISOString()}] (${log.type}) ${log.description}`)
            ] : []),
            `Snapshot: ${snapshotFromPage ? snapshot ? `\n${snapshot}` : '<unchanged>' : '<unavailable>'}`,
        ].join('\n');
    }
    getAiSnapshot(page, full) {
        const options = { mode: 'ai' };
        if (!full) {
            options._track = 'response';
        }
        return page.ariaSnapshot(options);
    }
    async runAndWaitForCompletion(callback, token = CancellationToken.None) {
        const requests = [];
        const requestListener = (request) => requests.push(request);
        const disposeListeners = () => {
            this.page.off('request', requestListener);
        };
        this.page.on('request', requestListener);
        let result;
        try {
            result = await callback(token);
        }
        finally {
            disposeListeners();
        }
        const requestedNavigation = requests.some(request => request.isNavigationRequest());
        if (requestedNavigation) {
            await this.page.mainFrame().waitForLoadState('load', { timeout: 10000 }).catch(() => { });
            return result;
        }
        const promises = [];
        for (const request of requests) {
            if (['document', 'stylesheet', 'script', 'xhr', 'fetch'].includes(request.resourceType())) {
                promises.push(request.response().then(r => r?.finished()).catch(() => { }));
            }
            else {
                promises.push(request.response().catch(() => { }));
            }
        }
        const timeout = new Promise(resolve => setTimeout(resolve, 5000));
        await Promise.race([Promise.all(promises), timeout]);
        return result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheXdyaWdodFRhYi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L25vZGUvcGxheXdyaWdodFRhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBV2pHOzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsS0FBSztJQUNoRDtRQUNDLEtBQUssQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxJQUFJLEdBQUcsd0JBQXdCLENBQUM7SUFDdEMsQ0FBQztDQUNEO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLE9BQU8sYUFBYTtJQVV6QjtJQUNDOzs7T0FHRztJQUNjLElBQXFCO1FBQXJCLFNBQUksR0FBSixJQUFJLENBQWlCO1FBZC9CLDBCQUFxQixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFJNUMsVUFBSyxHQUEwRCxFQUFFLENBQUM7UUFDbEUsdUJBQWtCLEdBQUcsS0FBSyxDQUFDO1FBV2xDLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxDQUFDO2FBQzVELEVBQUUsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdEQsRUFBRSxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxv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