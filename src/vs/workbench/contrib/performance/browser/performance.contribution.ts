/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventProfiling } from '../../../../base/common/event.js';
import { GCBasedDisposableTracker, setDisposableTracker } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigExt, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationService, Trace } from '../../../../platform/instantiation/common/instantiationService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IWorkbenchContributionsRegistry, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry, IEditorSerializer } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { InputLatencyContrib } from './inputLatencyContrib.js';
import { PerfviewContrib, PerfviewInput } from './perfviewEditor.js';

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


Registry.as<IConfigurationRegistry>(ConfigExt.Configuration).registerConfiguration({
	id: 'performance',
	order: 101,
	title: localize('performanceConfigurationTitle', "Performance"),
	type: 'object',
	properties: {
		'telemetry.performance.inputLatencySamplingProbability': {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: 1,
			tags: ['experimental'],
			included: false,
			markdownDescription: localize('telemetry.performance.inputLatencySamplingProbability', "Probability (0 to 1) that input latency telemetry is reported for this session. Set to 0 to disable, 1 to always report."),
			experiment: {
				mode: 'auto'
			}
		}
	}
});

// -- track leaking disposables, those that get GC'ed before having been disposed


class DisposableTracking {
	static readonly Id = 'perf.disposableTracking';
	constructor(@IEnvironmentService envService: IEnvironmentService) {
		if (!envService.isBuilt && !envService.extensionTestsLocationURI) {
			setDisposableTracker(new GCBasedDisposableTracker());
		}
	}
}

registerWorkbenchContribution2(DisposableTracking.Id, DisposableTracking, WorkbenchPhase.Eventually);
