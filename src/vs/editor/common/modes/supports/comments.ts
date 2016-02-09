/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ICommentsConfiguration, IRichEditComments} from 'vs/editor/common/modes';

export interface ICommentsSupportContribution {
	commentsConfiguration: ICommentsConfiguration;
}

export class CommentsSupport implements IRichEditComments {

	private _contribution: ICommentsSupportContribution;

	constructor(contribution:ICommentsSupportContribution) {
		this._contribution = contribution;
	}

	public getCommentsConfiguration(): ICommentsConfiguration {
		return this._contribution.commentsConfiguration;
	}

}
