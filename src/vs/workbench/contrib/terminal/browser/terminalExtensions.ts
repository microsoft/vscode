/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITerminalContribution, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';

export type TerminalContributionCtor = IConstructorSignature<ITerminalContribution, [ITerminalInstance, ITerminalProcessManager, TerminalWidgetManager]>;

export interface ITerminalContributionDescription {
	readonly id: string;
	readonly ctor: TerminalContributionCtor;
}

export function registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(instance: ITerminalInstance, processManager: ITerminalProcessManager, widgetManager: TerminalWidgetManager, ...services: Services): ITerminalContribution }): void {
	TerminalContributionRegistry.INSTANCE.registerTerminalContribution(id, ctor);
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

	public registerTerminalContribution<Services extends BrandedService[]>(id: string, ctor: { new(instance: ITerminalInstance, processManager: ITerminalProcessManager, widgetManager: TerminalWidgetManager, ...services: Services): ITerminalContribution }): void {
		this._terminalContributions.push({ id, ctor: ctor as TerminalContributionCtor });
	}

	public getTerminalContributions(): ITerminalContributionDescription[] {
		return this._terminalContributions.slice(0);
	}
}

const enum Extensions {
	TerminalContributions = 'terminal.contributions'
}

Registry.add(Extensions.TerminalContributions, TerminalContributionRegistry.INSTANCE);
