/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentSelector } from 'vscode-languageclient';
import { Event, EventEmitter, extensions } from 'vscode';

/**
 * JSON language participant contribution.
 */
interface LanguageParticipantContribution {
	/**
	 * The id of the language which participates with the JSON language server.
	 */
	languageId: string;
	/**
	 * true if the language allows comments and false otherwise.
	 * TODO: implement server side setting
	 */
	comments?: boolean;
}

export interface LanguageParticipants {
	readonly onDidChange: Event<void>;
	readonly documentSelector: DocumentSelector;
	hasLanguage(languageId: string): boolean;
	useComments(languageId: string): boolean;
	dispose(): void;
}

export function getLanguageParticipants(): LanguageParticipants {
	const onDidChangeEmmiter = new EventEmitter<void>();
	let languages = new Set<string>();
	let comments = new Set<string>();

	function update() {
		const oldLanguages = languages, oldComments = comments;

		languages = new Set();
		languages.add('json');
		languages.add('jsonc');
		languages.add('snippets');
		comments = new Set();
		comments.add('jsonc');
		comments.add('snippets');

		for (const extension of extensions.allAcrossExtensionHosts) {
			const jsonLanguageParticipants = extension.packageJSON?.contributes?.jsonLanguageParticipants as LanguageParticipantContribution[];
			if (Array.isArray(jsonLanguageParticipants)) {
				for (const jsonLanguageParticipant of jsonLanguageParticipants) {
					const languageId = jsonLanguageParticipant.languageId;
					if (typeof languageId === 'string') {
						languages.add(languageId);
						if (jsonLanguageParticipant.comments === true) {
							comments.add(languageId);
						}
					}
				}
			}
		}
		return !isEqualSet(languages, oldLanguages) || !isEqualSet(comments, oldComments);
	}
	update();

	const changeListener = extensions.onDidChange(_ => {
		if (update()) {
			onDidChangeEmmiter.fire();
		}
	});

	return {
		onDidChange: onDidChangeEmmiter.event,
		get documentSelector() { return Array.from(languages); },
		hasLanguage(languageId: string) { return languages.has(languageId); },
		useComments(languageId: string) { return comments.has(languageId); },
		dispose: () => changeListener.dispose()
	};
}

function isEqualSet<T>(s1: Set<T>, s2: Set<T>) {
	if (s1.size !== s2.size) {
		return false;
	}
	for (const e of s1) {
		if (!s2.has(e)) {
			return false;
		}
	}
	return true;
}
