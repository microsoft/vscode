/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventHelper } from '../../dom.js';
import { Codicon } from '../../../common/codicons.js';
import { onUnexpectedError } from '../../../common/errors.js';
import { localize } from '../../../../nls.js';
import { Button, IButtonOptions } from './button.js';
import { CopyFeedback } from './copyFeedback.js';

export interface ICopyButtonOptions extends IButtonOptions {
	/** Resolves after copying succeeds; rejects on failure. */
	readonly copy: () => Promise<void>;
	readonly copiedStatusMessage?: string;
}

/**
 * An icon-only Button that briefly shows a checkmark after copying succeeds.
 * Supply the clipboard operation; styling, hover delegates and keyboard behavior follow Button.
 */
export class CopyButton extends Button {

	private readonly feedback: CopyFeedback;

	constructor(container: HTMLElement, private readonly copyOptions: ICopyButtonOptions) {
		const title = typeof copyOptions.title === 'string' ? copyOptions.title : localize('copyButton.copy', "Copy");
		super(container, { ...copyOptions, title, ariaLabel: copyOptions.ariaLabel ?? title });

		this.icon = Codicon.copy;
		this.feedback = this._register(new CopyFeedback(copied => {
			this.icon = copied ? Codicon.check : Codicon.copy;
			this.setTitle(copied ? localize('copyButton.copied', "Copied") : title);
			this.setAriaLabel(copied ? localize('copyButton.copied', "Copied") : copyOptions.ariaLabel ?? title);
		}, copyOptions.copiedStatusMessage));

		this._register(this.onDidClick(event => {
			EventHelper.stop(event, true);
			this.copy().catch(onUnexpectedError);
		}));
	}

	/** Copies and shows feedback on success, propagating errors to the caller. */
	async copy(): Promise<void> {
		await this.copyOptions.copy();
		this.feedback.show();
	}
}
