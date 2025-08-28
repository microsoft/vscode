/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosModalDialog.css';

import React, { PropsWithChildren } from 'react';

import { ContentArea } from './components/contentArea.js';
import { OKCancelActionBar } from './components/okCancelActionBar.js';
import { ErdosModalDialog, ErdosModalDialogProps } from './erdosModalDialog.js';
import { VerticalSpacer } from './components/verticalSpacer.js';

export interface OKCancelModalDialogProps extends ErdosModalDialogProps {
	title: string;
	okButtonTitle?: string;
	cancelButtonTitle?: string;
	onAccept: () => (void | Promise<void>);
	onCancel: () => (void | Promise<void>);
	catchErrors?: boolean;
}

export const OKCancelModalDialog = (props: PropsWithChildren<OKCancelModalDialogProps>) => {
	const [errorMsg, setErrorMsg] = React.useState<string | undefined>(undefined);

	const { catchErrors, onAccept, children, ...otherProps } = props;

	const fullProps = {
		...otherProps,
		onAccept: catchErrors ? async () => {
			try { await onAccept(); }
			catch (err) { setErrorMsg(err.message); }
		} : onAccept,
	};

	return (
		<ErdosModalDialog {...fullProps}>
			<ContentArea>
				{children}
				{errorMsg ?
					<VerticalSpacer>
						<p className='error-msg'>{errorMsg}</p>
					</VerticalSpacer> :
					null
				}
			</ContentArea>
			<OKCancelActionBar {...fullProps} />
		</ErdosModalDialog>
	);
};
