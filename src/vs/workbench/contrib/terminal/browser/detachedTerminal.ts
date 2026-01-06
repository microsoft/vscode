/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Delayer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { MicrotaskDelay } from '../../../../base/common/symbols.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IMergedEnvironmentVariableCollection } from '../../../../platform/terminal/common/environmentVariable.js';
import { ITerminalBackend } from '../../../../platform/terminal/common/terminal.js';
import { IDetachedTerminalInstance, IDetachedXTermOptions, IDetachedXtermTerminal, ITerminalContribution, IXtermAttachToElementOptions } from './terminal.js';
import { TerminalExtensionsRegistry } from './terminalExtensions.js';
import { TerminalWidgetManager } from './widgets/widgetManager.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { IEnvironmentVariableInfo } from '../common/environmentVariable.js';
import { ITerminalProcessInfo, ProcessState } from '../common/terminal.js';

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
				contribution = instantiationService.createInstance(desc.ctor, {
					instance: this,
					processManager: options.processInfo,
					widgetManager: this._widgets
				});
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
