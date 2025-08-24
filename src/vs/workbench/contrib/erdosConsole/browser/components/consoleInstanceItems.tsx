/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './consoleInstanceItems.css';

import { flushSync } from 'react-dom';
import React, { Component } from 'react';

import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { ConsoleInput } from './consoleInput.js';
import { RuntimeTrace, RuntimeStartup, RuntimeStarted, RuntimeOffline, RuntimeExited, RuntimeActivity, RuntimePendingInput, RuntimeRestartButton, RuntimeStartupFailure, RuntimeStarting } from './runtimeComponents.js';
import { RuntimeItemTrace, RuntimeItemExited, RuntimeItemStartup, RuntimeItemStarted, RuntimeItemOffline, RuntimeItemStarting, RuntimeItemActivity, RuntimeItemReconnected, RuntimeItemPendingInput, RuntimeItemRestartButton, RuntimeItemStartupFailure } from '../../../../services/erdosConsole/browser/classes/runtimeItems.js';
import { IErdosConsoleInstance } from '../../../../services/erdosConsole/browser/interfaces/erdosConsoleService.js';
import { localize } from '../../../../../nls.js';

interface ConsoleInstanceItemsProps {
	readonly erdosConsoleInstance: IErdosConsoleInstance;
	readonly fontInfo: FontInfo;
	readonly trace: boolean;
	readonly runtimeAttached: boolean;
	readonly consoleInputWidth: number;
	readonly disconnected: boolean;
	readonly onSelectAll: () => void;
}

export class ConsoleInstanceItems extends Component<ConsoleInstanceItemsProps> {
	constructor(props: ConsoleInstanceItemsProps) {
		super(props);
	}

	override render() {
		return (
			<>
				<div className='top-spacer' />
				{this.props.erdosConsoleInstance.runtimeItems.filter(runtimeItem => !runtimeItem.isHidden).map(runtimeItem => {
					if (runtimeItem instanceof RuntimeItemActivity) {
						return <RuntimeActivity key={runtimeItem.id} fontInfo={this.props.fontInfo} erdosConsoleInstance={this.props.erdosConsoleInstance} runtimeItemActivity={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemPendingInput) {
						return <RuntimePendingInput key={runtimeItem.id} fontInfo={this.props.fontInfo} runtimeItemPendingInput={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemStartup) {
						return <RuntimeStartup key={runtimeItem.id} runtimeItemStartup={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemReconnected) {
						return null;
					} else if (runtimeItem instanceof RuntimeItemStarting) {
						return <RuntimeStarting key={runtimeItem.id} runtimeItemStarting={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemStarted) {
						return <RuntimeStarted key={runtimeItem.id} runtimeItemStarted={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemOffline) {
						return <RuntimeOffline key={runtimeItem.id} runtimeItemOffline={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemExited) {
						return <RuntimeExited key={runtimeItem.id} runtimeItemExited={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemRestartButton) {
						return <RuntimeRestartButton key={runtimeItem.id} erdosConsoleInstance={this.props.erdosConsoleInstance} runtimeItemRestartButton={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemStartupFailure) {
						return <RuntimeStartupFailure key={runtimeItem.id} runtimeItemStartupFailure={runtimeItem} />;
					} else if (runtimeItem instanceof RuntimeItemTrace) {
						return this.props.trace && <RuntimeTrace key={runtimeItem.id} runtimeItemTrace={runtimeItem} />;
					} else {
						return null;
					}
				})}
				{this.props.disconnected &&
					<div className='console-item-starting'>
						<span className='codicon codicon-loading codicon-modifier-spin'></span>
						<span>{localize(
							"erdos.console.extensionsRestarting",
							"Extensions restarting..."
						)}</span>
					</div>
				}
				<ConsoleInput
					hidden={this.props.erdosConsoleInstance.promptActive || !this.props.runtimeAttached}
					erdosConsoleInstance={this.props.erdosConsoleInstance}
					width={this.props.consoleInputWidth}
					onCodeExecuted={() =>
						flushSync(() => this.forceUpdate()
						)}
					onSelectAll={this.props.onSelectAll}
				/>
			</>
		);
	}
}
