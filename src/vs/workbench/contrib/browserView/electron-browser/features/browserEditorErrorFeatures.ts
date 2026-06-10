/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { ButtonBar } from '../../../../../base/browser/ui/button/button.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isLinux, isMacintosh } from '../../../../../base/common/platform.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IBrowserViewCertificateError, IBrowserViewLoadError } from '../../../../../platform/browserView/common/browserView.js';
import { IBrowserViewModel } from '../../common/browserView.js';
import {
	BrowserEditor,
	BrowserEditorContribution,
	BrowserWidgetLocation,
	IBrowserEditorWidget,
	IBrowserUrlRenderer,
} from '../browserEditor.js';

/**
 * Renders the full-pane error overlay (load failures and certificate errors)
 * inside the browser container, plus drives the navbar's cert indicator and
 * the cert-aware URL display rendering.
 *
 * Subscribes to model loading-state and navigation events and rebuilds the
 * DOM on each transition. When the underlying load error carries certificate
 * info, an additional details table and trust/back action buttons are
 * rendered inline. The site-info widget ("Not Secure" indicator) is
 * contributed as a pre-URL widget and the cert URL renderer marks the
 * `https:` prefix when a cert error is active.
 */
class BrowserEditorErrorFeatures extends BrowserEditorContribution {

	private readonly _element = $('.browser-error-container');
	private readonly _certActionButton = this._register(new MutableDisposable<ButtonBar>());
	private readonly _content: IBrowserEditorWidget;

	private readonly _siteInfoSlot = $('.browser-site-info-slot-wrapper');
	private readonly _siteInfoWidget: SiteInfoWidget;
	private readonly _preUrlWidget: IBrowserEditorWidget;
	private readonly _urlRenderer = this._register(new CertUrlRenderer());

	constructor(
		editor: BrowserEditor,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(editor);
		this._element.style.display = 'none';
		// Sit above the placeholder screenshot and overlay-pause (orders 100/200).
		this._content = { location: BrowserWidgetLocation.ContentArea, element: this._element, order: 300 };

		this._siteInfoWidget = this._register(instantiationService.createInstance(SiteInfoWidget, this._siteInfoSlot, editor));
		this._preUrlWidget = { location: BrowserWidgetLocation.PreUrl, element: this._siteInfoSlot, order: 10 };
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [this._content, this._preUrlWidget];
	}

	override get urlRenderers(): readonly IBrowserUrlRenderer[] {
		return [this._urlRenderer];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		store.add(model.onDidChangeLoadingState(() => this._updateError()));
		store.add(model.onDidNavigate(() => this._updateCertState()));
		this._updateError();
	}

	override onModelDetached(): void {
		this._clearContent();
		this._element.style.display = 'none';
		this._siteInfoWidget.setCertificateError(undefined);
		this._urlRenderer.setCertificateError(undefined);
	}

	private _updateError(): void {
		const model = this.editor.model;
		if (!model) {
			return;
		}
		const error = model.error;
		this._updateCertState();

		if (!error) {
			this._element.style.display = 'none';
			return;
		}

		this._clearContent();
		this._element.appendChild(this._renderError(error));
		this._element.style.display = '';
	}

	private _updateCertState(): void {
		const model = this.editor.model;
		// Cover both paths: the cert from the most recent successful navigation
		// (model.certificateError, set when the user trusted a cert this session)
		// and the cert that caused the current load error.
		const cert = model?.certificateError ?? model?.error?.certificateError;
		this._siteInfoWidget.setCertificateError(cert);
		this._urlRenderer.setCertificateError(cert);
	}

	private _clearContent(): void {
		this._certActionButton.clear();
		while (this._element.firstChild) {
			this._element.removeChild(this._element.firstChild);
		}
	}

	private _renderError(error: IBrowserViewLoadError): HTMLElement {
		const isCertError = !!error.certificateError;
		const errorContent = $('.browser-error-content');

		const errorIcon = $('.browser-error-icon');
		errorIcon.classList.toggle('cert-error', isCertError);
		errorIcon.appendChild(renderIcon(isCertError ? Codicon.workspaceUntrusted : Codicon.globe));

		const errorTitle = $('.browser-error-title');
		errorTitle.textContent = isCertError
			? localize('browser.certErrorLabel', "Certificate Error")
			: localize('browser.loadErrorLabel', "Failed to Load Page");

		const errorMessage = $('.browser-error-detail');
		const errorText = $('span');
		errorText.textContent = isCertError
			? localize('browser.certErrorDescription', "This site's security certificate could not be verified.")
			: `${error.errorDescription} (${error.errorCode})`;
		errorMessage.appendChild(errorText);

		// Show cert error name below description, above URL
		if (error.certificateError) {
			const extraWarning = $('b.browser-error-detail');
			extraWarning.textContent = localize('browser.certErrorExtraWarning', " Your connection is not private.");
			errorMessage.appendChild(extraWarning);
		}

		const errorUrl = $('.browser-error-detail');
		const urlLabel = $('strong');
		urlLabel.textContent = localize('browser.errorUrlLabel', "URL:");
		const urlValue = $('code');
		urlValue.textContent = error.url;
		errorUrl.appendChild(urlLabel);
		errorUrl.appendChild(document.createTextNode(' '));
		errorUrl.appendChild(urlValue);

		errorContent.appendChild(errorIcon);
		errorContent.appendChild(errorTitle);
		errorContent.appendChild(errorMessage);
		errorContent.appendChild(errorUrl);

		if (error.certificateError) {
			errorContent.appendChild(this._renderCertDetails(error.certificateError));
			errorContent.appendChild(this._renderCertActions(error.certificateError));
		}

		return errorContent;
	}

