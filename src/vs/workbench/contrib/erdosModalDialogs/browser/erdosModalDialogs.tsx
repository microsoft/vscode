/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './erdosModalDialogs.css';

import React from 'react';

import { Emitter } from '../../../../base/common/event.js';
import { renderHtml } from '../../../../base/browser/erdos/renderHtml.js';
import { ContentArea } from '../../../browser/erdosComponents/erdosModalDialog/components/contentArea.js';
import { OKActionBar } from '../../../browser/erdosComponents/erdosModalDialog/components/okActionBar.js';
import { VerticalStack } from '../../../browser/erdosComponents/erdosModalDialog/components/verticalStack.js';
import { ErdosModalDialog } from '../../../browser/erdosComponents/erdosModalDialog/erdosModalDialog.js';
import { OKCancelActionBar } from '../../../browser/erdosComponents/erdosModalDialog/components/okCancelActionBar.js';
import { OKCancelModalDialog } from '../../../browser/erdosComponents/erdosModalDialog/erdosOKCancelModalDialog.js';
import { IModalDialogPromptInstance, IErdosModalDialogsService, ShowConfirmationModalDialogOptions } from '../../../services/erdosModalDialogs/common/erdosModalDialogs.js';
import { ExternalLink } from '../../../../base/browser/ui/ExternalLink/ExternalLink.js';
import { ErdosModalReactRenderer } from '../../../../base/browser/erdosModalReactRenderer.js';

export class ErdosModalDialogs implements IErdosModalDialogsService {
	declare readonly _serviceBrand: undefined;

	constructor() {
	}

	showConfirmationModalDialog(options: ShowConfirmationModalDialogOptions) {
		const renderer = new ErdosModalReactRenderer();

		renderer.render(
			<OKCancelModalDialog
				cancelButtonTitle={options.cancelButtonTitle}
				height={195}
				okButtonTitle={options.okButtonTitle}
				renderer={renderer}
				title={options.title}
				width={400}
				onAccept={async () => {
					renderer.dispose();
					await options.action();
				}}
				onCancel={() => renderer.dispose()}>
				<VerticalStack>
					<div>{options.message}</div>
				</VerticalStack>
			</OKCancelModalDialog>
		);
	}

	showModalDialogPrompt(
		title: string,
		message: string,
		okButtonTitle?: string,
		cancelButtonTitle?: string
	): IModalDialogPromptInstance {
		const renderer = new ErdosModalReactRenderer();

		const choiceEmitter = new Emitter<boolean>();

		const acceptHandler = () => {
			renderer.dispose();
			choiceEmitter.fire(true);
			choiceEmitter.dispose();
		};
		const cancelHandler = () => {
			renderer.dispose();
			choiceEmitter.fire(false);
			choiceEmitter.dispose();
		};

		renderer.render(
			<ErdosModalDialog height={200} renderer={renderer} title={title} width={400} onCancel={cancelHandler}>
				<ContentArea>
					{renderHtml(
						message,
						{
							componentOverrides: {
								a: (props) => <ExternalLink {...props} />
							}
						}
					)}
				</ContentArea>
				<OKCancelActionBar
					cancelButtonTitle={cancelButtonTitle}
					okButtonTitle={okButtonTitle}
					onAccept={acceptHandler}
					onCancel={cancelHandler} />
			</ErdosModalDialog>
		);

		return {
			onChoice: choiceEmitter.event,
			close() {
				choiceEmitter.fire(false);
				choiceEmitter.dispose();
				renderer.dispose();
			}
		};
	}

	showModalDialogPrompt2(
		title: string,
		message: string,
		okButtonTitle?: string
	): IModalDialogPromptInstance {

		const renderer = new ErdosModalReactRenderer();

		const choiceEmitter = new Emitter<boolean>();

		const acceptHandler = () => {
			renderer.dispose();
			choiceEmitter.fire(true);
			choiceEmitter.dispose();
		};

		const cancelHandler = () => {
			renderer.dispose();
			choiceEmitter.dispose();
		};

		renderer.render(
			<ErdosModalDialog
				height={200}
				renderer={renderer}
				title={title}
				width={400}
				onCancel={cancelHandler}
			>
				<ContentArea>
					{renderHtml(
						message,
						{
							componentOverrides: {
								a: (props) => <ExternalLink {...props} />
							}
						}
					)}
				</ContentArea>
				<OKActionBar okButtonTitle={okButtonTitle} onAccept={acceptHandler} />
			</ErdosModalDialog>
		);

		return {
			onChoice: choiceEmitter.event,
			close() {
				choiceEmitter.fire(true);
				choiceEmitter.dispose();
				renderer.dispose();
			}
		};
	}

	showSimpleModalDialogPrompt(title: string,
		message: string,
		okButtonTitle?: string | undefined,
		cancelButtonTitle?: string | undefined): Promise<boolean> {

		const dialog = this.showModalDialogPrompt(title, message, okButtonTitle, cancelButtonTitle);
		return new Promise<boolean>((resolve) => {
			const disposable = dialog.onChoice((choice) => {
				disposable.dispose();
				resolve(choice);
			});
		});
	}

	showSimpleModalDialogMessage(title: string,
		message: string,
		okButtonTitle?: string | undefined): Promise<null> {

		const dialog = this.showModalDialogPrompt2(title, message, okButtonTitle);
		return new Promise<null>((resolve) => {
			const disposable = dialog.onChoice(() => {
				disposable.dispose();
				resolve(null);
			});
		});
	}
}
