/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { DeferredPromise, runWhenGlobalIdle } from '../../base/common/async.js';
import { mark } from '../../base/common/performance.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IEnvironmentService } from '../../platform/environment/common/environment.js';
import { getOrSet } from '../../base/common/map.js';
import { Disposable, DisposableStore, isDisposable } from '../../base/common/lifecycle.js';
import { IEditorPaneService } from '../services/editor/common/editorPaneService.js';
export var Extensions;
(function (Extensions) {
    /**
     * @deprecated use `registerWorkbenchContribution2` instead.
     */
    Extensions.Workbench = 'workbench.contributions.kind';
})(Extensions || (Extensions = {}));
export var WorkbenchPhase;
(function (WorkbenchPhase) {
    /**
     * The first phase signals that we are about to startup getting ready.
     *
     * Note: doing work in this phase blocks an editor from showing to
     * the user, so please rather consider to use the other types, preferable
     * `Lazy` to only instantiate the contribution when really needed.
     */
    WorkbenchPhase[WorkbenchPhase["BlockStartup"] = 1] = "BlockStartup";
    /**
     * Services are ready and the window is about to restore its UI state.
     *
     * Note: doing work in this phase blocks an editor from showing to
     * the user, so please rather consider to use the other types, preferable
     * `Lazy` to only instantiate the contribution when really needed.
     */
    WorkbenchPhase[WorkbenchPhase["BlockRestore"] = 2] = "BlockRestore";
    /**
     * Views, panels and editors have restored. Editors are given a bit of
     * time to restore their contents.
     */
    WorkbenchPhase[WorkbenchPhase["AfterRestored"] = 3] = "AfterRestored";
    /**
     * The last phase after views, panels and editors have restored and
     * some time has passed (2-5 seconds).
     */
    WorkbenchPhase[WorkbenchPhase["Eventually"] = 4] = "Eventually";
})(WorkbenchPhase || (WorkbenchPhase = {}));
function isOnEditorWorkbenchContributionInstantiation(obj) {
    const candidate = obj;
    return !!candidate && typeof candidate.editorTypeId === 'string';
}
function toWorkbenchPhase(phase) {
    switch (phase) {
        case 3 /* LifecyclePhase.Restored */:
            return 3 /* WorkbenchPhase.AfterRestored */;
        case 4 /* LifecyclePhase.Eventually */:
            return 4 /* WorkbenchPhase.Eventually */;
    }
}
function toLifecyclePhase(instantiation) {
    switch (instantiation) {
        case 1 /* WorkbenchPhase.BlockStartup */:
            return 1 /* LifecyclePhase.Starting */;
        case 2 /* WorkbenchPhase.BlockRestore */:
            return 2 /* LifecyclePhase.Ready */;
        case 3 /* WorkbenchPhase.AfterRestored */:
            return 3 /* LifecyclePhase.Restored */;
        case 4 /* WorkbenchPhase.Eventually */:
            return 4 /* LifecyclePhase.Eventually */;
    }
}
export class WorkbenchContributionsRegistry extends Disposable {
    constructor() {
        super(...arguments);
        this.contributionsByPhase = new Map();
        this.contributionsByEditor = new Map();
        this.contributionsById = new Map();
        this.instancesById = new Map();
        this.instanceDisposables = this._register(new DisposableStore());
        this.timingsByPhase = new Map();
        this.pendingRestoredContributions = new DeferredPromise();
        this.whenRestored = this.pendingRestoredContributions.p;
    }
    static { this.INSTANCE = new WorkbenchContributionsRegistry(); }
    static { this.BLOCK_BEFORE_RESTORE_WARN_THRESHOLD = 20; }
    static { this.BLOCK_AFTER_RESTORE_WARN_THRESHOLD = 100; }
    get timings() { return this.timingsByPhase; }
    registerWorkbenchContribution2(id, ctor, instantiation) {
        const contribution = { id, ctor };
        // Instantiate directly if we already have a matching instantiation condition
        if (this.instantiationService && this.lifecycleService && this.logService && this.environmentService && this.editorPaneService &&
            ((typeof instantiation === 'number' && this.lifecycleService.phase >= instantiation) ||
                (typeof id === 'string' && isOnEditorWorkbenchContributionInstantiation(instantiation) && this.editorPaneService.didInstantiateEditorPane(instantiation.editorTypeId)))) {
            this.safeCreateContribution(this.instantiationService, this.logService, this.environmentService, contribution, typeof instantiation === 'number' ? toLifecyclePhase(instantiation) : this.lifecycleService.phase);
        }
        // Otherwise keep contributions by instantiation kind for later instantiation
        else {
            // by phase
            if (typeof instantiation === 'number') {
                getOrSet(this.contributionsByPhase, toLifecyclePhase(instantiation), []).push(contribution);
            }
            if (typeof id === 'string') {
                // by id
                if (!this.contributionsById.has(id)) {
                    this.contributionsById.set(id, contribution);
                }
                else {
                    console.error(`IWorkbenchContributionsRegistry#registerWorkbenchContribution(): Can't register multiple contributions with same id '${id}'`);
                }
                // by editor
                if (isOnEditorWorkbenchContributionInstantiation(instantiation)) {
                    getOrSet(this.contributionsByEditor, instantiation.editorTypeId, []).push(contribution);
                }
            }
        }
    }
    registerWorkbenchContribution(ctor, phase) {
        this.registerWorkbenchContribution2(undefined, ctor, toWorkbenchPhase(phase));
    }
    getWorkbenchContribution(id) {
        if (this.instancesById.has(id)) {
            return this.instancesById.get(id);
        }
        const instantiationService = this.instantiationService;
        const lifecycleService = this.lifecycleService;
        const logService = this.logService;
        const environmentService = this.environmentService;
        if (!instantiationService || !lifecycleService || !logService || !environmentService) {
            throw new Error(`IWorkbenchContributionsRegistry#getContribution('${id}'): cannot be called before registry started`);
        }
        const contribution = this.contributionsById.get(id);
        if (!contribution) {
            throw new Error(`IWorkbenchContributionsRegistry#getContribution('${id}'): contribution with that identifier is unknown.`);
        }
        if (lifecycleService.phase < 3 /* LifecyclePhase.Restored */) {
            logService.warn(`IWorkbenchContributionsRegistry#getContribution('${id}'): contribution instantiated before LifecyclePhase.Restored!`);
        }
        this.safeCreateContribution(instantiationService, logService, environmentService, contribution, lifecycleService.phase);
        const instance = this.instancesById.get(id);
        if (!instance) {
            throw new Error(`IWorkbenchContributionsRegistry#getContribution('${id}'): failed to create contribution.`);
        }
        return instance;
    }
    start(accessor) {
        const instantiationService = this.instantiationService = accessor.get(IInstantiationService);
        const lifecycleService = this.lifecycleService = accessor.get(ILifecycleService);
        const logService = this.logService = accessor.get(ILogService);
        const environmentService = this.environmentService = accessor.get(IEnvironmentService);
        const editorPaneService = this.editorPaneService = accessor.get(IEditorPaneService);
        // Dispose contributions on shutdown
        this._register(lifecycleService.onDidShutdown(() => {
            this.instanceDisposables.clear();
        }));
        // Instantiate contributions by phase when they are ready
        for (const phase of [1 /* LifecyclePhase.Starting */, 2 /* LifecyclePhase.Ready */, 3 /* LifecyclePhase.Restored */, 4 /* LifecyclePhase.Eventually */]) {
            this.instantiateByPhase(instantiationService, lifecycleService, logService, environmentService, phase);
        }
        // Instantiate contributions by editor when they are created or have been
        for (const editorTypeId of this.contributionsByEditor.keys()) {
            if (editorPaneService.didInstantiateEditorPane(editorTypeId)) {
                this.onEditor(editorTypeId, instantiationService, lifecycleService, logService, environmentService);
            }
        }
        this._register(editorPaneService.onWillInstantiateEditorPane(e => this.onEditor(e.typeId, instantiationService, lifecycleService, logService, environmentService)));
    }
    onEditor(editorTypeId, instantiationService, lifecycleService, logService, environmentService) {
        const contributions = this.contributionsByEditor.get(editorTypeId);
        if (contributions) {
            this.contributionsByEditor.delete(editorTypeId);
            for (const contribution of contributions) {
                this.safeCreateContribution(instantiationService, logService, environmentService, contribution, lifecycleService.phase);
            }
        }
    }
    instantiateByPhase(instantiationService, lifecycleService, logService, environmentService, phase) {
        // Instantiate contributions directly when phase is already reached
        if (lifecycleService.phase >= phase) {
            this.doInstantiateByPhase(instantiationService, logService, environmentService, phase);
        }
        // Otherwise wait for phase to be reached
        else {
            lifecycleService.when(phase).then(() => this.doInstantiateByPhase(instantiationService, logService, environmentService, phase));
        }
    }
    async doInstantiateByPhase(instantiationService, logService, environmentService, phase) {
        const contributions = this.contributionsByPhase.get(phase);
        if (contributions) {
            this.contributionsByPhase.delete(phase);
            switch (phase) {
                case 1 /* LifecyclePhase.Starting */:
                case 2 /* LifecyclePhase.Ready */: {
                    // instantiate everything synchronously and blocking
                    // measure the time it takes as perf marks for diagnosis
                    mark(`code/willCreateWorkbenchContributions/${phase}`);
                    for (const contribution of contributions) {
                        this.safeCreateContribution(instantiationService, logService, environmentService, contribution, phase);
                    }
                    mark(`code/didCreateWorkbenchContributions/${phase}`);
                    break;
                }
                case 3 /* LifecyclePhase.Restored */:
                case 4 /* LifecyclePhase.Eventually */: {
                    // for the Restored/Eventually-phase we instantiate contributions
                    // only when idle. this might take a few idle-busy-cycles but will
                    // finish within the timeouts
                    // given that, we must ensure to await the contributions from the
                    // Restored-phase before we instantiate the Eventually-phase
                    if (phase === 4 /* LifecyclePhase.Eventually */) {
                        await this.pendingRestoredContributions.p;
                    }
                    this.doInstantiateWhenIdle(contributions, instantiationService, logService, environmentService, phase);
                    break;
                }
            }
        }
    }
    doInstantiateWhenIdle(contributions, instantiationService, logService, environmentService, phase) {
        mark(`code/willCreateWorkbenchContributions/${phase}`);
        let i = 0;
        const forcedTimeout = phase === 4 /* LifecyclePhase.Eventually */ ? 3000 : 500;
        const instantiateSome = (idle) => {
            while (i < contributions.length) {
                const contribution = contributions[i++];
                this.safeCreateContribution(instantiationService, logService, environmentService, contribution, phase);
                if (idle.timeRemaining() < 1) {
                    // time is up -> reschedule
                    runWhenGlobalIdle(instantiateSome, forcedTimeout);
                    break;
                }
            }
            if (i === contributions.length) {
                mark(`code/didCreateWorkbenchContributions/${phase}`);
                if (phase === 3 /* LifecyclePhase.Restored */) {
                    this.pendingRestoredContributions.complete();
                }
            }
        };
        runWhenGlobalIdle(instantiateSome, forcedTimeout);
    }
    safeCreateContribution(instantiationService, logService, environmentService, contribution, phase) {
        if (typeof contribution.id === 'string' && this.instancesById.has(contribution.id)) {
            return;
        }
        const now = Date.now();
        try {
            if (typeof contribution.id === 'string') {
                mark(`code/willCreateWorkbenchContribution/${phase}/${contribution.id}`);
            }
            const instance = instantiationService.createInstance(contribution.ctor);
            if (typeof contribution.id === 'string') {
                this.instancesById.set(contribution.id, instance);
                this.contributionsById.delete(contribution.id);
            }
            if (isDisposable(instance)) {
                this.instanceDisposables.add(instance);
            }
        }
        catch (error) {
            logService.error(`Unable to create workbench contribution '${contribution.id ?? contribution.ctor.name}'.`, error);
        }
        finally {
            if (typeof contribution.id === 'string') {
                mark(`code/didCreateWorkbenchContribution/${phase}/${contribution.id}`);
            }
        }
        if (typeof contribution.id === 'string' || !environmentService.isBuilt /* only log out of sources where we have good ctor names */) {
            const time = Date.now() - now;
            if (time > (phase < 3 /* LifecyclePhase.Restored */ ? WorkbenchContributionsRegistry.BLOCK_BEFORE_RESTORE_WARN_THRESHOLD : WorkbenchContributionsRegistry.BLOCK_AFTER_RESTORE_WARN_THRESHOLD)) {
                logService.warn(`Creation of workbench contribution '${contribution.id ?? contribution.ctor.name}' took ${time}ms.`);
            }
            if (typeof contribution.id === 'string') {
                let timingsForPhase = this.timingsByPhase.get(phase);
                if (!timingsForPhase) {
                    timingsForPhase = [];
                    this.timingsByPhase.set(phase, timingsForPhase);
                }
                timingsForPhase.push([contribution.id, time]);
            }
        }
    }
}
/**
 * Register a workbench contribution that will be instantiated
 * based on the `instantiation` property.
 */
