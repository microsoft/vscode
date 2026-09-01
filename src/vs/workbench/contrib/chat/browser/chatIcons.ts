/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { getIconRegistry } from '../../../../platform/theme/common/iconRegistry.js';

/**
 * Returns the compact variant of a codicon when one is registered.
 */
export function getCompactCodicon(icon: ThemeIcon): ThemeIcon {
	const modifier = ThemeIcon.getModifier(icon);
	const id = modifier ? icon.id.slice(0, -(modifier.length + 1)) : icon.id;
	const compactId = `${id}-compact`;

	if (!getIconRegistry().getIcon(compactId)) {
		return icon;
	}

	return {
		id: modifier ? `${compactId}~${modifier}` : compactId,
		color: icon.color,
	};
}

/**
 * Replaces rendered codicon classes with their registered compact variants.
 */
export function compactCodiconsIn(element: HTMLElement): void {
	const visit = (container: Element): void => {
		for (const child of container.children) {
			if (child.classList.contains('codicon')) {
				const iconClass = [...child.classList].find(className => className.startsWith('codicon-') && !className.startsWith('codicon-modifier-'));
				if (iconClass) {
					const icon = ThemeIcon.fromId(iconClass.substring('codicon-'.length));
					const compactIcon = getCompactCodicon(icon);
					if (compactIcon.id !== icon.id) {
						child.classList.replace(iconClass, `codicon-${compactIcon.id}`);
					}
				}
			}
			visit(child);
		}
	};

	visit(element);
}
