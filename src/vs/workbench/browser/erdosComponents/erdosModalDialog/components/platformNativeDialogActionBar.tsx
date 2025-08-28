/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

import * as platform from '../../../../../base/common/platform.js';

interface PlatformNativeDialogActionBarProps {
	secondaryButton?: React.ReactNode,
	primaryButton?: React.ReactNode
}

export const PlatformNativeDialogActionBar = ({ secondaryButton, primaryButton }: PlatformNativeDialogActionBarProps) => {
	return (
		<>
			{
				platform.isWindows
					? <>{primaryButton}{secondaryButton}</>
					: <>{secondaryButton}{primaryButton}</>
			}
		</>
	)
}
