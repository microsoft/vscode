/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IBrowserViewCertificateError } from '../../../../platform/browserView/common/browserView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import type { BrowserEditor } from './browserEditor.js';

/**
 * Widget that displays site security information (e.g. certificate errors)
 * as an indicator button inside the URL bar, with a hover popover for details.
 */
export class SiteInfoWidget extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _indicator: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly editor: BrowserEditor,
		@IHoverService private readonly hoverService: IHoverService
	) {
		super();

		this._container = $('.browser-site-info-container');
		this._container.style.display = 'none';

		this._indicator = $('.browser-site-info-indicator');
		this._indicator.tabIndex = 0;
		this._indicator.role = 'button';
		this._indicator.ariaLabel = localize('browser.notSecure', "Not Secure");
		this._indicator.appendChild(renderIcon(Codicon.workspaceUntrusted));
		this._container.appendChild(this._indicator);

		parent.appendChild(this._container);

		this._register(addDisposableListener(this._indicator, EventType.CLICK, () => this._showHover()));
		this._register(addDisposableListener(this._indicator, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this._showHover();
			}
		}));
	}

	/**
	 * Update visibility and state from a certificate error (or lack thereof).
	 */
	setCertificateError(certError: IBrowserViewCertificateError | undefined): void {
		this._container.style.display = certError ? '' : 'none';
	}

	private _showHover(): void {
		const certError = this.editor.getCertificateError();
		if (!certError) {
			return;
		}

		const content = document.createElement('div');
		content.classList.add('browser-site-info-hover-content');

		const heading = document.createElement('div');
		heading.classList.add('browser-site-info-hover-heading');
		heading.textContent = localize('browser.certHoverHeading', "Certificate Not Trusted");
		content.appendChild(heading);

		const detail1 = document.createElement('div');
		detail1.classList.add('browser-site-info-hover-detail');
		detail1.textContent = localize(
			'browser.certHoverDetail1',
			"Your connection to this site is not secure."
		);
		content.appendChild(detail1);

		if (certError.hasTrustedException) {
			const detail2 = document.createElement('div');
			detail2.classList.add('browser-site-info-hover-detail');
			detail2.textContent = localize(
				'browser.certHoverDetail2',
				"You previously chose to proceed to '{0}' despite a certificate error ({1}).",
				certError.host,
				certError.error
			);
			content.appendChild(detail2);

			const revokeLink = document.createElement('a');
			revokeLink.classList.add('browser-site-info-hover-revoke');
			revokeLink.textContent = localize('browser.certRevoke', "Revoke and Close");
			revokeLink.role = 'button';
			revokeLink.tabIndex = 0;
			revokeLink.addEventListener('click', () => {
				hover?.dispose();
				this.editor.revokeAndClose(certError);
			});
			revokeLink.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					hover?.dispose();
					this.editor.revokeAndClose(certError);
				}
			});
			content.appendChild(revokeLink);
		}

		const hover = this.hoverService.showInstantHover({
			content,
			target: this._indicator,
			container: this._container,
			position: { hoverPosition: HoverPosition.BELOW },
			persistence: { sticky: true }
		}, true);
	}
}
