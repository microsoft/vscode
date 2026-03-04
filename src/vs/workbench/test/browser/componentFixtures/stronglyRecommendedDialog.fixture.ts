/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { StronglyRecommendedExtensionEntry, renderStronglyRecommendedExtensionList } from '../../../contrib/extensions/browser/stronglyRecommendedExtensionList.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

export default defineThemedFixtureGroup({
	TwoExtensions: defineComponentFixture({ render: ctx => renderDialog(ctx, twoExtensions) }),
	SingleExtension: defineComponentFixture({ render: ctx => renderDialog(ctx, singleExtension) }),
	ManyExtensions: defineComponentFixture({ render: ctx => renderDialog(ctx, manyExtensions) }),
	NoneSelected: defineComponentFixture({ render: ctx => renderDialog(ctx, twoExtensions, { allUnchecked: true }) }),
});

const twoExtensions: StronglyRecommendedExtensionEntry[] = [
	{ displayName: 'TypeScript Customized Language Service', publisherDisplayName: 'Microsoft', version: '3.1.0' },
	{ displayName: 'VS Code Extras', publisherDisplayName: 'Microsoft', version: '1.0.5' },
];

const singleExtension: StronglyRecommendedExtensionEntry[] = [
	{ displayName: 'TypeScript Customized Language Service', publisherDisplayName: 'Microsoft', version: '3.1.0' },
];

const manyExtensions: StronglyRecommendedExtensionEntry[] = [
	{ displayName: 'TypeScript Customized Language Service', publisherDisplayName: 'Microsoft', version: '3.1.0' },
	{ displayName: 'VS Code Extras', publisherDisplayName: 'Microsoft', version: '1.0.5' },
	{ displayName: 'ESLint', publisherDisplayName: 'Dirk Baeumer', version: '2.4.4' },
	{ displayName: 'Prettier', publisherDisplayName: 'Esben Petersen', version: '10.1.0' },
	{ displayName: 'GitLens', publisherDisplayName: 'GitKraken', version: '15.6.2' },
];

function renderDialog({ container, disposableStore }: ComponentFixtureContext, extensions: StronglyRecommendedExtensionEntry[], options?: { allUnchecked?: boolean }): void {
	container.style.width = '700px';
	container.style.height = '500px';
	container.style.position = 'relative';
	container.style.overflow = 'hidden';

	// The dialog uses position:fixed on its modal block, which escapes the shadow DOM container.
	// Override to position:absolute so it stays within the fixture bounds.
	const fixtureStyle = new CSSStyleSheet();
	fixtureStyle.replaceSync('.monaco-dialog-modal-block { position: absolute; }');
	const shadowRoot = container.getRootNode() as ShadowRoot;
	shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, fixtureStyle];

	const message = extensions.length === 1
		? localize('strongExtensionFixture', "This workspace strongly recommends installing the '{0}' extension. Do you want to install?", extensions[0].displayName)
		: localize('strongExtensionsFixture', "This workspace strongly recommends installing {0} extensions. Do you want to install?", extensions.length);

	let listResult!: ReturnType<typeof renderStronglyRecommendedExtensionList>;

	const dialog = disposableStore.add(new Dialog(
		container,
		message,
		[
			localize('install', "Install"),
			localize('cancel', "Cancel"),
		],
		{
			type: 'info',
			renderBody: (bodyContainer: HTMLElement) => {
				listResult = renderStronglyRecommendedExtensionList(bodyContainer, disposableStore, extensions);
			},
			buttonOptions: [{
				styleButton: (button) => listResult.styleInstallButton(button),
			}],
			cancelId: 1,
			buttonStyles: defaultButtonStyles,
			checkboxStyles: defaultCheckboxStyles,
			inputBoxStyles: defaultInputBoxStyles,
			dialogStyles: defaultDialogStyles,
		}
	));

	dialog.show();

	if (options?.allUnchecked) {
		for (const cb of container.querySelectorAll<HTMLElement>('.strongly-recommended-extension-row .monaco-custom-toggle')) {
			cb.click();
		}
	}
}
