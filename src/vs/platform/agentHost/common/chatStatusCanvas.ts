/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

export const STATUS_CANVASES_META_KEY = 'vscode.chatStatusCanvases';
export const STATUS_CANVASES_DB_KEY = 'chatStatusCanvases';
export const UPDATE_CARD_CANVAS_TOOL = 'update_card_canvas';
export const statusCanvasLimits = Object.freeze({ title: 200, text: 400, items: 8, url: 2048, bytes: 16_384 });

export interface IChatStatusCanvasContent {
	readonly kind: 'status';
	readonly topic: string;
	readonly currentStep: string;
	readonly justDone: readonly string[];
	readonly pullRequests: readonly { readonly url: string }[];
	readonly nextSteps: readonly string[];
}

export interface IChatStatusCanvas extends IChatStatusCanvasContent {
	readonly chat: string;
	readonly turnId: string;
	readonly revision: number;
	readonly updatedAt: string;
}

function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('A status canvas must be an object.');
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, limit: number): string {
	if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
		throw new Error(`Status canvas text must be nonempty and at most ${limit} characters.`);
	}
	return value.trim();
}

function items<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
	if (!Array.isArray(value) || value.length > statusCanvasLimits.items) {
		throw new Error(`A status canvas list must contain at most ${statusCanvasLimits.items} entries.`);
	}
	return Object.freeze(value.map(parse));
}

/** Validates tool input independently of the provider's schema enforcement. */
export function parseChatStatusCanvasContent(value: unknown, stored = false): IChatStatusCanvasContent {
	const raw = object(value);
	const keys = ['kind', 'topic', 'currentStep', 'justDone', 'pullRequests', 'nextSteps'];
	if (stored) {
		keys.push('chat', 'turnId', 'revision', 'updatedAt');
	}
	if (raw.kind !== 'status' || Object.keys(raw).some(key => !keys.includes(key))) {
		throw new Error('Unsupported status canvas fields. The host selects the owning chat and turn.');
	}
	const content: IChatStatusCanvasContent = {
		kind: 'status',
		topic: text(raw.topic, statusCanvasLimits.title),
		currentStep: text(raw.currentStep, statusCanvasLimits.text),
		justDone: items(raw.justDone, item => text(item, statusCanvasLimits.text)),
		pullRequests: items(raw.pullRequests, item => {
			const record = object(item);
			if (Object.keys(record).some(key => key !== 'url')) {
				throw new Error('Pull requests accept a URL, not an agent-reported live state.');
			}
			const url = text(record.url, statusCanvasLimits.url);
			const uri = URI.parse(url, true);
			const parsed = URL.parse(url);
			if (!parsed || /\s/.test(url) || parsed.username || parsed.password || uri.scheme !== 'https' || !uri.authority || uri.authority.includes('@') || !/^\/[^/]+\/[^/]+\/pull\/[1-9]\d*\/?$/.test(uri.path) || uri.query || uri.fragment) {
				throw new Error('A tracked pull request must be an absolute HTTPS pull request URL without credentials.');
			}
			return Object.freeze({ url });
		}),
		nextSteps: items(raw.nextSteps, item => text(item, statusCanvasLimits.text)),
	};
	if (new TextEncoder().encode(JSON.stringify(content)).byteLength > statusCanvasLimits.bytes) {
		throw new Error('The status canvas exceeds the size limit.');
	}
	return Object.freeze(content);
}

/** Parses durable/remote state without trusting its producer. */
export function parseChatStatusCanvases(value: unknown): readonly IChatStatusCanvas[] {
	if (!Array.isArray(value)) {
		throw new Error('Invalid saved status canvas collection.');
	}
	const owners = new Set<string>();
	return Object.freeze(value.map(entry => {
		const raw = object(entry);
		const content = parseChatStatusCanvasContent(raw, true);
		const chat = text(raw.chat, 4096);
		const turnId = text(raw.turnId, 256);
		const updatedAt = text(raw.updatedAt, 40);
		if (!URI.parse(chat, true).scheme || owners.has(chat) || typeof raw.revision !== 'number' || !Number.isSafeInteger(raw.revision) || raw.revision < 1
			|| !Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt) {
			throw new Error('Invalid status canvas owner, revision or timestamp.');
		}
		owners.add(chat);
		return Object.freeze({ ...content, chat, turnId, revision: raw.revision, updatedAt });
	}));
}

export function readChatStatusCanvases(meta: Readonly<Record<string, unknown>> | undefined): readonly IChatStatusCanvas[] {
	return meta?.[STATUS_CANVASES_META_KEY] === undefined ? [] : parseChatStatusCanvases(meta[STATUS_CANVASES_META_KEY]);
}

export function withChatStatusCanvases(meta: Readonly<Record<string, unknown>> | undefined, canvases: readonly IChatStatusCanvas[]): Record<string, unknown> {
	const next = { ...meta };
	if (canvases.length) {
		next[STATUS_CANVASES_META_KEY] = canvases;
	} else {
		delete next[STATUS_CANVASES_META_KEY];
	}
	return next;
}
