/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Remote } from './remote';
import { parseComments } from '../comment';
import { Comment } from './comment';

export enum PRType {
	RequestReview = 0,
	ReviewedByMe = 1,
	Mine = 2,
	Mention = 3,
	All = 4
}

export class PullRequest {
	constructor(public readonly otcokit: any, public readonly remote: Remote, public prItem: any) { }

	async getFiles() {
		const { data } = await this.otcokit.pullRequests.getFiles({
			owner: this.remote.owner,
			repo: this.remote.name,
			number: this.prItem.number
		});

		return data;
	}

	async getBaseCommitSha() {
		if (!this.prItem.base) {
			// this one is from search results, which is not complete.
			const { data } = await this.otcokit.pullRequests.get({
				owner: this.remote.owner,
				repo: this.remote.name,
				number: this.prItem.number
			});
			this.prItem = data;
		}

		return this.prItem.base.sha;
	}

	async getComments(): Promise<Comment[]> {
		const reviewData = await this.otcokit.pullRequests.getComments({
			owner: this.remote.owner,
			repo: this.remote.name,
			number: this.prItem.number
		});
		const rawComments = reviewData.data;
		return parseComments(rawComments);
	}

	async createCommentReply(body: string, reply_to: string) {
		let ret = await this.otcokit.pullRequests.createCommentReply({
			owner: this.remote.owner,
			repo: this.remote.name,
			number: this.prItem.number,
			body: body,
			in_reply_to: reply_to
		});

		return ret;
	}

	async createComment(body: string, path: string, position: number) {
		let ret = await this.otcokit.pullRequests.createComment({
			owner: this.remote.owner,
			repo: this.remote.name,
			number: this.prItem.number,
			body: body,
			commit_id: this.prItem.head.sha,
			path: path,
			position: position
		});

		return ret;
	}

	getUserGravatar(): string {
		return this.prItem.user.avatar_url;
	}
}
