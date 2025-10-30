/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/issueReporter.css';
import { safeSetInnerHtml } from '../../../../base/browser/domSanitize.js';
import { Dimension, getWindow } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import BaseHtml from './issueReporterPage.js';
import { IssueWebReporter } from './issueReporterService.js';
import product from '../../../../platform/product/common/product.js';

export abstract class IssueReporterControl extends Disposable {

	constructor(
		protected readonly container: HTMLElement,
		protected data: IssueReporterData,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IIssueFormService protected readonly issueFormService: IIssueFormService
	) {
		super();
		this.create();
	}

	protected abstract getOSInfo(): { type: string; arch: string; release: string };

	private create(): void {
		console.log('IssueReporterControl.create called', { container: this.container, data: this.data });
		this.container.classList.add('issue-reporter-container');

		// Create a wrapper div to contain the issue reporter HTML
		const issueReporterWrapper = document.createElement('div');
		issueReporterWrapper.classList.add('issue-reporter-wrapper');
		this.container.appendChild(issueReporterWrapper);
		console.log('IssueReporterControl.create wrapper created', { wrapper: issueReporterWrapper });

		// Set the HTML content using the same sanitization as the auxiliary window
		const baseHtml = BaseHtml();
		console.log('IssueReporterControl.create base HTML', { htmlLength: baseHtml.length, htmlStart: baseHtml.substring(0, 100) });
		safeSetInnerHtml(issueReporterWrapper, baseHtml, {
			allowedTags: {
				augment: [
					'input',
					'select',
					'checkbox',
					'textarea',
				]
			},
			allowedAttributes: {
				augment: [
					'id',
					'class',
					'style',
					'textarea',
				]
			}
		});
		console.log('IssueReporterControl.create HTML set', { wrapperHTML: issueReporterWrapper.innerHTML.substring(0, 200) });

		// Create a mock window object that points to our container
		const mockWindow = this.createMockWindow(issueReporterWrapper);
		console.log('IssueReporterControl.create mock window created', { mockWindow });

		// Initialize the issue reporter with our mock window
		const issueReporter = this._register(this.instantiationService.createInstance(
			IssueWebReporter,
			false,
			this.data,
			this.getOSInfo(),
			product,
			mockWindow as any
		));
		console.log('IssueReporterControl.create issue reporter created', { issueReporter });

		console.log('IssueReporterControl.create calling render');
		issueReporter.render();
		console.log('IssueReporterControl.create render completed');
	}

	private createMockWindow(container: HTMLElement): any {
		const targetWindow = getWindow(container);
		// Create a mock window object that the issue reporter can use
		return {
			document: container.ownerDocument,
			navigator: targetWindow.navigator,
			location: targetWindow.location,
			addEventListener: (type: string, listener: EventListener) => {
				container.addEventListener(type, listener);
			},
			removeEventListener: (type: string, listener: EventListener) => {
				container.removeEventListener(type, listener);
			},
			dispatchEvent: (event: Event) => {
				return container.dispatchEvent(event);
			}
		};
	}

	focus(): void {
		const issueTitle = this.container.querySelector<HTMLElement>('#issue-title');
		if (issueTitle) {
			issueTitle.focus();
		}
	}

	layout(dimension: Dimension): void {
		// Issue reporter can handle its own layout
	}

	updateData(data: IssueReporterData): void {
		this.data = data;
		// Recreate the issue reporter with new data
		this.container.innerHTML = '';
		this.create();
	}
}

export class BrowserIssueReporterControl extends IssueReporterControl {

	constructor(
		container: HTMLElement,
		data: IssueReporterData,
		@IInstantiationService instantiationService: IInstantiationService,
		@IIssueFormService issueFormService: IIssueFormService
	) {
		super(container, data, instantiationService, issueFormService);
	}

	protected getOSInfo(): { type: string; arch: string; release: string } {
		// For web, we don't have detailed OS info
		return { type: '', arch: '', release: '' };
	}
}
