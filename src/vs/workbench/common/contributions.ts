/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry, BaseRegistry } from 'vs/platform/registry/common/platform';
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

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
	 */
	registerWorkbenchContribution(contribution: IWorkbenchContributionSignature): void;

	/**
	 * Returns all workbench contributions that are known to the platform.
	 */
	getWorkbenchContributions(): IWorkbenchContribution[];

	setInstantiationService(service: IInstantiationService): void;
}

class WorkbenchContributionsRegistry extends BaseRegistry<IWorkbenchContribution> implements IWorkbenchContributionsRegistry {

	public registerWorkbenchContribution(ctor: IWorkbenchContributionSignature): void {
		super._register(ctor);
	}

	public getWorkbenchContributions(): IWorkbenchContribution[] {
		return super._getInstances();
	}

	public setWorkbenchContributions(contributions: IWorkbenchContribution[]): void {
		super._setInstances(contributions);
	}
}

Registry.add(Extensions.Workbench, new WorkbenchContributionsRegistry());