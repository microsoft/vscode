/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosTopActionBar.css';

import React, { useEffect, useState } from 'react';

import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { CommandCenter } from '../../../../platform/commandCenter/common/commandCenter.js';
import { ErdosActionBar } from '../../../../platform/erdosActionBar/browser/erdosActionBar.js';
import { ActionBarRegion } from '../../../../platform/erdosActionBar/browser/components/actionBarRegion.js';
import { ActionBarSeparator } from '../../../../platform/erdosActionBar/browser/components/actionBarSeparator.js';
import { ActionBarCommandButton } from '../../../../platform/erdosActionBar/browser/components/actionBarCommandButton.js';
import { NavigateBackwardsAction, NavigateForwardAction } from '../editor/editorActions.js';
import { ErdosActionBarContextProvider } from '../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { TopActionBarNewMenu } from './components/topActionBarNewMenu.js';
import { TopActionBarOpenMenu } from './components/topActionBarOpenMenu.js';
import { TopActionBarCommandCenter } from './components/topActionBarCommandCenter.js';
import { ErdosTopActionBarContextProvider } from './erdosTopActionBarContext.js';
import { TopActionBarCustomFolderMenu } from './components/topActionBarCustomFolderMenu.js';
import { TopActionBarSessionManager } from './components/topActionBarSessionManager.js';
import { SAVE_ALL_COMMAND_ID, SAVE_FILE_COMMAND_ID } from '../../../contrib/files/browser/fileConstants.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

const kHorizontalPadding = 4;
const kCenterUIBreak = 600;
const kFulllCenterUIBreak = 765;
const SAVE = SAVE_FILE_COMMAND_ID;
const SAVE_ALL = SAVE_ALL_COMMAND_ID;
const NAV_BACK = NavigateBackwardsAction.ID;
const NAV_FORWARD = NavigateForwardAction.ID;

export interface IErdosTopActionBarContainer {
	readonly width: number;
	readonly onWidthChanged: Event<number>;
}

interface ErdosTopActionBarProps {
	erdosTopActionBarContainer: IErdosTopActionBarContainer;
}

export const ErdosTopActionBar = (props: ErdosTopActionBarProps) => {
	const [showCenterUI, setShowCenterUI] = useState(
		props.erdosTopActionBarContainer.width > kCenterUIBreak
	);
	const [showFullCenterUI, setShowFullCenterUI] = useState(
		props.erdosTopActionBarContainer.width > kFulllCenterUIBreak
	);

	useEffect(() => {
		const disposableStore = new DisposableStore();

		disposableStore.add(props.erdosTopActionBarContainer.onWidthChanged(width => {
			setShowCenterUI(width > kCenterUIBreak);
			setShowFullCenterUI(width > kFulllCenterUIBreak);
		}));

		return () => disposableStore.dispose();
	}, [props.erdosTopActionBarContainer]);

	return (
		<ErdosTopActionBarContextProvider {...props}>
			<ErdosActionBarContextProvider {...props}>
				<div className='top-action-bar-container'>
					<ErdosActionBar
						borderBottom={false}
						paddingLeft={kHorizontalPadding}
						paddingRight={kHorizontalPadding}
					>
						<ActionBarRegion location='left'>
							<TopActionBarNewMenu />
							<ActionBarSeparator />
							<TopActionBarOpenMenu />
							<ActionBarSeparator />
							<ActionBarCommandButton
								ariaLabel={CommandCenter.title(SAVE)}
								commandId={SAVE}
								icon={ThemeIcon.fromId('erdos-save')}
							/>
							<ActionBarCommandButton
								ariaLabel={CommandCenter.title(SAVE_ALL)}
								commandId={SAVE_ALL}
								icon={ThemeIcon.fromId('erdos-save-all')}
							/>
						</ActionBarRegion>
						{showCenterUI && (
							<ActionBarRegion location='center'>
								<ErdosActionBar nestedActionBar={true}>
									{showFullCenterUI && (
										<ActionBarRegion justify='right' location='left' width={60}>
											<ActionBarCommandButton
												ariaLabel={CommandCenter.title(NAV_BACK)}
												commandId={NAV_BACK}
												icon={ThemeIcon.fromId('chevron-left')}
											/>
											<ActionBarCommandButton
												ariaLabel={CommandCenter.title(NAV_FORWARD)}
												commandId={NAV_FORWARD}
												icon={ThemeIcon.fromId('chevron-right')}
											/>
										</ActionBarRegion>
									)}
									<ActionBarRegion location='center'>
										<TopActionBarCommandCenter />
									</ActionBarRegion>
									{showFullCenterUI && (
										<ActionBarRegion justify='left' location='right' width={60} />
									)}
								</ErdosActionBar>
							</ActionBarRegion>
						)}
						<ActionBarRegion gap={6} location='right'>
							<TopActionBarSessionManager />
							{showCenterUI && (
								<TopActionBarCustomFolderMenu />
							)}
						</ActionBarRegion>
					</ErdosActionBar>
				</div>
			</ErdosActionBarContextProvider>
		</ErdosTopActionBarContextProvider>
	);
};
