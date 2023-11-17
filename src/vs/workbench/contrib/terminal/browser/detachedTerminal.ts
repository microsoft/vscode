/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Delayer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { OperatingSystem } from 'vs/base/common/platform';
import { MicrotaskDelay } from 'vs/base/common/symbols';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalCapabilityStore } from 'vs/platform/terminal/common/capabilities/terminalCapabilityStore';
import { IMergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { ITerminalBackend } from 'vs/platform/terminal/common/terminal';
import { IDetachedTerminalInstance, IDetachedXTermOptions, IDetachedXtermTerminal, ITerminalContribution, IXtermAttachToElementOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalExtensionsRegistry } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { XtermTerminal } from 'vs/workbench/contrib/terminal/browser/xterm/xtermTerminal';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { ITerminalProcessInfo, ProcessState } from 'vs/workbench/contrib/terminal/common/terminal';

export class DetachedTerminal extends Disposable implements IDetachedTerminalInstance {
	private readonly _widgets = this._register(new TerminalWidgetManager());
	public readonly capabilities = new TerminalCapabilityStore();
	private readonly _contributions: Map<string, ITerminalContribution> = new Map();

	public domElement?: HTMLElement;

	public get xterm(): IDetachedXtermTerminal {
		return this._xterm;
	}

	constructor(
		private readonly _xterm: XtermTerminal,
		options: IDetachedXTermOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(_xterm);

		// Initialize contributions
		const contributionDescs = TerminalExtensionsRegistry.getTerminalContributions();
		for (const desc of contributionDescs) {
			if (this._contributions.has(desc.id)) {
				onUnexpectedError(new Error(`Cannot have two terminal contributions with the same id ${desc.id}`));
				continue;
			}
			if (desc.canRunInDetachedTerminals === false) {
				continue;
			}

			let contribution: ITerminalContribution;
			try {
				contribution = instantiationService.createInstance(desc.ctor, this, options.processInfo, this._widgets);
				this._contributions.set(desc.id, contribution);
				this._register(contribution);
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		// xterm is already by the time DetachedTerminal is created, so trigger everything
		// on the next microtask, allowing the caller to do any extra initialization
		this._register(new Delayer(MicrotaskDelay)).trigger(() => {
			for (const contr of this._contributions.values()) {
				contr.xtermReady?.(this._xterm);
			}
		});
	}

	get selection(): string | undefined {
		return this._xterm && this.hasSelection() ? this._xterm.raw.getSelection() : undefined;
	}

	hasSelection(): boolean {
		return this._xterm.hasSelection();
	}

	clearSelection(): void {
		this._xterm.clearSelection();
	}

	focus(force?: boolean): void {
		if (force || !dom.getActiveWindow().getSelection()?.toString()) {
			this.xterm.focus();
		}
	}

	attachToElement(container: HTMLElement, options?: Partial<IXtermAttachToElementOptions> | undefined): void {
		this.domElement = container;
		const screenElement = this._xterm.attachToElement(container, options);
		this._widgets.attachToElement(screenElement);
	}

	forceScrollbarVisibility(): void {
		this.domElement?.classList.add('force-scrollbar');
	}

	resetScrollbarVisibility(): void {
		this.domElement?.classList.remove('force-scrollbar');
	}

	getContribution<T extends ITerminalContribution>(id: string): T | null {
		return this._contributions.get(id) as T | null;
	}
}

/**
 * Implements {@link ITerminalProcessInfo} for a detached terminal where most
 * properties are stubbed. Properties are mutable and can be updated by
 * the instantiator.
 */
export class DetachedProcessInfo implements ITerminalProcessInfo {
	processState = ProcessState.Running;
	ptyProcessReady = Promise.resolve();
	shellProcessId: number | undefined;
	remoteAuthority: string | undefined;
	os: OperatingSystem | undefined;
	userHome: string | undefined;
	initialCwd = '';
	environmentVariableInfo: IEnvironmentVariableInfo | undefined;
	persistentProcessId: number | undefined;
	shouldPersist = false;
	hasWrittenData = false;
	hasChildProcesses = false;
	backend: ITerminalBackend | undefined;
	capabilities = new TerminalCapabilityStore();
	shellIntegrationNonce = '';
	extEnvironmentVariableCollection: IMergedEnvironmentVariableCollection | undefined;

	constructor(initialValues: Partial<ITerminalProcessInfo>) {
		Object.assign(this, initialValues);
	}
}