	private _renderCertDetails(certError: IBrowserViewCertificateError): HTMLElement {
		const certDetailsTable = $('.browser-cert-details-table');

		const heading = $('.browser-cert-details-heading');
		heading.textContent = localize('browser.certDetailsHeading', "Certificate Details");
		certDetailsTable.appendChild(heading);

		const addRow = (label: string, value: string) => {
			const row = $('.browser-cert-details-row');
			const labelEl = $('.browser-cert-details-label');
			labelEl.textContent = label;
			const valueEl = $('.browser-cert-details-value');
			valueEl.textContent = value;
			row.appendChild(labelEl);
			row.appendChild(valueEl);
			certDetailsTable.appendChild(row);
		};

		addRow(localize('browser.certError', "Error"), certError.error);
		addRow(localize('browser.certIssuer', "Issuer"), certError.issuerName);
		addRow(localize('browser.certSubject', "Subject"), certError.subjectName);

		const formatDate = (epoch: number) => new Date(epoch * 1000).toLocaleDateString();
		addRow(
			localize('browser.certValid', "Valid"),
			`${formatDate(certError.validStart)} - ${formatDate(certError.validExpiry)}`
		);

		addRow(localize('browser.certFingerprint', "Fingerprint"), certError.fingerprint);

		return certDetailsTable;
	}

	private _renderCertActions(certError: IBrowserViewCertificateError): HTMLElement {
		const actionContainer = $('.browser-cert-action');
		actionContainer.classList.toggle('reverse', isMacintosh || isLinux);

		const canGoBack = this.editor.model?.canGoBack ?? false;
		const buttonBar = new ButtonBar(actionContainer);
		this._certActionButton.value = buttonBar;

		const primaryButton = buttonBar.addButton({ ...defaultButtonStyles });
		primaryButton.label = canGoBack
			? localize('browser.certGoBack', "Go Back")
			: localize('browser.certCloseTab', "Close Tab");
		primaryButton.onDidClick(() => {
			if (canGoBack) {
				this.editor.model?.goBack();
			} else {
				this.editor.closeTab();
			}
		});

		const secondaryButton = buttonBar.addButton({ ...defaultButtonStyles, secondary: true });
		secondaryButton.label = localize('browser.certProceed', "Proceed anyway (unsafe)");
		secondaryButton.onDidClick(() => {
			this.editor.model?.trustCertificate(certError.host, certError.fingerprint);
		});

		return actionContainer;
	}
}

/**
 * URL renderer that, when a certificate error is active, splits an `https:`
 * prefix into its own span (styled with a red strikethrough via CSS). Other
 * URLs (and non-cert-error states) fall through to plain text.
 */
class CertUrlRenderer implements IBrowserUrlRenderer {
	private static readonly HTTPS_PREFIX = 'https:';

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _hasCertError = false;

	setCertificateError(certError: IBrowserViewCertificateError | undefined): void {
		const next = !!certError;
		if (this._hasCertError === next) {
			return;
		}
		this._hasCertError = next;
		this._onDidChange.fire();
	}

	render(url: string, container: HTMLElement): boolean {
		if (!this._hasCertError || !url.startsWith(CertUrlRenderer.HTTPS_PREFIX)) {
			return false;
		}

		const protocol = document.createElement('span');
		protocol.className = 'browser-url-display-protocol-bad';
		protocol.textContent = CertUrlRenderer.HTTPS_PREFIX;
		container.appendChild(protocol);

		const rest = document.createElement('span');
		rest.textContent = url.slice(CertUrlRenderer.HTTPS_PREFIX.length);
		container.appendChild(rest);

		return true;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

/**
 * Indicator button inside the URL bar that surfaces site security information
 * (e.g. certificate errors). Click/Enter shows a hover popover with details
 * and (if the user has previously trusted the cert) a revoke action.
 */
class SiteInfoWidget extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _indicator: HTMLElement;
	private _certError: IBrowserViewCertificateError | undefined;

	constructor(
		parent: HTMLElement,
		private readonly _editor: BrowserEditor,
		@IHoverService private readonly _hoverService: IHoverService,
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

	/** Update visibility and state from a certificate error (or lack thereof). */
	setCertificateError(certError: IBrowserViewCertificateError | undefined): void {
		this._certError = certError;
		this._container.style.display = certError ? '' : 'none';
	}

	private _showHover(): void {
		const certError = this._certError;
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
		detail1.textContent = localize('browser.certHoverDetail1', "Your connection to this site is not secure.");
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
				// This automatically closes the browser view.
				this._editor.model?.untrustCertificate(certError.host, certError.fingerprint);
			});
			revokeLink.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					hover?.dispose();
					// This automatically closes the browser view.
					this._editor.model?.untrustCertificate(certError.host, certError.fingerprint);
				}
			});
			content.appendChild(revokeLink);
		}

		const hover = this._hoverService.showInstantHover({
			content,
			target: this._indicator,
			container: this._container,
			position: { hoverPosition: HoverPosition.BELOW },
			persistence: { sticky: true }
		}, true);
	}
}

BrowserEditor.registerContribution(BrowserEditorErrorFeatures);
