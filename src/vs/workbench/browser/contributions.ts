/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { runWhenIdle, IdleDeadline } from 'vs/base/browser/browser';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, IWorkbenchContributionSignature, Extensions } from 'vs/workbench/common/contributions';

class WorkbenchContributionsRegistry implements IWorkbenchContributionsRegistry {
	private instantiationService: IInstantiationService;
	private lifecycleService: ILifecycleService;

	private toBeInstantiated: Map<LifecyclePhase, IConstructorSignature0<IWorkbenchContribution>[]> = new Map<LifecyclePhase, IConstructorSignature0<IWorkbenchContribution>[]>();

	registerWorkbenchContribution(ctor: IWorkbenchContributionSignature, phase: LifecyclePhase = LifecyclePhase.Starting): void {

		// Instantiate directly if we are already matching the provided phase
		if (this.instantiationService && this.lifecycleService && this.lifecycleService.phase >= phase) {
			this.instantiationService.createInstance(ctor);
		}

		// Otherwise keep contributions by lifecycle phase
		else {
			let toBeInstantiated = this.toBeInstantiated.get(phase);
			if (!toBeInstantiated) {
				toBeInstantiated = [];
				this.toBeInstantiated.set(phase, toBeInstantiated);
			}

			toBeInstantiated.push(ctor);
		}
	}

	start(instantiationService: IInstantiationService, lifecycleService: ILifecycleService): void {
		this.instantiationService = instantiationService;
		this.lifecycleService = lifecycleService;

		[LifecyclePhase.Starting, LifecyclePhase.Restoring, LifecyclePhase.Running, LifecyclePhase.Eventually].forEach(phase => {
			this.instantiateByPhase(instantiationService, lifecycleService, phase);
		});
	}

	private instantiateByPhase(instantiationService: IInstantiationService, lifecycleService: ILifecycleService, phase: LifecyclePhase): void {

		// Instantiate contributions directly when phase is already reached
		if (lifecycleService.phase >= phase) {
			this.doInstantiateByPhase(instantiationService, phase);
		}

		// Otherwise wait for phase to be reached
		else {
			lifecycleService.when(phase).then(() => {
				this.doInstantiateByPhase(instantiationService, phase);
			});
		}
	}

	private doInstantiateByPhase(instantiationService: IInstantiationService, phase: LifecyclePhase): void {
		const toBeInstantiated = this.toBeInstantiated.get(phase);
		if (!toBeInstantiated) {
			return;
		}
		if (phase !== LifecyclePhase.Eventually) {
			// instantiate every synchronously and blocking
			for (const ctor of toBeInstantiated) {
				instantiationService.createInstance(ctor);
			}
		} else {
			// for the Eventually-phase we instantiate contributions
			// only when idle. this might take a few idle-busy-cycles
			// but will finish within one second
			let i = 0;
			const instantiateSome = (idle: IdleDeadline) => {
				while (i < toBeInstantiated.length) {
					const ctor = toBeInstantiated[i++];
					instantiationService.createInstance(ctor);
					if (idle.timeRemaining() < 1) {
						// time is up -> reschedule
						runWhenIdle(instantiateSome, 1000);
						break;
					}
				}
			};
			runWhenIdle(instantiateSome, 1000);
		}
	}
}

Registry.add(Extensions.Workbench, new WorkbenchContributionsRegistry());
