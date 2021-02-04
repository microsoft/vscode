/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export default () => `
<div class="gettingStartedContainer">
	<div class="gettingStarted" role="document">
		<div class="gettingStartedSlideCategory gettingStartedSlide categories">
			<div class="gap"></div>
			<div class="header">
				<h1 class="product-name caption">${escape(localize('gettingStarted.vscode', "Visual Studio Code"))}</h1>
				<p class="subtitle description">${escape(localize({ key: 'gettingStarted.editingRedefined', comment: ['Shown as subtitle on the Welcome page.'] }, "Code editing. Redefined"))}</p>
			</div>
		</div>
		<div class="gettingStartedSlideDetails gettingStartedSlide detail">
			<button class="prev-button button-link" x-dispatch="scrollPrev"><span class="scroll-button codicon codicon-chevron-left"></span>Back</a>
			<div class="gettingStartedDetailsContent">
				<div class="gap"></div>
				<div class="getting-started-detail-columns">
					<div class="gap"></div>
					<div class="getting-started-detail-left">
						<div class="getting-started-detail-title"></div>
					</div>
					<div class="getting-started-detail-right"></div>
					<div class="gap"></div>
				</div>
				<div class="gap"></div>
			</div>
		</div>
	</div>
</div>
`.replace(/\|/g, '`');
