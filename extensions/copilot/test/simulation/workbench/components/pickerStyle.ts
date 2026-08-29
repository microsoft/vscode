/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeStyles, shorthands } from '@fluentui/react-components';

export const useInternalToolbarPickerStyles = makeStyles({
	root: {
		// Stack the label above the field with a gap
		display: 'grid',
		gridTemplateRows: 'repeat(1fr)',
		justifyItems: 'start',
		...shorthands.margin(0, ['2px', '2px']),
		...shorthands.gap('2px'),
		maxWidth: '400px',
	},
});
