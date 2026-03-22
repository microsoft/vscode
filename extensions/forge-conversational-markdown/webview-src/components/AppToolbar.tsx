/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** @jsxImportSource preact */

import { useEffect } from 'preact/hooks';
import type { FromWebviewMessage } from '../../src/protocol/types';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface AppToolbarProps {
	readonly hasComments: boolean;
	readonly vscode: VsApi;
}

export function AppToolbar(props: AppToolbarProps): preact.JSX.Element {
	const { hasComments, vscode } = props;

	useEffect(() => {
		const inField = (t: HTMLElement | null) =>
			t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);

		const onKeyDown = (e: KeyboardEvent) => {
			if (inField(e.target as HTMLElement | null)) {
				return;
			}
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				e.preventDefault();
				vscode.postMessage({ type: 'refresh' });
				return;
			}
			if (
				hasComments &&
				(e.ctrlKey || e.metaKey) &&
				e.shiftKey &&
				(e.key === 'e' || e.key === 'E')
			) {
				e.preventDefault();
				vscode.postMessage({ type: 'speEngineer' });
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [vscode, hasComments]);

	return (
		<header class="forge-cmd-toolbar">
			<div class="forge-cmd-toolbar-actions">
				<button type="button" class="forge-cmd-btn" onClick={() => vscode.postMessage({ type: 'showSource' })}>
					Show markdown
				</button>
				{hasComments ? (
					<div class="forge-cmd-split-build forge-cmd-split-build-standalone forge-cmd-split-build-spe" aria-label="Spe Engineer">
						<button
							type="button"
							class="forge-cmd-split-build-main"
							onClick={() => vscode.postMessage({ type: 'speEngineer' })}
						>
							<span class="forge-cmd-split-build-label">Spe Engineer</span>
							<kbd class="forge-cmd-split-build-kbd" aria-hidden="true">
								Ctrl+⇧+E
							</kbd>
						</button>
					</div>
				) : null}
				<div class="forge-cmd-split-build forge-cmd-split-build-standalone" aria-label="Build preview">
					<button
						type="button"
						class="forge-cmd-split-build-main"
						onClick={() => vscode.postMessage({ type: 'refresh' })}
					>
						<span class="forge-cmd-split-build-label">Build</span>
						<kbd class="forge-cmd-split-build-kbd" aria-hidden="true">
							Ctrl+Enter
						</kbd>
					</button>
				</div>
			</div>
		</header>
	);
}
