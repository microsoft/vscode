/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { emptyProgressRunner } from '../../../../platform/progress/common/progress.js';
export class EditorProgressIndicator extends Disposable {
    constructor(progressBar, group) {
        super();
        this.progressBar = progressBar;
        this.group = group;
        this.registerListeners();
    }
    registerListeners() {
        // Stop any running progress when the active editor changes or
        // the group becomes empty.
        // In contrast to the composite progress indicator, we do not
        // track active editor progress and replay it later (yet).
        this._register(this.group.onDidModelChange(e => {
            if (e.kind === 8 /* GroupModelChangeKind.EDITOR_ACTIVE */ ||
                (e.kind === 6 /* GroupModelChangeKind.EDITOR_CLOSE */ && this.group.isEmpty)) {
                this.progressBar.stop().hide();
            }
        }));
    }
    show(infiniteOrTotal, delay) {
        // No editor open: ignore any progress reporting
        if (this.group.isEmpty) {
            return emptyProgressRunner;
        }
        if (infiniteOrTotal === true) {
            return this.doShow(true, delay);
        }
        return this.doShow(infiniteOrTotal, delay);
    }
    doShow(infiniteOrTotal, delay) {
        if (typeof infiniteOrTotal === 'boolean') {
            this.progressBar.infinite().show(delay);
        }
        else {
            this.progressBar.total(infiniteOrTotal).show(delay);
        }
        return {
            total: (total) => {
                this.progressBar.total(total);
            },
            worked: (worked) => {
                if (this.progressBar.hasTotal()) {
                    this.progressBar.worked(worked);
                }
                else {
                    this.progressBar.infinite().show();
                }
            },
            done: () => {
                this.progressBar.stop().hide();
            }
        };
    }
    async showWhile(promise, delay) {
        // No editor open: ignore any progress reporting
        if (this.group.isEmpty) {
            try {
                await promise;
            }
            catch (error) {
                // ignore
            }
        }
        return this.doShowWhile(promise, delay);
    }
    async doShowWhile(promise, delay) {
        try {
            this.progressBar.infinite().show(delay);
            await promise;
        }
        catch (error) {
            // ignore
        }
        finally {
            this.progressBar.stop().hide();
        }
    }
}
var ProgressIndicatorState;
(function (ProgressIndicatorState) {
    let Type;
    (function (Type) {
        Type[Type["None"] = 0] = "None";
        Type[Type["Done"] = 1] = "Done";
        Type[Type["Infinite"] = 2] = "Infinite";
        Type[Type["While"] = 3] = "While";
        Type[Type["Work"] = 4] = "Work";
    })(Type = ProgressIndicatorState.Type || (ProgressIndicatorState.Type = {}));
    ProgressIndicatorState.None = { type: 0 /* Type.None */ };
    ProgressIndicatorState.Done = { type: 1 /* Type.Done */ };
    ProgressIndicatorState.Infinite = { type: 2 /* Type.Infinite */ };
    class While {
        constructor(whilePromise, whileStart, whileDelay) {
            this.whilePromise = whilePromise;
            this.whileStart = whileStart;
            this.whileDelay = whileDelay;
            this.type = 3 /* Type.While */;
        }
    }
    ProgressIndicatorState.While = While;
    class Work {
        constructor(total, worked) {
            this.total = total;
            this.worked = worked;
            this.type = 4 /* Type.Work */;
        }
    }
    ProgressIndicatorState.Work = Work;
})(ProgressIndicatorState || (ProgressIndicatorState = {}));
export class ScopedProgressIndicator extends Disposable {
    constructor(progressBar, scope) {
        super();
        this.progressBar = progressBar;
        this.scope = scope;
        this.progressState = ProgressIndicatorState.None;
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.scope.onDidChangeActive(() => {
            if (this.scope.isActive) {
                this.onDidScopeActivate();
            }
            else {
                this.onDidScopeDeactivate();
            }
        }));
    }
    onDidScopeActivate() {
        // Return early if progress state indicates that progress is done
        if (this.progressState.type === ProgressIndicatorState.Done.type) {
            return;
        }
        // Replay Infinite Progress from Promise
        if (this.progressState.type === 3 /* ProgressIndicatorState.Type.While */) {
            let delay;
            if (this.progressState.whileDelay > 0) {
                const remainingDelay = this.progressState.whileDelay - (Date.now() - this.progressState.whileStart);
                if (remainingDelay > 0) {
                    delay = remainingDelay;
                }
            }
            this.doShowWhile(delay);
        }
        // Replay Infinite Progress
        else if (this.progressState.type === 2 /* ProgressIndicatorState.Type.Infinite */) {
            this.progressBar.infinite().show();
        }
        // Replay Finite Progress (Total & Worked)
        else if (this.progressState.type === 4 /* ProgressIndicatorState.Type.Work */) {
            if (this.progressState.total) {
                this.progressBar.total(this.progressState.total).show();
            }
            if (this.progressState.worked) {
                this.progressBar.worked(this.progressState.worked).show();
            }
        }
    }
    onDidScopeDeactivate() {
        this.progressBar.stop().hide();
    }
    show(infiniteOrTotal, delay) {
        // Sort out Arguments
        if (typeof infiniteOrTotal === 'boolean') {
            this.progressState = ProgressIndicatorState.Infinite;
        }
        else {
            this.progressState = new ProgressIndicatorState.Work(infiniteOrTotal, undefined);
        }
        // Active: Show Progress
        if (this.scope.isActive) {
            // Infinite: Start Progressbar and Show after Delay
            if (this.progressState.type === 2 /* ProgressIndicatorState.Type.Infinite */) {
                this.progressBar.infinite().show(delay);
            }
            // Finite: Start Progressbar and Show after Delay
            else if (this.progressState.type === 4 /* ProgressIndicatorState.Type.Work */ && typeof this.progressState.total === 'number') {
                this.progressBar.total(this.progressState.total).show(delay);
            }
        }
        return {
            total: (total) => {
                this.progressState = new ProgressIndicatorState.Work(total, this.progressState.type === 4 /* ProgressIndicatorState.Type.Work */ ? this.progressState.worked : undefined);
                if (this.scope.isActive) {
                    this.progressBar.total(total);
                }
            },
            worked: (worked) => {
                // Verify first that we are either not active or the progressbar has a total set
                if (!this.scope.isActive || this.progressBar.hasTotal()) {
                    this.progressState = new ProgressIndicatorState.Work(this.progressState.type === 4 /* ProgressIndicatorState.Type.Work */ ? this.progressState.total : undefined, this.progressState.type === 4 /* ProgressIndicatorState.Type.Work */ && typeof this.progressState.worked === 'number' ? this.progressState.worked + worked : worked);
                    if (this.scope.isActive) {
                        this.progressBar.worked(worked);
                    }
                }
                // Otherwise the progress bar does not support worked(), we fallback to infinite() progress
                else {
                    this.progressState = ProgressIndicatorState.Infinite;
                    this.progressBar.infinite().show();
                }
            },
            done: () => {
                this.progressState = ProgressIndicatorState.Done;
                if (this.scope.isActive) {
                    this.progressBar.stop().hide();
                }
            }
        };
    }
    async showWhile(promise, delay) {
        // Join with existing running promise to ensure progress is accurate
        if (this.progressState.type === 3 /* ProgressIndicatorState.Type.While */) {
            promise = Promise.allSettled([promise, this.progressState.whilePromise]);
        }
        // Keep Promise in State
        this.progressState = new ProgressIndicatorState.While(promise, delay || 0, Date.now());
        try {
            this.doShowWhile(delay);
            await promise;
        }
        catch (error) {
            // ignore
        }
        finally {
            // If this is not the last promise in the list of joined promises, skip this
            if (this.progressState.type !== 3 /* ProgressIndicatorState.Type.While */ || this.progressState.whilePromise === promise) {
                // The while promise is either null or equal the promise we last hooked on
                this.progressState = ProgressIndicatorState.None;
                if (this.scope.isActive) {
                    this.progressBar.stop().hide();
                }
            }
        }
    }
    doShowWhile(delay) {
        // Show Progress when active
        if (this.scope.isActive) {
            this.progressBar.infinite().show(delay);
        }
    }
}
export class AbstractProgressScope extends Disposable {
    get isActive() { return this._isActive; }
    constructor(scopeId, _isActive) {
        super();
        this.scopeId = scopeId;
        this._isActive = _isActive;
        this._onDidChangeActive = this._register(new Emitter());
        this.onDidChangeActive = this._onDidChangeActive.event;
    }
    onScopeOpened(scopeId) {
        if (scopeId === this.scopeId) {
            if (!this._isActive) {
                this._isActive = true;
                this._onDidChangeActive.fire();
            }
        }
    }
    onScopeClosed(scopeId) {
        if (scopeId === this.scopeId) {
            if (this._isActive) {
                this._isActive = false;
                this._onDidChangeActive.fire();
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NJbmRpY2F0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcHJvZ3Jlc3MvYnJvd3Nlci9wcm9ncmVzc0luZGljYXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWxFLE9BQU8sRUFBdUMsbUJBQW1CLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUk1SCxNQUFNLE9BQU8sdUJBQXdCLFNBQVEsVUFBVTtJQUV0RCxZQUNrQixXQUF3QixFQUN4QixLQUF1QjtRQUV4QyxLQUFLLEVBQUUsQ0FBQztRQUhTLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ3hCLFVBQUssR0FBTCxLQUFLLENBQWtCO1FBSXhDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxpQkFBaUI7UUFFeEIsOERBQThEO1FBQzlELDJCQUEyQjtRQUMzQiw2REFBNkQ7UUFDN0QsMERBQTBEO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM5QyxJQUNDLENBQUMsQ0FBQyxJQUFJLCtDQUF1QztnQkFDN0MsQ0FBQyxDQUFDLENBQUMsSUFBSSw4Q0FBc0MsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUNuRSxDQUFDO2dCQUNGLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBSUQsSUFBSSxDQUFDLGVBQThCLEVBQUUs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