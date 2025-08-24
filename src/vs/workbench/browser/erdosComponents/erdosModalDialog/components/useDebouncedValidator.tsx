/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef } from 'react';

export type ValidatorFn<T> = (value: T) => (string | undefined) | Promise<string | undefined>;

export function useDebouncedValidator<T>({ validator, value, debounceDelayMs = 100 }: { validator?: ValidatorFn<T>; value: T; debounceDelayMs?: number }) {
	const [errorMsg, setErrorMsg] = React.useState<string | undefined>(undefined);

	const callbackTimeoutRef = useRef<Timeout | undefined>(undefined);

	const clearCallbackTimeout = React.useCallback(() => {
		if (!callbackTimeoutRef.current) { return; }
		clearTimeout(callbackTimeoutRef.current);
	}, []);

	React.useEffect(() => {
		if (!validator) { return; }

		clearCallbackTimeout();
		let isDisposed = false;

		callbackTimeoutRef.current = setTimeout(() => {
			const res = validator(value);
			if (res instanceof Promise) {
				res.then((msg) => {
					if (isDisposed) { return; }
					setErrorMsg(msg);
				});
			} else {
				setErrorMsg(res);
			}
		}, debounceDelayMs);

		return () => {
			isDisposed = true;
			clearCallbackTimeout();
		};
	}, [clearCallbackTimeout, validator, value, debounceDelayMs]);

	return errorMsg;
}
