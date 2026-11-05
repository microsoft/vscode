/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/newChatProfileNotice.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../base/common/actions.js';
import { cancelOnDispose } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, derived, derivedOpts, IObservable, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { DEFAULT_ICON } from '../../../../workbench/services/userDataProfile/common/userDataProfileIcons.js';
import { ISessionFolder } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { NewSessionBannerPriority, NewSessionBanners } from '../common/newSessionBanners.js';
import { FolderProfileCustomizationType, FolderProfileSetupResolver, getFolderProfile, hasFolderProfileSetup, IFolderProfileSetup } from './folderProfileSetup.js';

/** The profiles whose notice the user closed for good. */
export const FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY = 'sessions.newChat.folderProfileNotice.dismissedProfiles';

interface IFolderProfileNoticeContent {
	readonly sessionId: string;
	readonly folder: ISessionFolder;
	readonly setup: IFolderProfileSetup;
}

interface IFolderProfileDetailsItem extends IQuickPickItem {
	run(): Promise<unknown>;
}

let messageIdPool = 0;

function getCustomizationCount(setup: IFolderProfileSetup, type: FolderProfileCustomizationType): number {
	return setup.customizations.filter(customization => customization.type === type).length;
}

/** Lists what the folder's profile has that the Agents window does not, e.g. "1 extension, 2 MCP servers and 1 agent". */
export function getFolderProfileSetupSummary(setup: IFolderProfileSetup): string {
	const parts: string[] = [];
	const add = (count: number, singular: string, plural: string) => {
		if (count > 0) {
			parts.push(count === 1 ? singular : plural);
		}
	};
	const agents = getCustomizationCount(setup, PromptsType.agent);
	const instructions = getCustomizationCount(setup, PromptsType.instructions);
	const prompts = getCustomizationCount(setup, PromptsType.prompt);
	// In the order of Show Details.
	add(setup.extensions.length, localize('folderProfileNotice.extension', "1 extension"), localize('folderProfileNotice.extensions', "{0} extensions", setup.extensions.length));
	add(setup.mcpServers.length, localize('folderProfileNotice.mcpServer', "1 MCP server"), localize('folderProfileNotice.mcpServers', "{0} MCP servers", setup.mcpServers.length));
	add(agents, localize('folderProfileNotice.agent', "1 agent"), localize('folderProfileNotice.agents', "{0} agents", agents));
	add(instructions, localize('folderProfileNotice.instructionsFile', "1 instructions file"), localize('folderProfileNotice.instructionsFiles', "{0} instructions files", instructions));
	add(prompts, localize('folderProfileNotice.promptFile', "1 prompt file"), localize('folderProfileNotice.promptFiles', "{0} prompt files", prompts));
	if (parts.length < 2) {
		return parts.join('');
	}
	return localize({ key: 'folderProfileNotice.list', comment: ['{0} is a comma-separated list, such as "1 extension, 2 MCP servers". {1} is the last item, such as "1 agent".'] }, "{0} and {1}", parts.slice(0, -1).join(', '), parts[parts.length - 1]);
}

/** Explains that the folder's profile has agent setup that the Agents window, which uses the Default profile, does not. */
export function getFolderProfileNoticeMessage(folderName: string, setup: IFolderProfileSetup): string {
	return localize(
		{ key: 'folderProfileNotice.message', comment: ['{0} is the name of a folder. {1} is the name of a profile. {2} lists what that profile has, such as "1 extension and 2 MCP servers".'] },
		"In VS Code, {0} uses your '{1}' profile, which has {2} that the Agents window doesn't. The Agents window uses your Default profile.",
		folderName, setup.profile.name, getFolderProfileSetupSummary(setup));
}

/** Describes the notice for the Agents window accessibility help. */
export function getFolderProfileNoticeAccessibilityHelp(): string {
	return localize('folderProfileNotice.accessibilityHelp', "The Agents window uses your Default profile. When VS Code opens the folder of a new session with another profile that has MCP servers, agents, instructions, prompt files, or extensions that the Agents window doesn't, a notice below the new-session input says what they are. Use Tab or Shift+Tab to reach Show Details, which lists them: select an extension to find it in the Agents window's extensions and add it there, or another item to open the file that defines it. Don't Show Again for This Profile hides the notice for that profile, including after restarting, and Escape hides it for the session you are starting.");
}

/**
 * Tells the user, below the new-session input, when VS Code opens the selected folder with a profile whose agent setup
 * the Agents window does not have, because the Agents window always uses the Default profile.
 */
export class NewChatProfileNotice extends Disposable {

	readonly element: HTMLElement;

