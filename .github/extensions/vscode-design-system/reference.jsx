/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import React, { useEffect, useRef } from 'react';
import { mountReference } from './reference.js';

export function Reference(props) {
	const target = useRef(null);
	useEffect(() => mountReference(target.current, props), [props.section, props.controlId, props.fixtureId]);
	return <div className="design-reference" ref={target} />;
}
