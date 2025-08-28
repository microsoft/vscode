/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from 'react';

export function useStateRef<T>(initialValue: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>, React.MutableRefObject<T>] {
	const [value, setValue] = useState(initialValue);
	const ref = useRef(value);
	useEffect(() => {
		ref.current = value;
	}, [value]);

	return [value, setValue, ref];
}
