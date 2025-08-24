/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { useErdosReactServicesContext } from '../../erdosReactRendererContext.js';

interface ExternalLinkProps extends React.ComponentPropsWithoutRef<'a'> {
}

export function ExternalLink(props: ExternalLinkProps) {
	// Context hooks.
	const services = useErdosReactServicesContext();

	const { href, ...otherProps } = props;

	return <a
		{...otherProps}
		href={href}
		onClick={(e) => {
			if (!href) {
				return;
			}
			e.preventDefault();
			services.openerService.open(href);
		}}
	>
		{props.children}
	</a>
		;
}
