/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from 'vs/nls';
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Extensions, IWorkbenchContributionsRegistry, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorSerializer, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { PerfviewContrib, PerfviewInput } from 'vs/workbench/contrib/performance/browser/perfviewEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { InstantiationService, Trace } from 'vs/platform/instantiation/common/instantiationService';
import { EventProfiling } from 'vs/base/common/event';
import { InputLatencyContrib } from 'vs/workbench/contrib/performance/browser/inputLatencyContrib';

// -- startup performance view

registerWorkbenchContribution2(
	PerfviewContrib.ID,
	PerfviewContrib,
	{ lazy: true }
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	PerfviewInput.Id,
	class implements IEditorSerializer {
		canSerialize(): boolean {
			return true;
		}
		serialize(): string {
			return '';
		}
		deserialize(instantiationService: IInstantiationService): PerfviewInput {
			return instantiationService.createInstance(PerfviewInput);
		}
	}
);


registerAction2(class extends Action2 {

	constructor() {
		super({
			id: 'perfview.show',
			title: localize2('show.label', 'Startup Performance'),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
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

	run(accessor: ServicesAccessor) {
		const instaService = accessor.get(IInstantiationService);
		if (instaService instanceof InstantiationService) {
			const cycle = instaService._globalGraph?.findCycleSlow();
			if (cycle) {
				console.warn(`CYCLE`, cycle);
			} else {
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

	run(): void {
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

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	InputLatencyContrib,
	LifecyclePhase.Eventually
);
