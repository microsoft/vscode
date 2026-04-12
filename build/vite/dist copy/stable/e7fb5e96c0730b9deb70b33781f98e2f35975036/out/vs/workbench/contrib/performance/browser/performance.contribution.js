/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Extensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { PerfviewContrib, PerfviewInput } from './perfviewEditor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { InstantiationService, Trace } from '../../../../platform/instantiation/common/instantiationService.js';
import { EventProfiling } from '../../../../base/common/event.js';
import { InputLatencyContrib } from './inputLatencyContrib.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { GCBasedDisposableTracker, setDisposableTracker } from '../../../../base/common/lifecycle.js';
// -- startup performance view
registerWorkbenchContribution2(PerfviewContrib.ID, PerfviewContrib, { lazy: true });
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(PerfviewInput.Id, class {
    canSerialize() {
        return true;
    }
    serialize() {
        return '';
    }
    deserialize(instantiationService) {
        return instantiationService.createInstance(PerfviewInput);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'perfview.show',
            title: localize2('show.label', 'Startup Performance'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const editorService = accessor.get(IEditorService);
        const contrib = PerfviewContrib.get();
        return editorService.openEditor(contrib.getEditorInput(), { pinned: true });
    }
});
registerAction2(class PrintServiceCycles extends Action2 {
    constructor() {
        super({
            id: 'perf.insta.printAsyncCycles',
            title: localize2('cycles', 'Print Service Cycles'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const instaService = accessor.get(IInstantiationService);
        if (instaService instanceof InstantiationService) {
            const cycle = instaService._globalGraph?.findCycleSlow();
            if (cycle) {
                console.warn(`CYCLE`, cycle);
            }
            else {
                console.warn(`YEAH, no more cycles`);
            }
        }
    }
});
registerAction2(class PrintServiceTraces extends Action2 {
    constructor() {
        super({
            id: 'perf.insta.printTraces',
            title: localize2('insta.trace', 'Print Service Traces'),
            category: Categories.Developer,
            f1: true
        });
    }
    run() {
        if (Trace.all.size === 0) {
            console.log('Enable via `instantiationService.ts#_enableAllTracing`');
            return;
        }
        for (const item of Trace.all) {
            console.log(item);
        }
    }
});
registerAction2(class PrintEventProfiling extends Action2 {
    constructor() {
        super({
            id: 'perf.event.profiling',
            title: localize2('emitter', 'Print Emitter Profiles'),
            category: Categories.Developer,
            f1: true
        });
    }
    run() {
        if (EventProfiling.all.size === 0) {
            console.log('USE `EmitterOptions._profName` to enable profiling');
            return;
        }
        for (const item of EventProfiling.all) {
            console.log(`${item.name}: ${item.invocationCount} invocations COST ${item.elapsedOverall}ms, ${item.listenerCount} listeners, avg cost is ${item.durations.reduce((a, b) => a + b, 0) / item.durations.length}ms`);
        }
    }
});
// -- input latency
Registry.as(Extensions.Workbench).registerWorkbenchContribution(InputLatencyContrib, 4 /* LifecyclePhase.Eventually */);
// -- track leaking disposables, those that get GC'ed before having been disposed
let DisposableTracking = class DisposableTracking {
    static { this.Id = 'perf.disposableTracking'; }
    constructor(envService) {
        if (!envService.isBuilt && !envService.extensionTestsLocationURI) {
            setDisposableTracker(new GCBasedDisposableTracker());
        }
    }
};
DisposableTracking = __decorate([
    __param(0, IEnvironmentService)
], DisposableTracking);
registerWorkbenchContribution2(DisposableTracking.Id, DisposableTracking, 4 /* WorkbenchPhase.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyZm9ybWFuY2UuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcGVyZm9ybWFuY2UvYnJvd3Nlci9wZXJmb3JtYW5jZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBRXJILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBbUMsOEJBQThCLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDL0ksT0FBTyxFQUFFLGdCQUFnQixFQUE2QyxNQUFNLDJCQUEyQixDQUFDO0FBQ3hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDckUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNoSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLG9CQUFvQixFQUFFLE1BQU0sc0NBQXND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