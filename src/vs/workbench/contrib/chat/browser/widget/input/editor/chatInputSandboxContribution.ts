/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { combinedDisposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../../base/common/observable.js';
import { ICodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../../../editor/common/config/editorOptions.js';
import { localize } from '../../../../../../../nls.js';

export function getSandboxPlaceholder(placeholder: string, sandboxToggleChecked: boolean): string {
	return placeholder && sandboxToggleChecked ? localize('chat.input.placeholder.sandboxEnabled', "{0} (sandbox enabled)", placeholder) : placeholder;
}

/** Reconcile both base and decorated placeholders, since dictation restores the editor option it captured. */
export function bindSandboxPlaceholder(editor: ICodeEditor, getBasePlaceholder: () => string | undefined, checked: IObservable<boolean>): IDisposable {
	const update = (enabled: boolean) => {
		const base = getBasePlaceholder();
		if (!base) {
			return;
		}
		const current = editor.getOption(EditorOption.placeholder);
		const decorated = getSandboxPlaceholder(base, true);
		const desired = enabled ? decorated : base;
		if (current !== desired && (current === base || current === decorated)) {
			editor.updateOptions({ placeholder: desired });
		}
	};
	return combinedDisposable(
		autorun(reader => update(checked.read(reader))),
		editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.placeholder)) {
				update(checked.get());
			}
		}),
	);
}
