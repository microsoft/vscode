/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
// eslint-disable-next-line local/code-import-patterns
import { ITerminalExecuteStrategy } from '../../terminalContrib/chatAgentTools/browser/executeStrategy/executeStrategy.js';
import { ITerminalChatEmbeddedTerminal, ITerminalChatService, ITerminalInstance } from './terminal.js';
import { XtermTerminal } from './xterm/xtermTerminal.js';
import { TerminalInstance, TerminalInstanceColorProvider } from './terminalInstance.js';
import { TerminalCapabilityStore } from '../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';

export class TerminalChatService extends Disposable implements ITerminalChatService {
	_serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
	}
	serialize(): string {
		throw new Error('Method not implemented.');
	}
	deserialize(serialized: string): void {
		throw new Error('Method not implemented.');
	}
	async createEmbeddedTerminal(_chatSessionId: string, _chatRequestId: string, instance: ITerminalInstance, _executeStrategy: ITerminalExecuteStrategy): Promise<ITerminalChatEmbeddedTerminal> {
		const capabilities = new TerminalCapabilityStore();
		const store = new DisposableStore();
		store.add(capabilities);
		const xtermCtor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
		const xterm = this._instantiationService.createInstance(XtermTerminal, xtermCtor, {
			rows: 10,
			cols: instance.cols,
			capabilities,
			xtermColorProvider: this._instantiationService.createInstance(TerminalInstanceColorProvider, TerminalLocation.Panel)
		}, undefined);
		store.add(xterm);
		return { xterm, store };
	}
}
