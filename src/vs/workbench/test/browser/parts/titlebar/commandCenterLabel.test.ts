/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IResolvedFolderLocation } from '../../../../../platform/workspace/common/folderLocations.js';
import { CommandCenterLabel } from '../../../../browser/parts/titlebar/commandCenterLabel.js';

suite('CommandCenterLabel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const hoverDelegate = {} as IHoverDelegate;

	function createLocation(description?: string, icon = Codicon.gitBranch): IResolvedFolderLocation {
		return { uri: URI.file('/work/repo.worktrees/feature'), label: 'feature', description, icon, providerId: 'test', builtIn: true };
	}

	function createLabel(hovers: string[] = []) {
		const element = document.createElement('div');
		const hoverService = new class extends mock<IHoverService>() {
			override setupManagedHover(_delegate: IHoverDelegate, _element: HTMLElement, content: string | HTMLElement | (() => string | HTMLElement)) {
				hovers.push(String(content));
				return toDisposable(() => hovers.push('disposed')) as ReturnType<IHoverService['setupManagedHover']>;
			}
		}();
		return { element, label: disposables.add(new CommandCenterLabel(element, hoverDelegate, hoverService)) };
	}

	test('renders the location icon, name and branch group', () => {
		const hovers: string[] = [];
		const { element, label } = createLabel(hovers);

		label.update('repo', createLocation('feature-branch'));
		label.dispose();

		assert.deepStrictEqual({
			hasLocation: element.classList.contains('has-folder-location'),
			aria: element.getAttribute('aria-label'),
			name: element.querySelector('.folder-location-name')?.textContent,
			hasIcon: !!element.querySelector('.folder-location-icon'),
			branch: element.querySelector('.folder-location-branch')?.textContent,
			hovers,
			hasBranchIcon: !!element.querySelector('.folder-location-branch-icon'),
		}, {
			hasLocation: true,
			aria: 'repo, branch feature-branch',
			name: 'repo',
			hasIcon: true,
			branch: 'feature-branch',
			hovers: ['feature-branch', 'disposed'],
			hasBranchIcon: true,
		});
	});

	test('renders the folder-with-branch icon by default and the location own icon otherwise', () => {
		const iconClass = (icon: typeof Codicon.gitBranch | undefined) => {
			const { element, label } = createLabel();
			label.update('repo', { ...createLocation(), icon });
			return /codicon-(git-branch-checkout|git-branch)\b/.exec(element.querySelector('.folder-location-icon')?.className ?? '')?.[1];
		};

		assert.deepStrictEqual([iconClass(Codicon.gitBranchCheckout), iconClass(undefined), iconClass(Codicon.gitBranch)], ['git-branch-checkout', 'git-branch-checkout', 'git-branch']);
	});

	test('without a description has no branch group', () => {
		const { element, label } = createLabel();

		label.update('repo', createLocation());

		assert.deepStrictEqual({
			aria: element.getAttribute('aria-label'),
			hasBranchGroup: !!element.querySelector('.folder-location-branch-group'),
			name: element.querySelector('.folder-location-name')?.textContent,
		}, { aria: 'repo', hasBranchGroup: false, name: 'repo' });
	});

	test('resets to plain text at the primary location', () => {
		const { element, label } = createLabel();
		label.update('repo', createLocation('feature-branch'));

		label.update('repo', undefined);

		assert.deepStrictEqual({
			hasLocation: element.classList.contains('has-folder-location'),
			aria: element.getAttribute('aria-label'),
			html: element.innerHTML,
		}, { hasLocation: false, aria: null, html: 'repo' });
	});
});
