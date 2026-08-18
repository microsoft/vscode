/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ChatPermissionDomainId } from '../../../common/permissions/chatPermissions.js';

/**
 * Describes one permission area for display. A domain contributes labels and copy only — the rules
 * themselves always come from the snapshot service, so adding a domain never adds a second source
 * of truth.
 */
export interface IChatPermissionDomain {
	readonly id: ChatPermissionDomainId;
	/** Sidebar and header label, in title-style capitalization. */
	readonly label: string;
	readonly icon: ThemeIcon;
	/** Sentence shown in the sidebar hover and as the section footer. */
	readonly description: string;
	/** Placeholder for the section's filter box. */
	readonly filterPlaceholder: string;
	/** Documentation target for the footer's "Learn more" link. */
	readonly learnMoreUrl?: string;
}

class ChatPermissionDomainRegistry {
	private readonly domains = new Map<ChatPermissionDomainId, IChatPermissionDomain>();

	register(domain: IChatPermissionDomain): void {
		this.domains.set(domain.id, domain);
	}

	get(id: ChatPermissionDomainId): IChatPermissionDomain | undefined {
		return this.domains.get(id);
	}

	getAll(): readonly IChatPermissionDomain[] {
		return [...this.domains.values()];
	}
}

export const chatPermissionDomainRegistry = new ChatPermissionDomainRegistry();
