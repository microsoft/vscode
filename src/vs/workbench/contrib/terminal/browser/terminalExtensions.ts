/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance } from './terminal.js';
import { TerminalWidgetManager } from './widgets/widgetManager.js';
import { ITerminalProcessInfo, ITerminalProcessManager } from '../common/terminal.js';

/** Constructor compatible with full terminal instances, is assignable to {@link DetachedCompatibleTerminalContributionCtor} */
export type TerminalContributionCtor = IConstructorSignature<ITerminalContribution, [ITerminalInstance, ITerminalProcessManager, TerminalWidgetManager]>;
/** Constructor compatible with detached terminals */
export type DetachedCompatibleTerminalContributionCtor = IConstructorSignature<ITerminalContribution, [IDetachedTerminalInstance, ITerminalProcessInfo, TerminalWidgetManager]>;

export type ITerminalContributionDescription = { readonly id: string } & (
	| { readonly canRunInDetachedTerminals: false; readonly ctor: TerminalContributionCtor }
	| { readonly canRunInDetachedTerminals: true; readonly ctor: DetachedCompatibleTerminalContributionCtor }
);

export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(instance: ITerminalInstance, processManager: ITerminalProcessManager, widgetManager: TerminalWidgetManager, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals?: false): void;
export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(instance: ITerminalInstance, processManager: ITerminalProcessInfo, widgetManager: TerminalWidgetManager, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals: true): void;
export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(instance: ITerminalInstance, processManager: ITerminalProcessManager, widgetManager: TerminalWidgetManager, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals = false): void {
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	TerminalContributionRegistry.INSTANCE.registerTerminalContribution({ id, ctor, canRunInDetachedTerminals } as ITerminalContributionDescription);
}

export namespace TerminalExtensionsRegistry {
	export function getTerminalContributions(): ITerminalContributionDescription[] {
		return TerminalContributionRegistry.INSTANCE.getTerminalContributions();
	}
}

class TerminalContributionRegistry {

	public static readonly INSTANCE = new TerminalContributionRegistry();

	private readonly _terminalContributions: ITerminalContributionDescription[] = [];

	constructor() {
	}

	public registerTerminalContribution(description: ITerminalContributionDescription): void {
		this._terminalContributions.push(description);
	}

	public getTerminalContributions(): ITerminalContributionDescription[] {
		return this._terminalContributions.slice(0);
	}
}

const enum Extensions {
	TerminalContributions = 'terminal.contributions'
}

Registry.add(Extensions.TerminalContributions, TerminalContributionRegistry.INSTANCE);
