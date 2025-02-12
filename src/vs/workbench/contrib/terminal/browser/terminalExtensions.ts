/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance } from './terminal.js';
import { TerminalWidgetManager } from './widgets/widgetManager.js';
import { ITerminalProcessInfo, ITerminalProcessManager } from '../common/terminal.js';

export interface ITerminalContributionContext {
	instance: ITerminalInstance;
	processManager: ITerminalProcessManager;
	widgetManager: TerminalWidgetManager;
}
export interface IDetachedCompatibleTerminalContributionContext {
	instance: IDetachedTerminalInstance;
	processManager: ITerminalProcessInfo;
	widgetManager: TerminalWidgetManager;
}

/** Constructor compatible with full terminal instances, is assignable to {@link DetachedCompatibleTerminalContributionCtor} */
export type TerminalContributionCtor = IConstructorSignature<ITerminalContribution, [ITerminalContributionContext]>;
/** Constructor compatible with detached terminals */
export type DetachedCompatibleTerminalContributionCtor = IConstructorSignature<ITerminalContribution, [IDetachedCompatibleTerminalContributionContext]>;

export type ITerminalContributionDescription = { readonly id: string } & (
	| { readonly canRunInDetachedTerminals: false; readonly ctor: TerminalContributionCtor }
	| { readonly canRunInDetachedTerminals: true; readonly ctor: DetachedCompatibleTerminalContributionCtor }
);

/**
 * A terminal contribution is a method for extending _each_ terminal created, providing the terminal
 * instance when it becomes ready and various convenient hooks for xterm.js like when it's opened in
 * the DOM.
 * @param id The unique ID of the terminal contribution.
 * @param ctor The constructor of the terminal contribution.
 * @param canRunInDetachedTerminals Whether the terminal contribution should be run in detecthed
 * terminals. Defaults to false.
 */
export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(ctx: ITerminalContributionContext, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals?: false): void;
export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(ctx: IDetachedCompatibleTerminalContributionContext, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals: true): void;
export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(ctx: any, ...services: Services): ITerminalContribution }, canRunInDetachedTerminals: boolean = false): void {
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	TerminalContributionRegistry.INSTANCE.registerTerminalContribution({ id, ctor, canRunInDetachedTerminals } as ITerminalContributionDescription);
}

/**
 * The registry of terminal contributions.
 *
 * **WARNING**: This is internal and should only be used by core terminal code that activates the
 * contributions.
 */
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
