/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction } from 'vscode-notebook-renderer';

interface IDisposable {
	dispose(): void;
}

export const activate: ActivationFunction<void> = (_ctx) => {
	const disposables = new Map<string, IDisposable>();

	return {
		renderOutputItem: (outputInfo, element) => {
			const blob = new Blob([outputInfo.data()], { type: outputInfo.mime });
			const src = URL.createObjectURL(blob);
			const disposable = {
				dispose: () => {
					URL.revokeObjectURL(src);
				}
			};

			const image = document.createElement('img');
			image.src = src;
			const display = document.createElement('div');
			display.classList.add('display');
			display.appendChild(image);
			element.appendChild(display);

			disposables.set(outputInfo.id, disposable);
		},
		disposeOutputItem: (id: string | undefined) => {
			if (id) {
				disposables.get(id)?.dispose();
			} else {
				disposables.forEach(d => d.dispose());
			}
		}
	};
};
