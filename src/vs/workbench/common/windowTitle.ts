/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';

export namespace Extensions {
	export const WindowTitle = 'workbench.windowTitle.variables';
}

export interface IWorkbenchWindowTitleContributionsRegistry {
	readonly contextKeys: Set<string>;

	getContributions(): IterableIterator<[string, IWorkbenchWindowTitleContributionRegistration]>;
	registerWorkbenchWindowTitleContribution(contribution: IWorkbenchWindowTitleContributionRegistration): void;
}

export interface IWorkbenchWindowTitleContributionRegistration {
	readonly contextKey: string;
	readonly variable: string;
	readonly description: string;
}

export class WorkbenchWindowTitleContributionsRegistry implements IWorkbenchWindowTitleContributionsRegistry {

	readonly contextKeys = new Set<string>();
	private readonly contributions = new Map<string, IWorkbenchWindowTitleContributionRegistration>();

	getContributions(): IterableIterator<[string, IWorkbenchWindowTitleContributionRegistration]> {
		return this.contributions.entries();
	}

	registerWorkbenchWindowTitleContribution(contribution: IWorkbenchWindowTitleContributionRegistration): void {
		this.contextKeys.add(contribution.contextKey);
		this.contributions.set(contribution.variable, contribution);
	}
}

const registry = new WorkbenchWindowTitleContributionsRegistry();
Registry.add(Extensions.WindowTitle, registry);

export function getWorkbenchWindowTitleContributionContextKeys(): Set<string> {
	return registry.contextKeys;
}

export function getWorkbenchWindowTitleContributions(): IterableIterator<[string, IWorkbenchWindowTitleContributionRegistration]> {
	return registry.getContributions();
}
