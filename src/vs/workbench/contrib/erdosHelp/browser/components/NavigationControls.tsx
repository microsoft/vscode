/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ActionBarButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarButton.js';

export interface NavigationControlsProps {
	canBack: boolean;
	canForward: boolean;
	onBack: () => void;
	onForward: () => void;
}

export const NavigationControls: React.FC<NavigationControlsProps> = (props) => {
	return (
		<>
			<ActionBarButton
				ariaLabel="Previous"
				disabled={!props.canBack}
				icon={ThemeIcon.fromId('arrow-left')}
				tooltip="Previous topic"
				onPressed={props.onBack}
			/>
			<ActionBarButton
				ariaLabel="Next"
				disabled={!props.canForward}
				icon={ThemeIcon.fromId('arrow-right')}
				tooltip="Next topic"
				onPressed={props.onForward}
			/>
		</>
	);
};


