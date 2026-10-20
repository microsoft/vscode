/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import {
	CompletionContext,
	CompletionItem,
	CompletionItemKind,
	CompletionList,
} from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { getWordAtText } from '../../../../editor/common/core/wordHelper.js';
import { localize } from '../../../../nls.js';
import { ISessionContext } from '../../../services/sessions/browser/sessionContext.js';
import { getThreadMentionLabel } from '../../../services/threads/browser/threadDelegation.js';
import { IThreadsService } from '../../../services/threads/browser/threadsService.js';

const mentionPattern = /@[^\s]*/gu;

export class ThreadMentionCompletionHandler extends Disposable {
	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@ISessionContext sessionContext: ISessionContext,
		@IThreadsService threadsService: IThreadsService,
	) {
		super();
		const uri = editor.getModel()?.uri;
		if (!uri) {
			return;
		}
		this._register(
			languageFeaturesService.completionProvider.register(
				{ scheme: uri.scheme, hasAccessToAllModels: true },
				{
					_debugDisplayName: 'threadMentions',
					triggerCharacters: ['@'],
					provideCompletionItems: (
						model: ITextModel,
						position: Position,
						_context: CompletionContext,
						_token: CancellationToken,
					): CompletionList | null => {
						const session = sessionContext.session.get();
						const thread = session
							? threadsService.getThreadForSession(session)
							: undefined;
						if (!thread) {
							return null;
						}
						const word = getWordAtText(
							position.column,
							mentionPattern,
							model.getLineContent(position.lineNumber),
							0,
						);
						if (!word?.word.startsWith('@')) {
							return null;
						}
						const range = new Range(
							position.lineNumber,
							word.startColumn,
							position.lineNumber,
							word.endColumn,
						);
						const suggestions: CompletionItem[] = [
							{
								label: {
									label: '@everyone',
									description: localize(
										'threadMention.everyone.description',
										"All agents in this Thread",
									),
								},
								insertText: '@everyone ',
								filterText: '@everyone',
								kind: CompletionItemKind.Reference,
								range,
								sortText: '00',
							},
						];
						for (const [index, participant] of thread.participants.entries()) {
							const mention = getThreadMentionLabel(participant.name);
							suggestions.push({
								label: {
									label: mention,
									description:
										participant.id === thread.primaryParticipantId
											? localize('threadMention.primaryAgent', "Primary Agent")
											: localize('threadMention.agent', "Agent"),
								},
								insertText: `${mention} `,
								filterText: mention,
								kind: CompletionItemKind.Reference,
								range,
								sortText: `1${index.toString().padStart(4, '0')}`,
							});
						}
						for (const [index, target] of threadsService.threads
							.get()
							.filter((candidate) => candidate.id !== thread.id)
							.entries()) {
							const mention = getThreadMentionLabel(target.name);
							suggestions.push({
								label: {
									label: mention,
									description: localize('threadMention.thread', "Thread"),
								},
								insertText: `${mention} `,
								filterText: mention,
								kind: CompletionItemKind.Reference,
								range,
								sortText: `2${index.toString().padStart(4, '0')}`,
							});
						}
						return { suggestions };
					},
				},
			),
		);
	}
}