export const registerWorkbenchContribution2 = WorkbenchContributionsRegistry.INSTANCE.registerWorkbenchContribution2.bind(WorkbenchContributionsRegistry.INSTANCE);
/**
 * Provides access to a workbench contribution with a specific identifier.
 * The contribution is created if not yet done.
 *
 * Note: will throw an error if
 * - called too early before the registry has started
 * - no contribution is known for the given identifier
 */
export const getWorkbenchContribution = WorkbenchContributionsRegistry.INSTANCE.getWorkbenchContribution.bind(WorkbenchContributionsRegistry.INSTANCE);
Registry.add(Extensions.Workbench, WorkbenchContributionsRegistry.INSTANCE);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQTJELE1BQU0sc0RBQXNELENBQUM7QUFDdEosT0FBTyxFQUFFLGlCQUFpQixFQUFrQixNQUFNLDJDQUEyQyxDQUFDO0FBQzlGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQWdCLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzlGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdkYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBU3BGLE1BQU0sS0FBVyxVQUFVLENBSzFCO0FBTEQsV0FBaUIsVUFBVTtJQUMxQjs7T0FFRztJQUNVLG9CQUFTLEdBQUcsOEJBQThCLENBQUM7QUFDekQsQ0FBQyxFQUxnQixVQUFVLEtBQVYsVUFBVSxRQUsxQjtBQUVELE1BQU0sQ0FBTixJQUFrQixjQStCakI7QUEvQkQsV0FBa0IsY0FBYztJQUUvQjs7Ozs7O09BTUc7SUFDSCxtRUFBc0MsQ0FBQTtJQUV0Qzs7Ozs7O09BTUc7SUFDSCxtRUFBbUMsQ0FBQTtJQUVuQzs7O09BR0c7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