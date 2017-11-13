/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// --- Workbench Contribution Registry

/**
 * A workbench contribution that will be loaded when the workbench starts and disposed when the workbench shuts down.
 */
export interface IWorkbenchContribution {

	/**
	 * The unique identifier of this workbench contribution.
	 */
	getId(): string;
}

export namespace Extensions {
	export const Workbench = 'workbench.contributions.kind';
}

export type IWorkbenchContributionSignature = IConstructorSignature0<IWorkbenchContribution>;

export interface IWorkbenchContributionsRegistry {

	/**
	 * Registers a workbench contribution to the platform that will be loaded when the workbench starts and disposed when
	 * the workbench shuts down.
	 *
	 * @param phase the lifecycle phase when to instantiate the contribution.
	 */
	registerWorkbenchContribution(contribution: IWorkbenchContributionSignature, phase?: LifecyclePhase): void;

	/**
	 * Starts the registry by providing the required services.
	 */
	start(instantiationService: IInstantiationService, lifecycleService: ILifecycleService): void;
}

export class WorkbenchContributionsRegistry implements IWorkbenchContributionsRegistry {
	private instantiationService: IInstantiationService;
	private lifecycleService: ILifecycleService;

	private toBeInstantiated: Map<LifecyclePhase, IConstructorSignature0<IWorkbenchContribution>[]> = new Map<LifecyclePhase, IConstructorSignature0<IWorkbenchContribution>[]>();

	public registerWorkbenchContribution(ctor: IWorkbenchContributionSignature, phase: LifecyclePhase = LifecyclePhase.Starting): void {

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

	public start(instantiationService: IInstantiationService, lifecycleService: ILifecycleService): void {
		this.instantiationService = instantiationService;
		this.lifecycleService = lifecycleService;

		[LifecyclePhase.Starting, LifecyclePhase.Restoring, LifecyclePhase.Running, LifecyclePhase.ShuttingDown].forEach(phase => {
			this.instantiateByPhase(instantiationService, lifecycleService, phase);
		});
	}

	private instantiateByPhase(instantiationService: IInstantiationService, lifecycleService: ILifecycleService, phase: LifecyclePhase): void {
		lifecycleService.when(phase).then(() => {
			const toBeInstantiated = this.toBeInstantiated.get(phase);
			if (toBeInstantiated) {
				while (toBeInstantiated.length > 0) {
					instantiationService.createInstance(toBeInstantiated.shift());
				}
			}
		});
	}
}

Registry.add(Extensions.Workbench, new WorkbenchContributionsRegistry());