	private _content: IFolderProfileNoticeContent | undefined;
	private _announced: string | undefined;
	/** Notices hidden with Escape, by session, folder, and profile. */
	private readonly _hiddenForSession = observableValue<ReadonlySet<string>>(this, new Set());

	constructor(
		container: HTMLElement,
		banners: NewSessionBanners,
		session: IObservable<IActiveSession | undefined>,
		private readonly _focusInput: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const resolver = instantiationService.createInstance(FolderProfileSetupResolver);
		const extUri = this._uriIdentityService.extUri;

		// Profile associations are kept for folders on this machine.
		const folder = derivedOpts<ISessionFolder | undefined>({ owner: this, equalsFn: (a, b) => a === b || (!!a && !!b && a.name === b.name && extUri.isEqual(a.root, b.root)) }, reader => {
			const current = session.read(reader);
			if (!current || current.isCreated.read(reader) || current.loading.read(reader)) {
				return undefined;
			}
			const candidate = current.workspace.read(reader)?.folders[0];
			return candidate?.root.scheme === Schemas.file ? candidate : undefined;
		});
		const profiles = observableFromEvent(this, userDataProfilesService.onDidChangeProfiles, () => userDataProfilesService.profiles);
		const dismissedProfiles = observableFromEvent(this,
			this._storageService.onDidChangeValue(StorageScope.PROFILE, FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY, this._store),
			() => this._getDismissedProfiles());
		// Installing an extension in the Agents window, or in the folder's profile, changes what the Agents window lacks.
		const extensionsChanged = observableSignalFromEvent(this, Event.any<unknown>(extensionManagementService.onDidInstallExtensions, extensionManagementService.onDidUninstallExtension));

		const resolved = observableValue<Omit<IFolderProfileNoticeContent, 'sessionId'> | undefined>(this, undefined);
		this._register(autorun(reader => {
			extensionsChanged.read(reader);
			const currentFolder = folder.read(reader);
			const profile = currentFolder ? getFolderProfile(profiles.read(reader), currentFolder.root, extUri) : undefined;
			if (!currentFolder || !profile || chatEntitlementService.sentimentObs.read(reader).hidden || dismissedProfiles.read(reader).has(profile.id)) {
				resolved.set(undefined, undefined);
				return;
			}
			// Keeps showing the notice while it is refreshed for the same folder and profile.
			const previous = resolved.read(undefined);
			if (previous && (previous.setup.profile.id !== profile.id || !extUri.isEqual(previous.folder.root, currentFolder.root))) {
				resolved.set(undefined, undefined);
			}
			const token = cancelOnDispose(reader.store);
			resolver.resolve(profile).then(setup => {
				if (!token.isCancellationRequested) {
					resolved.set({ folder: currentFolder, setup }, undefined);
				}
			}, error => {
				if (!token.isCancellationRequested) {
					this._logService.error('[FolderProfileNotice] Could not compare the folder\'s profile with the Agents window', error);
					resolved.set(undefined, undefined);
				}
			});
		}));

		const content = derived<IFolderProfileNoticeContent | undefined>(this, reader => {
			const value = resolved.read(reader);
			const sessionId = session.read(reader)?.sessionId;
			if (!value || !sessionId || !hasFolderProfileSetup(value.setup)) {
				return undefined;
			}
			const candidate = { sessionId, ...value };
			return this._hiddenForSession.read(reader).has(this._getKey(candidate)) ? undefined : candidate;
		});
		const banner = this._register(banners.register(NewSessionBannerPriority.FolderProfile, derived(this, reader => !!content.read(reader))));

		this.element = dom.append(container, dom.$('.new-session-folder-profile-notice', {
			role: 'group',
			'aria-label': localize('folderProfileNotice.ariaLabel', "Profile notice"),
		}));
		this._register(toDisposable(() => this.element.remove()));
		dom.setVisibility(false, this.element);

		const icon = dom.append(this.element, dom.$('span'));
		icon.setAttribute('aria-hidden', 'true');
		const message = dom.append(this.element, dom.$('span.new-session-folder-profile-notice-message'));
		message.id = `new-session-folder-profile-notice-message-${++messageIdPool}`;

		const detailsButton = this._register(new Button(this.element, { ...defaultButtonStyles, secondary: true, small: true }));
		detailsButton.label = localize('folderProfileNotice.showDetails', "Show Details");
		detailsButton.element.setAttribute('aria-describedby', message.id);
		this._register(detailsButton.onDidClick(() => this._showDetails()));

		const actions = this._register(new ActionBar(this.element));
		actions.push(this._register(new Action(
			'folderProfileNotice.dismiss',
			localize('folderProfileNotice.dismiss', "Don't Show Again for This Profile"),
			ThemeIcon.asClassName(Codicon.close),
			true,
			async () => this._dismiss(),
		)), { icon: true, label: false });

		// Escape only hides the notice for the session being started. The button handles Escape itself.
		this._register(detailsButton.onDidEscape(() => this._hideForSession()));
		this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				dom.EventHelper.stop(e, true);
				this._hideForSession();
			}
		}));

		this._register(autorun(reader => {
			const value = banner.isShowing.read(reader) ? content.read(reader) : undefined;
			this._content = value;
			if (!value && dom.isAncestorOfActiveElement(this.element)) {
				this._focusInput();
			}
			dom.setVisibility(!!value, this.element);
			if (!value) {
				return;
			}
			const profileIcon = value.setup.profile.icon ? ThemeIcon.fromId(value.setup.profile.icon) : DEFAULT_ICON;
			icon.className = ThemeIcon.asClassName(profileIcon);
			const text = getFolderProfileNoticeMessage(value.folder.name, value.setup);
			message.textContent = text;
			const key = `${this._getKey(value)}\n${text}`;
			if (this._announced !== key) {
				this._announced = key;
				status(text);
			}
		}));
	}

	private _getKey(content: IFolderProfileNoticeContent): string {
		return `${content.sessionId}\n${content.setup.profile.id}\n${this._uriIdentityService.extUri.getComparisonKey(content.folder.root)}`;
	}

	private _getDismissedProfiles(): ReadonlySet<string> {
		try {
			const value = JSON.parse(this._storageService.get(FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY, StorageScope.PROFILE, '[]'));
			return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
		} catch {
			return new Set();
		}
	}

	private _dismiss(): void {
		const content = this._content;
		if (!content) {
			return;
		}
		const dismissed = new Set(this._getDismissedProfiles()).add(content.setup.profile.id);
		this._storageService.store(FOLDER_PROFILE_NOTICE_DISMISSED_STORAGE_KEY, JSON.stringify([...dismissed]), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _hideForSession(): void {
		const content = this._content;
		if (content) {
			this._hiddenForSession.set(new Set(this._hiddenForSession.get()).add(this._getKey(content)), undefined);
		}
	}

	private async _showDetails(): Promise<void> {
		const content = this._content;
		if (!content) {
			return;
		}
		const { setup } = content;
		const picks: (IFolderProfileDetailsItem | IQuickPickSeparator)[] = [];
		if (setup.extensions.length > 0) {
			picks.push({ type: 'separator', label: localize('folderProfileNotice.details.extensions', "Extensions") });
			for (const extension of setup.extensions) {
				picks.push({
					label: extension.displayName,
					description: extension.contributions.join(', '),
					// The Agents window's extensions find it in the Marketplace, where installing it adds it to the Agents window.
					run: () => this._commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, { section: AICustomizationManagementSection.Extensions, searchQuery: extension.id }),
				});
			}
		}
		if (setup.mcpServers.length > 0) {
			picks.push({ type: 'separator', label: localize('folderProfileNotice.details.mcpServers', "MCP Servers") });
			for (const server of setup.mcpServers) {
				picks.push({ label: server.name, description: basename(server.resource), run: () => this._editorService.openEditor({ resource: server.resource }) });
			}
		}
		const customizationGroups: [FolderProfileCustomizationType, string][] = [
			[PromptsType.agent, localize('folderProfileNotice.details.agents', "Agents")],
			[PromptsType.instructions, localize('folderProfileNotice.details.instructions', "Instructions")],
			[PromptsType.prompt, localize('folderProfileNotice.details.prompts', "Prompts")],
		];
		for (const [type, label] of customizationGroups) {
			const customizations = setup.customizations.filter(customization => customization.type === type);
			if (customizations.length > 0) {
				picks.push({ type: 'separator', label });
				for (const customization of customizations) {
					picks.push({ label: customization.name, description: basename(customization.resource), run: () => this._editorService.openEditor({ resource: customization.resource }) });
				}
			}
		}
		const picked = await this._quickInputService.pick(picks, {
			title: localize('folderProfileNotice.details.title', "Only in Your '{0}' Profile", setup.profile.name),
			placeHolder: localize('folderProfileNotice.details.placeholder', "Select an extension to add it here, or another item to open its file"),
			matchOnDescription: true,
		});
		if (picked) {
			try {
				await picked.run();
			} catch (error) {
				this._logService.error('[FolderProfileNotice] Could not open an item of the folder\'s profile', error);
			}
		}
	}
}
