/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { coalesce, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Event } from '../../../../base/common/event.js';
import { createCommandUri, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { localize, localize2 } from '../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import * as extensionsRegistry from '../../../services/extensions/common/extensionsRegistry.js';
import { showExtensionsWithIdsCommandId } from '../../extensions/browser/extensionsActions.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { ChatViewId, ChatViewContainerId } from './chat.js';
import { ChatViewPane } from './widgetHosts/viewPane/chatViewPane.js';
// --- Chat Container &  View Registration
const chatViewIcon = registerIcon('chat-view-icon', Codicon.chatSparkle, localize('chatViewIcon', 'View icon of the chat view.'));
const chatViewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: ChatViewContainerId,
    title: localize2('chat.viewContainer.label', "Chat"),
    icon: chatViewIcon,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [ChatViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: ChatViewContainerId,
    hideIfEmpty: true,
    order: 1,
}, 2 /* ViewContainerLocation.AuxiliaryBar */, { isDefault: true, doNotRegisterOpenCommand: true });
const chatViewDescriptor = {
    id: ChatViewId,
    containerIcon: chatViewContainer.icon,
    containerTitle: chatViewContainer.title.value,
    singleViewPaneContainerTitle: chatViewContainer.title.value,
    name: localize2('chat.viewContainer.label', "Chat"),
    canToggleVisibility: false,
    canMoveView: true,
    openCommandActionDescriptor: {
        id: ChatViewContainerId,
        title: chatViewContainer.title,
        mnemonicTitle: localize({ key: 'miToggleChat', comment: ['&& denotes a mnemonic'] }, "&&Chat"),
        keybindings: {
            primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 39 /* KeyCode.KeyI */,
            mac: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 39 /* KeyCode.KeyI */
            }
        },
        order: 1
    },
    ctorDescriptor: new SyncDescriptor(ChatViewPane),
    when: ContextKeyExpr.or(ContextKeyExpr.or(ChatContextKeys.Setup.hidden, ChatContextKeys.Setup.disabled)?.negate(), ChatContextKeys.panelParticipantRegistered, ChatContextKeys.extensionInvalid)
};
Registry.as(ViewExtensions.ViewsRegistry).registerViews([chatViewDescriptor], chatViewContainer);
const chatParticipantExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'chatParticipants',
    jsonSchema: {
        description: localize('vscode.extension.contributes.chatParticipant', 'Contributes a chat participant'),
        type: 'array',
        items: {
            additionalProperties: false,
            type: 'object',
            defaultSnippets: [{ body: { name: '', description: '' } }],
            required: ['name', 'id'],
            properties: {
                id: {
                    description: localize('chatParticipantId', "A unique id for this chat participant."),
                    type: 'string'
                },
                name: {
                    description: localize('chatParticipantName', "User-facing name for this chat participant. The user will use '@' with this name to invoke the participant. Name must not contain whitespace."),
                    type: 'string',
                    pattern: '^[\\w-]+$'
                },
                fullName: {
                    markdownDescription: localize('chatParticipantFullName', "The full name of this chat participant, which is shown as the label for responses coming from this participant. If not provided, {0} is used.", '`name`'),
                    type: 'string'
                },
                description: {
                    description: localize('chatParticipantDescription', "A description of this chat participant, shown in the UI."),
                    type: 'string'
                },
                isSticky: {
                    description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
                    type: 'boolean'
                },
                sampleRequest: {
                    description: localize('chatSampleRequest', "When the user clicks this participant in `/help`, this text will be submitted to the participant."),
                    type: 'string'
                },
                when: {
                    description: localize('chatParticipantWhen', "A condition which must be true to enable this participant."),
                    type: 'string'
                },
                disambiguation: {
                    description: localize('chatParticipantDisambiguation', "Metadata to help with automatically routing user questions to this chat participant."),
                    type: 'array',
                    items: {
                        additionalProperties: false,
                        type: 'object',
                        defaultSnippets: [{ body: { category: '', description: '', examples: [] } }],
                        required: ['category', 'description', 'examples'],
                        properties: {
                            category: {
                                markdownDescription: localize('chatParticipantDisambiguationCategory', "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                                type: 'string'
                            },
                            description: {
                                description: localize('chatParticipantDisambiguationDescription', "A detailed description of the kinds of questions that are suitable for this chat participant."),
                                type: 'string'
                            },
                            examples: {
                                description: localize('chatParticipantDisambiguationExamples', "A list of representative example questions that are suitable for this chat participant."),
                                type: 'array'
                            },
                        }
                    }
                },
                commands: {
                    markdownDescription: localize('chatCommandsDescription', "Commands available for this chat participant, which the user can invoke with a `/`."),
                    type: 'array',
                    items: {
                        additionalProperties: false,
                        type: 'object',
                        defaultSnippets: [{ body: { name: '', description: '' } }],
                        required: ['name'],
                        properties: {
                            name: {
                                description: localize('chatCommand', "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                                type: 'string'
                            },
                            description: {
                                description: localize('chatCommandDescription', "A description of this command."),
                                type: 'string'
                            },
                            when: {
                                description: localize('chatCommandWhen', "A condition which must be true to enable this command."),
                                type: 'string'
                            },
                            sampleRequest: {
                                description: localize('chatCommandSampleRequest', "When the user clicks this command in `/help`, this text will be submitted to the participant."),
                                type: 'string'
                            },
                            isSticky: {
                                description: localize('chatCommandSticky', "Whether invoking the command puts the chat into a persistent mode, where the command is automatically added to the chat input for the next message."),
                                type: 'boolean'
                            },
                            disambiguation: {
                                description: localize('chatCommandDisambiguation', "Metadata to help with automatically routing user questions to this chat command."),
                                type: 'array',
                                items: {
                                    additionalProperties: false,
                                    type: 'object',
                                    defaultSnippets: [{ body: { category: '', description: '', examples: [] } }],
                                    required: ['category', 'description', 'examples'],
                                    properties: {
                                        category: {
                                            markdownDescription: localize('chatCommandDisambiguationCategory', "A detailed name for this category, e.g. `workspace_questions` or `web_questions`."),
                                            type: 'string'
                                        },
                                        description: {
                                            description: localize('chatCommandDisambiguationDescription', "A detailed description of the kinds of questions that are suitable for this chat command."),
                                            type: 'string'
                                        },
                                        examples: {
                                            description: localize('chatCommandDisambiguationExamples', "A list of representative example questions that are suitable for this chat command."),
                                            type: 'array'
                                        },
                                    }
                                }
                            }
                        }
                    }
                },
            }
        }
    },
    activationEventsGenerator: function* (contributions) {
        for (const contrib of contributions) {
            yield `onChatParticipant:${contrib.id}`;
        }
    },
});
let ChatExtensionPointHandler = class ChatExtensionPointHandler {
    static { this.ID = 'workbench.contrib.chatExtensionPointHandler'; }
    constructor(_chatAgentService) {
        this._chatAgentService = _chatAgentService;
        this._participantRegistrationDisposables = new DisposableMap();
        this.handleAndRegisterChatExtensions();
    }
    handleAndRegisterChatExtensions() {
        chatParticipantExtensionPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                for (const providerDescriptor of extension.value) {
                    if (!providerDescriptor.name?.match(/^[\w-]+$/)) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with invalid name: ${providerDescriptor.name}. Name must match /^[\\w-]+$/.`);
                        continue;
                    }
                    if (providerDescriptor.fullName && strings.AmbiguousCharacters.getInstance(new Set()).containsAmbiguousCharacter(providerDescriptor.fullName)) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains ambiguous characters: ${providerDescriptor.fullName}.`);
                        continue;
                    }
                    // Spaces are allowed but considered "invisible"
                    if (providerDescriptor.fullName && strings.InvisibleCharacters.containsInvisibleCharacter(providerDescriptor.fullName.replace(/ /g, ''))) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant with fullName that contains invisible characters: ${providerDescriptor.fullName}.`);
                        continue;
                    }
                    if ((providerDescriptor.isDefault || providerDescriptor.modes) && !isProposedApiEnabled(extension.description, 'defaultChatParticipant')) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: defaultChatParticipant.`);
                        continue;
                    }
                    if (providerDescriptor.locations && !isProposedApiEnabled(extension.description, 'chatParticipantAdditions')) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use API proposal: chatParticipantAdditions.`);
                        continue;
                    }
                    if (!providerDescriptor.id || !providerDescriptor.name) {
                        extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register participant without both id and name.`);
                        continue;
                    }
                    const participantsDisambiguation = [];
                    if (providerDescriptor.disambiguation?.length) {
                        participantsDisambiguation.push(...providerDescriptor.disambiguation.map((d) => ({
                            ...d, category: d.category ?? d.categoryName
                        })));
                    }
                    try {
                        const store = new DisposableStore();
                        store.add(this._chatAgentService.registerAgent(providerDescriptor.id, {
                            extensionId: extension.description.identifier,
                            extensionVersion: extension.description.version,
                            publisherDisplayName: extension.description.publisherDisplayName ?? extension.description.publisher, // May not be present in OSS
                            extensionPublisherId: extension.description.publisher,
                            extensionDisplayName: extension.description.displayName ?? extension.description.name,
                            id: providerDescriptor.id,
                            description: providerDescriptor.description,
                            when: providerDescriptor.when,
                            metadata: {
                                isSticky: providerDescriptor.isSticky,
                                sampleRequest: providerDescriptor.sampleRequest,
                            },
                            name: providerDescriptor.name,
                            fullName: providerDescriptor.fullName,
                            isDefault: providerDescriptor.isDefault,
                            locations: isNonEmptyArray(providerDescriptor.locations) ?
                                providerDescriptor.locations.map(ChatAgentLocation.fromRaw) :
                                [ChatAgentLocation.Chat],
                            modes: providerDescriptor.isDefault ? (providerDescriptor.modes ?? [ChatModeKind.Ask]) : [ChatModeKind.Agent, ChatModeKind.Ask, ChatModeKind.Edit],
                            slashCommands: providerDescriptor.commands ?? [],
                            disambiguation: coalesce(participantsDisambiguation.flat()),
                        }));
                        this._participantRegistrationDisposables.set(getParticipantKey(extension.description.identifier, providerDescriptor.id), store);
                    }
                    catch (e) {
                        extension.collector.error(`Failed to register participant ${providerDescriptor.id}: ${toErrorMessage(e, true)}`);
                    }
                }
            }
            for (const extension of delta.removed) {
                for (const providerDescriptor of extension.value) {
                    this._participantRegistrationDisposables.deleteAndDispose(getParticipantKey(extension.description.identifier, providerDescriptor.id));
                }
            }
        });
    }
};
ChatExtensionPointHandler = __decorate([
    __param(0, IChatAgentService)
], ChatExtensionPointHandler);
export { ChatExtensionPointHandler };
function getParticipantKey(extensionId, participantName) {
    return `${extensionId.value}_${participantName}`;
}
let ChatCompatibilityNotifier = class ChatCompatibilityNotifier extends Disposable {
    static { this.ID = 'workbench.contrib.chatCompatNotifier'; }
    constructor(extensionsWorkbenchService, contextKeyService, productService) {
        super();
        this.productService = productService;
        this.registeredWelcomeView = false;
        // It may be better to have some generic UI for this, for any extension that is incompatible,
        // but this is only enabled for Chat now and it needs to be obvious.
        const isInvalid = ChatContextKeys.extensionInvalid.bindTo(contextKeyService);
        this._register(Event.runAndSubscribe(extensionsWorkbenchService.onDidChangeExtensionsNotification, () => {
            const notification = extensionsWorkbenchService.getExtensionsNotification();
            const chatExtension = notification?.extensions.find(ext => ExtensionIdentifier.equals(ext.identifier.id, this.productService.defaultChatAgent?.chatExtensionId));
            if (chatExtension) {
                isInvalid.set(true);
                this.registerWelcomeView(chatExtension);
            }
            else {
                isInvalid.set(false);
            }
        }));
    }
    registerWelcomeView(chatExtension) {
        if (this.registeredWelcomeView) {
            return;
        }
        this.registeredWelcomeView = true;
        const showExtensionLabel = localize('showExtension', "Show Extension");
        const mainMessage = localize('chatFailErrorMessage', "Chat failed to load because the installed version of the Copilot Chat extension is not compatible with this version of {0}. Please ensure that the Copilot Chat extension is up to date.", this.productService.nameLong);
        const commandButton = `[${showExtensionLabel}](${createCommandUri(showExtensionsWithIdsCommandId, [this.productService.defaultChatAgent?.chatExtensionId])})`;
        const versionMessage = `Copilot Chat version: ${chatExtension.version}`;
        const viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
        this._register(viewsRegistry.registerViewWelcomeContent(ChatViewId, {
            content: [mainMessage, commandButton, versionMessage].join('\n\n'),
            when: ChatContextKeys.extensionInvalid,
        }));
    }
};
ChatCompatibilityNotifier = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IContextKeyService),
    __param(2, IProductService)
], ChatCompatibilityNotifier);
export { ChatCompatibilityNotifier };
class ChatParticipantDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.chatParticipants;
    }
    render(manifest) {
        const nonDefaultContributions = manifest.contributes?.chatParticipants?.filter(c => !c.isDefault) ?? [];
        if (!nonDefaultContributions.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('participantName', "Name"),
            localize('participantFullName', "Full Name"),
            localize('participantDescription', "Description"),
            localize('participantCommands', "Commands"),
        ];
        const rows = nonDefaultContributions.map(d => {
            return [
                '@' + d.name,
                d.fullName,
                d.description ?? '-',
                d.commands?.length ? new MarkdownString(d.commands.map(c => `- /` + c.name).join('\n')) : '-'
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'chatParticipants',
    label: localize('chatParticipants', "Chat Participants"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ChatParticipantDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBhcnRpY2lwYW50LmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0UGFydGljaXBhbnQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xHLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFzQixNQUFNLHNEQUFzRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztB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