/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IProcessEnvironment } from '../../../base/common/platform.js';
import { IProcessDetails } from '../common/terminalProcess.js';
import { IShellLaunchConfig, ITerminalProcessOptions, ITerminalDaemonService } from '../common/terminal.js';
import { TerminalProcess } from './terminalProcess.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { Terminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';

import { TerminalIcon, TitleEventSource, ProcessPropertyType, IProcessPropertyMap } from '../common/terminal.js';

class DaemonPersistentProcess extends Disposable {
	private readonly _xterm: Terminal;
	private readonly _serializeAddon: SerializeAddon;

	private _title: string = '';
	private _icon: TerminalIcon | undefined;
	private _color: string | undefined;
	private _fixedDimensions: { cols: number | undefined; rows: number | undefined } = { cols: undefined, rows: undefined };

	constructor(
		private readonly _id: number,
		private readonly _process: TerminalProcess,
		cols: number,
		rows: number,
		private readonly _logService: ILogService
	) {
		super();
		this._xterm = new Terminal({ cols, rows });
		this._serializeAddon = new SerializeAddon();
		this._xterm.loadAddon(this._serializeAddon);

		this._register(this._process.onProcessData(data => {
			this._xterm.write(data);
		}));

		this._register(this._process.onDidChangeProperty(e => {
			if (e.type === ProcessPropertyType.Title) {
				this._title = e.value as string;
			}
		}));
	}

	get process(): TerminalProcess { return this._process; }
	get title(): string { return this._title || this._process.currentTitle; }
	get icon(): TerminalIcon | undefined { return this._icon; }
	get color(): string | undefined { return this._color; }
	get fixedDimensions(): { cols: number | undefined; rows: number | undefined } { return this._fixedDimensions; }

	serialize(): string {
		return this._serializeAddon.serialize();
	}

	resize(cols: number, rows: number): void {
		this._xterm.resize(cols, rows);
		this._process.resize(cols, rows);
	}

	clearBuffer(): void {
		this._xterm.clear();
		this._process.clearBuffer();
	}

	updateProperty<T extends ProcessPropertyType>(property: T, value: IProcessPropertyMap[T]): void {
		if (property === ProcessPropertyType.FixedDimensions) {
			this._fixedDimensions = value as IProcessPropertyMap[ProcessPropertyType.FixedDimensions];
		} else if (property === ProcessPropertyType.Title) {
			this._title = value as string;
		}
	}

	setIcon(icon: TerminalIcon, color: string | undefined): void {
		this._icon = icon;
		this._color = color;
	}
}

export class TerminalDaemon extends Disposable implements ITerminalDaemonService {
	declare readonly _serviceBrand: undefined;

	private readonly _ptys = new Map<number, DaemonPersistentProcess>();
	private _lastPtyId = 0;

	private readonly _onDidProcessData = this._register(new Emitter<{ id: number; data: string }>());
	readonly onDidProcessData = this._onDidProcessData.event;

	private readonly _onDidProcessExit = this._register(new Emitter<{ id: number; exitCode: number | undefined }>());
	readonly onDidProcessExit = this._onDidProcessExit.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService
	) {
		super();
	}

	async createProcess(
		shellLaunchConfig: IShellLaunchConfig,
		cwd: string,
		cols: number,
		rows: number,
		unicodeVersion: '6' | '11',
		env: IProcessEnvironment,
		options: ITerminalProcessOptions
	): Promise<number> {
		const id = ++this._lastPtyId;
		const process = new TerminalProcess(
			shellLaunchConfig,
			cwd,
			cols,
			rows,
			env,
			env, // executableEnv
			options,
			this._logService,
			this._productService
		);

		const persistentProcess = new DaemonPersistentProcess(id, process, cols, rows, this._logService);
		this._ptys.set(id, persistentProcess);

		this._register(process.onProcessData(data => this._onDidProcessData.fire({ id, data })));
		this._register(process.onProcessExit(exitCode => {
			this._onDidProcessExit.fire({ id, exitCode });
			this._ptys.delete(id);
			persistentProcess.dispose();
		}));

		await process.start();
		this._logService.info(`Created persistent process ${id} (PID: ${process.pid})`);
		return id;
	}

	async attachToProcess(id: number): Promise<void> {
		const p = this._ptys.get(id);
		if (!p) {
			throw new Error(`Process ${id} not found in daemon`);
		}
		// Replay the buffer to the client
		const data = p.serialize();
		this._onDidProcessData.fire({ id, data });
		this._logService.info(`Re-attached to process ${id}, replayed ${data.length} bytes`);
	}

	async detachFromProcess(id: number): Promise<void> {
		this._logService.info(`Detached from process ${id}`);
	}

	async input(id: number, data: string): Promise<void> {
		const p = this._ptys.get(id);
		if (p) {
			p.process.input(data);
		}
	}

	async resize(id: number, cols: number, rows: number): Promise<void> {
		const p = this._ptys.get(id);
		if (p) {
			p.resize(cols, rows);
		}
	}

	async shutdown(id: number, immediate: boolean): Promise<void> {
		const p = this._ptys.get(id);
		if (p) {
			p.process.shutdown(immediate);
			p.dispose();
			this._ptys.delete(id);
		}
	}

	async listProcesses(): Promise<IProcessDetails[]> {
		return Array.from(this._ptys.entries()).map(([id, p]) => ({
			id,
			pid: p.process.pid,
			title: p.title,
			titleSource: TitleEventSource.Process,
			cwd: '', // Need to fetch real CWD if possible
			workspaceId: '',
			workspaceName: '',
			isOrphan: true,
			icon: p.icon,
			color: p.color,
			fixedDimensions: p.fixedDimensions,
			hasChildProcesses: p.process.hasChildProcesses
		} as IProcessDetails));
	}

	async clearBuffer(id: number): Promise<void> {
		this._ptys.get(id)?.clearBuffer();
	}

	async getProperty<T extends ProcessPropertyType>(id: number, property: T): Promise<IProcessPropertyMap[T]> {
		const p = this._ptys.get(id);
		if (!p) {
			return undefined as any;
		}
		switch (property) {
			case ProcessPropertyType.Cwd: return p.process.getCwd() as any;
			case ProcessPropertyType.InitialCwd: return p.process.getInitialCwd() as any;
			case ProcessPropertyType.FixedDimensions: return p.fixedDimensions as any;
			case ProcessPropertyType.Title: return p.title as any;
			case ProcessPropertyType.ShellType: return p.process.shellType as any;
			case ProcessPropertyType.HasChildProcesses: return p.process.hasChildProcesses as any;
		}
		return undefined as any;
	}

	async updateProperty<T extends ProcessPropertyType>(id: number, property: T, value: IProcessPropertyMap[T]): Promise<void> {
		this._ptys.get(id)?.updateProperty(property, value);
	}

	async getSerializeBuffer(id: number): Promise<string> {
		return this._ptys.get(id)?.serialize() ?? '';
	}
}
