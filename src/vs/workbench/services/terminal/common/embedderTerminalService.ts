/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IProcessDataEvent, IProcessProperty, IProcessPropertyMap, IProcessReadyEvent, IShellLaunchConfig, ITerminalChildProcess, ITerminalLaunchError, ProcessPropertyType } from '../../../../platform/terminal/common/terminal.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export const IEmbedderTerminalService = createDecorator<IEmbedderTerminalService>('embedderTerminalService');

/**
 * Manages terminals that the embedder can create before the terminal contrib is available.
 */
export interface IEmbedderTerminalService {
	readonly _serviceBrand: undefined;

	readonly onDidCreateTerminal: Event<IShellLaunchConfig>;

	createTerminal(options: IEmbedderTerminalOptions): void;
}

export type EmbedderTerminal = IShellLaunchConfig & Required<Pick<IShellLaunchConfig, 'customPtyImplementation'>>;

export interface IEmbedderTerminalOptions {
	name: string;
	pty: IEmbedderTerminalPty;

	// Extension APIs that have not been implemented for embedders:
	//   iconPath?: URI | { light: URI; dark: URI } | ThemeIcon;
	//   color?: ThemeColor;
	//   location?: TerminalLocation | TerminalEditorLocationOptions | TerminalSplitLocationOptions;
	//   isTransient?: boolean;
}

/**
 * See Pseudoterminal on the vscode API for usage.
 */
export interface IEmbedderTerminalPty {
	readonly onDidWrite: Event<string>;
	readonly onDidClose?: Event<void | number>;
	readonly onDidChangeName?: Event<string>;

	open(): void;
	close(): void;

	// Extension APIs that have not been implemented for embedders:
	//   onDidOverrideDimensions?: Event<TerminalDimensions | undefined>;
	//   handleInput?(data: string): void;
	//   setDimensions?(dimensions: TerminalDimensions): void;
}

class EmbedderTerminalService implements IEmbedderTerminalService {
	declare _serviceBrand: undefined;

	private readonly _onDidCreateTerminal = new Emitter<IShellLaunchConfig>();
	readonly onDidCreateTerminal = Event.buffer(this._onDidCreateTerminal.event);

	createTerminal(options: IEmbedderTerminalOptions): void {
		const slc: EmbedderTerminal = {
			name: options.name,
			isFeatureTerminal: true,
			customPtyImplementation(terminalId, cols, rows) {
				return new EmbedderTerminalProcess(terminalId, options.pty);
			},
		};
		this._onDidCreateTerminal.fire(slc);
	}
}


class EmbedderTerminalProcess extends Disposable implements ITerminalChildProcess {
	private readonly _pty: IEmbedderTerminalPty;

	readonly shouldPersist = false;

	readonly onProcessData: Event<IProcessDataEvent | string>;
	private readonly _onProcessReady = this._register(new Emitter<IProcessReadyEvent>());
	readonly onProcessReady = this._onProcessReady.event;
	private readonly _onDidChangeProperty = this._register(new Emitter<IProcessProperty>());
	readonly onDidChangeProperty = this._onDidChangeProperty.event;
	private readonly _onProcessExit = this._register(new Emitter<number | undefined>());
	readonly onProcessExit = this._onProcessExit.event;

	constructor(
		readonly id: number,
		pty: IEmbedderTerminalPty
	) {
		super();

		this._pty = pty;
		this.onProcessData = this._pty.onDidWrite;
		if (this._pty.onDidClose) {
			this._register(this._pty.onDidClose(e => this._onProcessExit.fire(e || undefined)));
		}
		if (this._pty.onDidChangeName) {
			this._register(this._pty.onDidChangeName(e => this._onDidChangeProperty.fire({
				type: ProcessPropertyType.Title,
				value: e
			})));
		}
	}

	async start(): Promise<ITerminalLaunchError | undefined> {
		this._onProcessReady.fire({ pid: -1, cwd: '', windowsPty: undefined });
		this._pty.open();
		return undefined;
	}
	shutdown(): void {
		this._pty.close();
	}

	// TODO: A lot of these aren't useful for some implementations of ITerminalChildProcess, should
	// they be optional? Should there be a base class for "external" consumers to implement?

	input(): void {
		// not supported
	}
	sendSignal(): void {
		// not supported
	}
	async processBinary(): Promise<void> {
		// not supported
	}
	resize(): void {
		// no-op
	}
	clearBuffer(): void {
		// no-op
	}
	acknowledgeDataEvent(): void {
		// no-op, flow control not currently implemented
	}
	async setUnicodeVersion(): Promise<void> {
		// no-op
	}
	async getInitialCwd(): Promise<string> {
		return '';
	}
	async getCwd(): Promise<string> {
		return '';
	}
	refreshProperty<T extends ProcessPropertyType>(property: ProcessPropertyType): Promise<IProcessPropertyMap[T]> {
		throw new Error(`refreshProperty is not suppported in EmbedderTerminalProcess. property: ${property}`);
	}

	updateProperty(property: ProcessPropertyType, value: unknown): Promise<void> {
		throw new Error(`updateProperty is not suppported in EmbedderTerminalProcess. property: ${property}, value: ${value}`);
	}
}

registerSingleton(IEmbedderTerminalService, EmbedderTerminalService, InstantiationType.Delayed);
