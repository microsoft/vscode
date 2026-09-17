/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ChatInputResponseKind, type ChatInputAnswer, type ChatInputRequest } from '../../common/state/sessionState.js';
import { answerStrings, buildUserInputRequest } from './codexUserInputMapper.js';
import type { AsyncUserInputQuestion } from './protocol/generated/v2/AsyncUserInputQuestion.js';
import type { TurnCompletedNotification } from './protocol/generated/v2/TurnCompletedNotification.js';

interface IAsyncQuestionsHost {
	show(request: ChatInputRequest): void;
	cancel(requestId: string): void;
	send(text: string): Promise<void>;
	finish(completion: TurnCompletedNotification): void;
	reportError(error: unknown): void;
}

/** Keeps question controls alive until answered without blocking Codex's native turn. */
export class CodexAsyncQuestions {
	private readonly requests = new Map<string, readonly AsyncUserInputQuestion[]>();
	private readonly seen = new Set<string>();
	private completion: TurnCompletedNotification | undefined;
	private sending = 0;
	private readonly deliveries = new Set<Promise<void>>();
	private generation = 0;

	constructor(private readonly host: IAsyncQuestionsHost) { }

	/** Publishes one carousel per item; replayed start events cannot ask twice. */
	ask(itemId: string, questions: readonly AsyncUserInputQuestion[]): void {
		if (!questions.length || this.seen.has(itemId)) {
			return;
		}
		this.seen.add(itemId);
		this.show(questions);
	}

	private show(questions: readonly AsyncUserInputQuestion[]): void {
		const id = generateUuid();
		this.requests.set(id, questions);
		this.host.show(buildUserInputRequest(id, questions.map((question, index) => ({
			id: String(index), header: '', question: question.title, isOther: true, isSecret: false,
			options: question.options?.map(label => ({ label, description: '' })) ?? null,
		}))));
	}

	/** A new native turn supersedes a held completion, retaining outstanding questions. */
	turnStarted(turnId: string): void {
		if (this.completion?.turn.id !== turnId) {
			this.completion = undefined;
		}
	}

	/** Hold only successful completion so the existing active-turn carousel stays usable. */
	holdCompletion(completion: TurnCompletedNotification): boolean {
		if (completion.turn.status === 'completed' && (this.requests.size > 0 || this.sending > 0)) {
			this.completion = completion;
			return true;
		}
		this.clear();
		return false;
	}

	/** Consumes explicit answers; skipping never submits a suggested option. */
	respond(id: string, response: ChatInputResponseKind, answers?: Record<string, ChatInputAnswer>): boolean {
		const questions = this.requests.get(id);
		if (!questions) {
			return false;
		}
		this.requests.delete(id);
		const text = questions.flatMap((question, index) => {
			const values = answerStrings(answers?.[String(index)], response);
			if (!values.length) {
				return [];
			}
			const title = Array.from(question.title).slice(0, 512).join('').replace(/[\r\n]/g, ' ');
			return [`> ${title}\n\n${values.join('\n')}`];
		}).join('\n\n');
		if (text) {
			const delivery = this.deliver(questions, text);
			this.deliveries.add(delivery);
			void delivery.finally(() => this.deliveries.delete(delivery));
		} else {
			this.flush();
		}
		return true;
	}

	/** Failed delivery reopens the questions instead of silently losing an accepted answer. */
	private async deliver(questions: readonly AsyncUserInputQuestion[], text: string): Promise<void> {
		const generation = this.generation;
		this.sending++;
		try {
			await this.host.send(text);
		} catch (error) {
			if (generation === this.generation) {
				this.host.reportError(error);
				this.show(questions);
			}
		} finally {
			if (generation === this.generation) {
				this.sending--;
				this.flush();
			}
		}
	}

	private flush(): void {
		if (this.requests.size === 0 && this.sending === 0 && this.completion) {
			const completion = this.completion;
			this.completion = undefined;
			this.host.finish(completion);
		}
	}

	/** Waits for already-sent RPCs so Stop can interrupt the actual continuation turn. */
	async whenIdle(): Promise<void> {
		await Promise.all(this.deliveries);
	}

	/** Cancels stale controls and invalidates in-flight callbacks on stop, replacement or disposal. */
	clear(): TurnCompletedNotification | undefined {
		const completion = this.completion;
		this.completion = undefined;
		this.generation++;
		this.sending = 0;
		const ids = [...this.requests.keys()];
		this.requests.clear();
		this.seen.clear();
		for (const id of ids) {
			this.host.cancel(id);
		}
		return completion;
	}
}
