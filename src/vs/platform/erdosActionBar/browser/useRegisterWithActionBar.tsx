/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MutableRefObject, useEffect } from 'react';
import { useErdosActionBarContext } from './erdosActionBarContext.js';

export const useRegisterWithActionBar = (refs: MutableRefObject<HTMLElement>[]) => {
	const { focusableComponents } = useErdosActionBarContext();

	useEffect(() => {
		refs.forEach(ref => {
			if (focusableComponents.size === 0) {
				ref.current.tabIndex = 0;
			} else {
				ref.current.tabIndex = -1;
			}
			focusableComponents.add(ref.current);
		});
		return () => {
			refs.forEach(ref => focusableComponents.delete(ref.current));
		};
	}, [focusableComponents, refs]);
};
