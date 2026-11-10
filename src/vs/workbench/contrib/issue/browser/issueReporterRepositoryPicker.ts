/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { $, addDisposableListener, append, EventType, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IProductConfiguration } from '../../../../base/common/product.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IssueReporterData } from '../common/issue.js';
import { getIssueReporterRepositoryChoices, resolveIssueReporterTarget } from '../common/issueReporterTarget.js';
import './media/issueReporterRepositoryPicker.css';

export function renderIssueReporterRepositoryPicker(
	container: HTMLElement,
	data: IssueReporterData,
	product: Pick<IProductConfiguration, 'reportIssueUrl' | 'reportMarketplaceIssueUrl'>,
	contextMenuProvider: IContextMenuProvider | undefined,
	onDidSelect: (repository: string) => void,
): IDisposable {
	const store = new DisposableStore();
	reset(container);
	container.classList.add('issue-reporter-target');
	container.setAttribute('role', 'status');
	const target = resolveIssueReporterTarget(data, product);
	if (!target) {
		container.textContent = localize('invalidIssueDestination', "The selected issue destination is invalid. No issue data will be sent.");
		return store;
	}
	const repository = target.repository;
	const label = repository ? `${repository.owner}/${repository.repositoryName}` : target.url;
	const choices = getIssueReporterRepositoryChoices(data, product);
	if (!contextMenuProvider || choices.length < 2) {
		container.textContent = localize('issueDestination', "Issue will be opened in {0}", label);
		return store;
	}

	const [before, after] = localize('issueDestination', "Issue will be opened in {0}", '{0}').split('{0}');
	append(container, $('span', undefined, before));
	const button = store.add(new Button(container, {
		...defaultButtonStyles,
		small: true,
		supportIcons: true,
		buttonBackground: 'transparent',
		buttonForeground: 'inherit',
		buttonHoverBackground: 'var(--vscode-toolbar-hoverBackground)',
		buttonBorder: 'var(--vscode-contrastBorder, transparent)',
		title: localize('chooseIssueRepository', "Choose Issue Repository: {0}", label),
		ariaLabel: localize('chooseIssueRepository', "Choose Issue Repository: {0}", label),
	}));
	button.element.classList.add('issue-reporter-repository-picker');
	button.label = label;
	append(button.element, renderIcon(Codicon.chevronDownCompact)).setAttribute('aria-hidden', 'true');
	button.element.setAttribute('aria-haspopup', 'menu');
	button.element.setAttribute('aria-expanded', 'false');
	if (after) {
		append(container, $('span', undefined, after));
	}

	const actions = choices.map((choice, index) => {
		const name = `${choice.repository!.owner}/${choice.repository!.repositoryName}`;
		const action = store.add(new Action(`issueReporter.repository.${index}`, name, undefined, true, () => {
			if (!store.isDisposed) {
				onDidSelect(name);
				// eslint-disable-next-line no-restricted-syntax
				container.querySelector<HTMLElement>('.issue-reporter-repository-picker')?.focus();
			}
		}));
		action.checked = name.toLowerCase() === label.toLowerCase();
		return action;
	});
	const showMenu = () => {
		button.element.setAttribute('aria-expanded', 'true');
		contextMenuProvider.showContextMenu({
			getAnchor: () => button.element,
			getActions: () => actions,
			getCheckedActionsRepresentation: () => 'radio',
			autoSelectItem: true,
			skipTelemetry: true,
			onHide: () => {
				button.element.setAttribute('aria-expanded', 'false');
				if (button.element.isConnected) {
					button.focus();
				}
			},
		});
	};
	store.add(button.onDidClick(showMenu));
	store.add(addDisposableListener(button.element, EventType.KEY_DOWN, event => {
		const key = new StandardKeyboardEvent(event);
		if (key.keyCode === KeyCode.DownArrow) {
			key.preventDefault();
			key.stopPropagation();
			showMenu();
		}
	}));
	return store;
}
