/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as moment from 'moment';

export enum EventType {
	Committed,
	Mentioned,
	Subscribed,
	Commented,
	Reviewed,
	Other
}

export interface Author {
	name: string;
	email: string;
	date: Date;
}

export interface Committer {
	name: string;
	email: string;
	date: Date;
}

export interface Tree {
	sha: string;
	url: string;
}

export interface Parent {
	sha: string;
	url: string;
	html_url: string;
}

export interface Verification {
	verified: boolean;
	reason: string;
	signature?: any;
	payload?: any;
}

export interface User {
	login: string;
	id: number;
	avatar_url: string;
	gravatar_id: string;
	url: string;
	html_url: string;
	followers_url: string;
	following_url: string;
	gists_url: string;
	starred_url: string;
	subscriptions_url: string;
	organizations_url: string;
	repos_url: string;
	events_url: string;
	received_events_url: string;
	type: string;
	site_admin: boolean;
}

export interface Html {
	href: string;
}

export interface PullRequest {
	href: string;
}

export interface Links {
	html: Html;
	pull_request: PullRequest;
}

export interface MentionEvent {
	id: number;
	url: string;
	actor: User;
	event: EventType;
	commit_id: string;
	commit_url: string;
	created_at: Date;
}

export interface SubscribeEvent {
	id: number;
	url: string;
	actor: User;
	event: EventType;
	commit_id: string;
	commit_url: string;
	created_at: Date;
}

export interface CommentEvent {
	url: string;
	html_url: string;
	author: Author;
	user: User;
	created_at: Date;
	updated_at: Date;
	id: number;
	event: EventType;
	actor: User;
	author_association: string;
	body: string;
}

export interface ReviewEvent {
	id: number;
	user: User;
	body: string;
	commit_id: string;
	submitted_at: Date;
	state: string;
	html_url: string;
	pull_request_url: string;
	author_association: string;
	_links: Links;
	event: EventType;
}

export interface CommitEvent {
	sha: string;
	url: string;
	html_url: string;
	author: Author;
	committer: Committer;
	tree: Tree;
	message: string;
	parents: Parent[];
	verification: Verification;
	event: EventType;
}

export type TimelineEvent = CommitEvent | ReviewEvent | SubscribeEvent | CommentEvent | MentionEvent;

export function renderComment(comment: CommentEvent): string {
	return `<div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="review-comment-contents">
			<div class="review-comment-header">
				<div class="avatar-container">
					<img class="avatar" src="${comment.user.avatar_url}">
				</div>
				<strong class="author"><a href="${comment.user.html_url}">${comment.user.login}</a></strong>
				<div class="timestamp">${moment(comment.created_at).fromNow()}</div>
			</div>
			<div class="comment-body">
				${comment.body}
			</div>
		</div>
	</div>
</div>`;
}

export function renderCommit(timelineEvent: CommitEvent): string {
	return `<div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="review-comment-contents">
			<div class="commit">
				<strong>${timelineEvent.author.name} commit: <a href="${timelineEvent.html_url}">${timelineEvent.message} (${timelineEvent.sha})</a></strong>
			</div>
		</div>
	</div>
</div>`;
}

export function renderReview(timelineEvent: ReviewEvent): string {
	return `<div class="comment-container">

	<div class="review-comment" tabindex="0" role="treeitem">
		<div class="review-comment-contents">
			<div class="review">
				<strong><a href="${timelineEvent.html_url}">${timelineEvent.user.login} left a review </a></strong><span></span>
				<div class="timestamp">${moment(timelineEvent.submitted_at).fromNow()}</div>
			</div>
		</div>
	</div>
</div>`;
}

export function renderTimelineEvent(timelineEvent: TimelineEvent): string {
	switch (timelineEvent.event) {
		case EventType.Committed:
			return renderCommit((<CommitEvent>timelineEvent));
		case EventType.Commented:
			return renderComment((<CommentEvent>timelineEvent));
		case EventType.Reviewed:
			return renderReview((<ReviewEvent>timelineEvent));
	}
	return '';
}

// export function getStatusBGCoor(pr: any) {
// 	if (pr.isMerged) {
// 		return '#6f42c1';
// 	} else if (pr.isOpen) {
// 		return '#2cbe4e';
// 	} else {
// 		return '#cb2431';
// 	}
// }

export function getStatus(pr: any) {
	if (pr.isMerged) {
		return 'Merged';
	} else if (pr.isOpen) {
		return 'Open';
	} else {
		return 'Closed';
	}
}