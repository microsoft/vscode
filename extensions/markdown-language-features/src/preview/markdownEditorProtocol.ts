/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineInterface, requestType, type InterfaceClient } from '@vscode/hubrpc';
import * as z from 'zod/mini';

const offset = z.int().check(z.nonnegative());
const range = z.object({ start: offset, endExclusive: offset });
const sandbox = z.object({
	forms: z.optional(z.boolean()),
	downloads: z.optional(z.boolean()),
	pointerLock: z.optional(z.boolean()),
	clipboardWrite: z.optional(z.boolean()),
});
const resolvedCodeBlockEditor = z.object({
	cacheKey: z.optional(z.string()),
	html: z.string(),
	runtimeKey: z.string().check(z.minLength(1)),
	resourceBaseUrl: z.optional(z.string()),
	hostTransport: z.optional(z.boolean()),
	contentType: z.enum(['text', 'json']),
	initialHeight: z.optional(z.number().check(z.positive())),
	sandbox: z.optional(sandbox),
});
const codeBlockEditorProvider = z.object({
	id: z.string(),
	selector: z.union([
		z.object({ language: z.string(), languagePrefix: z.optional(z.never()) }),
		z.object({ language: z.optional(z.never()), languagePrefix: z.string() }),
	]),
	source: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('static'), descriptor: resolvedCodeBlockEditor }),
		z.object({ kind: z.literal('exportApi') }),
	]),
});
const highlightResult = z.object({
	tokens: z.readonly(z.array(z.object({ length: offset, foreground: offset, fontStyle: offset }))),
	colorMap: z.readonly(z.array(z.string())),
});
const linkStatus = z.object({
	kind: z.enum(['neutral', 'pending', 'success', 'warning', 'error', 'open', 'closed', 'merged', 'draft', 'notPlanned']),
	label: z.string(),
});
const richLinkPresentationUpdate = z.object({
	href: z.string(),
	presentation: z.optional(z.object({
		kind: z.enum(['resource', 'issue', 'pullRequest', 'commit', 'file', 'folder', 'session', 'repository', 'branch']),
		title: z.optional(z.string()),
		detail: z.optional(z.string()),
		reference: z.optional(z.string()),
		tooltip: z.optional(z.string()),
		ariaLabel: z.optional(z.string()),
		status: z.optional(linkStatus),
		secondaryStatus: z.optional(linkStatus),
		isLoading: z.optional(z.boolean()),
	})),
});
const runtime = z.object({ runtimeId: z.string() });
// The nested editor owns its protocol. Only its routing and lifetime belong to this bridge.
const runtimeMessage = z.extend(runtime, { message: z.unknown() });

export const markdownEditorHost = defineInterface({ id: 'markdown.editor.host' }, {
	ready: requestType(z.object({ documentVersion: offset, editEpoch: offset }), z.void()),
	edit: requestType(z.extend(range, { text: z.string(), editEpoch: offset }), z.void()),
	history: requestType(z.object({ command: z.enum(['undo', 'redo']) }), z.void()),
	openLink: requestType(z.object({ href: z.string() }), z.void()),
	setReadonly: requestType(z.object({ readonly: z.boolean() }), z.void()),
	editorFocusChanged: requestType(z.object({ focused: z.boolean() }), z.void()),
	richLinkTargets: requestType(z.object({ hrefs: z.readonly(z.array(z.string())) }), z.void()),
	resolveCodeBlockEditor: requestType(z.object({ providerId: z.string(), language: z.string() }), z.object({ descriptor: z.optional(resolvedCodeBlockEditor) })),
	createCodeBlockEditorHostTransport: requestType(z.extend(runtime, { providerId: z.string(), runtimeKey: z.string() }), z.void()),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	disposeCodeBlockEditorHostTransport: requestType(runtime, z.void()),
	codeBlockEditorDiagnostic: requestType(z.object({ message: z.string() }), z.void()),
	addComment: requestType(z.extend(range, { text: z.string() }), z.void()),
	deleteComment: requestType(z.object({ id: z.string() }), z.void()),
	highlight: requestType(z.object({ source: z.string(), languageId: z.string() }), highlightResult),
});

export const markdownEditorRenderer = defineInterface({ id: 'markdown.editor.renderer' }, {
	update: requestType(z.object({ content: z.string(), editEpoch: offset }), z.void()),
	codeBlockEditorProviders: requestType(z.object({ codeBlockEditorProviders: z.readonly(z.array(codeBlockEditorProvider)) }), z.void()),
	codeBlockEditorHostTransportMessage: requestType(runtimeMessage, z.void()),
	gutterMarkers: requestType(z.object({
		markers: z.readonly(z.array(z.extend(range, { type: z.enum(['added', 'modified', 'deleted']) }))),
	}), z.void()),
	comments: requestType(z.object({
		comments: z.readonly(z.array(z.extend(range, { id: z.string(), body: z.string(), author: z.optional(z.string()) }))),
		acceptsComments: z.boolean(),
	}), z.void()),
	revealComment: requestType(z.object({ id: z.string() }), z.void()),
	revealLinkTarget: requestType(z.extend(range, { selectionStart: offset }), z.void()),
	command: requestType(z.object({ command: z.string() }), z.void()),
	highlightThemeChanged: requestType(z.object({}), z.void()),
	richLinkPresentations: requestType(z.object({ presentations: z.readonly(z.array(richLinkPresentationUpdate)) }), z.void()),
});

export type MarkdownEditorHost = InterfaceClient<typeof markdownEditorHost>;
export type MarkdownEditorRenderer = InterfaceClient<typeof markdownEditorRenderer>;
export type CodeBlockEditorProviderDefinition = z.infer<typeof codeBlockEditorProvider>;
export type ResolvedCodeBlockEditor = z.infer<typeof resolvedCodeBlockEditor>;
export type HighlightResult = z.infer<typeof highlightResult>;
export type RichLinkPresentationUpdate = z.infer<typeof richLinkPresentationUpdate>;
