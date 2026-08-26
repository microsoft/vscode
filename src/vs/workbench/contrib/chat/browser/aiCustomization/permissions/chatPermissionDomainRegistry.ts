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
	/** Section heading, in title-style capitalization. */
	readonly label: string;
	/** Sidebar icon. The section heading itself is text-only, matching the customization sections. */
	readonly icon: ThemeIcon;
	/** Sentence shown under the heading and in the sidebar hover. */
	readonly description: string;
	/** Accessible name for the section's search box. */
	readonly filterAriaLabel: string;
	/**
	 * Shown in place of an argument for a family-wide rule (one authored with no argument, which
	 * the runtime matches against every request in its family). Without it such a row reads as a
	 * bare rule kind and looks truncated rather than deliberate.
	 */
	readonly allRequestsLabel: string;
	/**
	 * Optional plain-language reading of an argument, used for the row's tooltip and accessible
	 * name. Lets a domain explain syntax the runtime defines but a user would not recognize —
	 * notably the file-path anchors.
	 */
	describeArgument?(argument: string): string | undefined;
	/** Link text for the inline "Learn more" that follows the description. */
	readonly learnMoreLabel?: string;
	/** Documentation target for {@link learnMoreLabel}. */
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
