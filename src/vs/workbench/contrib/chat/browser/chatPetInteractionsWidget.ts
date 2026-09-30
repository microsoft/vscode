/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { defaultCheckboxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CHAT_PET_OPEN_DOCUMENT_COMMAND_ID } from './chatPetDocument.js';
import { ChatPetListItem, ChatPetListPage, IChatPetListRow, IChatPetPageHost, IChatPetPageState, renderChatPetDetailEmpty, renderChatPetDetailHeading, renderChatPetDetailSection, renderChatPetDetailSectionHeading } from './chatPetListPage.js';
import { ChatPetBuiltInTrigger, ChatPetBuiltInTriggerAnimations, ChatPetBuiltInTriggers, describeChatPetBuiltInAnimation, describeChatPetTrigger, getChatPetTriggerPool, getChatPetTriggerSprite, hasChatPetTriggerPool, IChatPetReaction, IChatPetTriggerPoolEntry } from './chatPetReactions.js';
import { IChatPetService } from './chatPetService.js';
import { addChatPetDetailButton, ChatPetPicture, createChatPetReactionDraft, describeChatPetPick, describeChatPetSprite, getChatPetFirstSpriteChoice, getChatPetSpriteChoiceId, getChatPetSpriteChoices, getChatPetSpritePicture, IChatPetChoiceGroup, IChatPetReactionDraft, quoteChatPetPhrases, renderChatPetChoice, renderChatPetReactionForm, renderChatPetUseEntry, saveChatPetReactionDraft, toChatPetPicture, toChatPetReactionDraft } from './chatPetSpriteUi.js';

/** Something that makes the pet play a sprite: one of its own triggers, or a text interaction. */
export type ChatPetInteraction =
	| { readonly kind: 'trigger'; readonly trigger: ChatPetBuiltInTrigger; readonly reaction?: undefined }
	| { readonly kind: 'reaction'; readonly reaction: IChatPetReaction; readonly trigger?: undefined };

export interface IChatPetInteractionRow extends IChatPetListRow {
	/** Undefined for the stand-in row of the Text interactions section while it is empty. */
	readonly interaction: ChatPetInteraction | undefined;
}

const CHAT_PET_TEXT_PLACEHOLDER_ID = 'placeholder:text';

/** The row id of a built-in trigger on the Interactions page. */
export function getChatPetTriggerRowId(trigger: ChatPetBuiltInTrigger): string {
	return `trigger:${trigger}`;
}

/** The row id of a text interaction on the Interactions page. */
export function getChatPetReactionRowId(reactionId: string): string {
	return `reaction:${reactionId}`;
}

function describePoolEntry(entry: IChatPetTriggerPoolEntry): string {
	const label = describeChatPetPick(entry.pick);
	return entry.enabled ? label : localize('chatPet.interactions.poolEntryOff', "{0} (off)", label);
}

/** The rows of the Interactions page: the pet's own triggers, then the text interactions it was taught. */
export function getChatPetInteractionItems(state: IChatPetPageState): ChatPetListItem<IChatPetInteractionRow>[] {
	const triggers = ChatPetBuiltInTriggers.map((trigger): IChatPetInteractionRow => {
		const pool = getChatPetTriggerPool(trigger, state.reactions, state.disabledBuiltIns);
		const shown = pool.find(entry => entry.enabled) ?? pool[0];
		const title = describeChatPetTrigger(trigger).label;
		// A click lists its pool; any other trigger names its one sprite.
		const summary = hasChatPetTriggerPool(trigger)
			? localize('chatPet.interactions.triggerSummary', "Plays {0}", pool.map(describePoolEntry).join(', '))
			: shown.enabled
				? localize('chatPet.interactions.triggerSummary', "Plays {0}", describeChatPetPick(shown.pick))
				: localize('chatPet.interactions.triggerSummaryNothing', "Plays nothing");
		return {
			kind: 'row',
			id: getChatPetTriggerRowId(trigger),
			interaction: { kind: 'trigger', trigger },
			title,
			summary,
			picture: shown.enabled || hasChatPetTriggerPool(trigger) ? toChatPetPicture(shown.pick, state.moves) : undefined,
			off: !pool.some(entry => entry.enabled),
			placeholder: false,
			ariaLabel: localize('chatPet.interactions.rowAriaLabel', "{0}, {1}", title, summary),
		};
	});
	const texts = state.reactions.filter(reaction => reaction.trigger === 'message').map((reaction): IChatPetInteractionRow => {
		const title = quoteChatPetPhrases(reaction.phrases);
		const sprite = describeChatPetSprite(reaction.play);
		const summary = reaction.enabled
			? localize('chatPet.interactions.textSummary', "Plays {0}", sprite)
			: localize('chatPet.interactions.textSummaryOff', "Plays {0} (off)", sprite);
		return {
			kind: 'row',
			id: getChatPetReactionRowId(reaction.id),
			interaction: { kind: 'reaction', reaction },
			title,
			summary,
			picture: getChatPetSpritePicture(reaction.play, state.moves),
			off: !reaction.enabled,
			placeholder: false,
			ariaLabel: localize('chatPet.interactions.rowAriaLabel', "{0}, {1}", title, summary),
		};
	});
	const placeholderTitle = localize('chatPet.interactions.noneText', "No text interactions yet");
	const placeholderSummary = localize('chatPet.interactions.noneTextSummary', "Play a sprite when a message says something");
	return [
		{ kind: 'header', id: 'header:builtIn', label: localize('chatPet.interactions.builtIn', "Built-in"), count: undefined },
		...triggers,
		{ kind: 'header', id: 'header:text', label: localize('chatPet.interactions.text', "Text Interactions"), count: texts.length },
		...(texts.length ? texts : [{ kind: 'row', id: CHAT_PET_TEXT_PLACEHOLDER_ID, interaction: undefined, title: placeholderTitle, summary: placeholderSummary, picture: undefined, off: false, placeholder: true, ariaLabel: `${placeholderTitle}, ${placeholderSummary}` } satisfies IChatPetInteractionRow]),
	];
}

/**
 * The Interactions page of the pet's modal: the events that make the pet play a sprite, and the
 * one place sprites are assigned to them, from those the Sprites page lists. Each built-in event
 * plays the one sprite chosen for it, but for clicks, which play one of a pool at random; text
 * interactions play a sprite when a message says something.
 */
export class ChatPetInteractionsWidget extends ChatPetListPage<IChatPetInteractionRow> {

	/**
	 * A new interaction written in place of the detail, kept across renders until saved or
	 * cancelled: a text interaction from New Text Interaction, or, from Use in an Interaction on
	 * the Sprites page, one with the sprite set and the trigger to choose.
	 */
	private newDraft: { readonly draft: IChatPetReactionDraft; readonly chooseTrigger: boolean } | undefined;
	/** A change to the selected row, kept the same way: a sprite added to the click's pool, or a text interaction changed. */
	private rowDraft: IChatPetReactionDraft | undefined;
	/** Whether Restore Defaults asked for a second click, and the button that takes it. */
	private restoring = false;
	private confirmRestore: Button | undefined;

	constructor(
		parent: HTMLElement,
		host: IChatPetPageHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatPetService chatPetService: IChatPetService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(
			parent,
			'chat-pet-interactions-page-content',
			localize('chatPet.interactions.title', "Interactions"),
			localize('chatPet.interactions.intro', "When the pet plays a sprite, and which. Each built-in event plays the sprite you pick for it; clicks play one of several at random. Text interactions play a sprite when a message you send contains a phrase. Assign sprites here, or ask the agent in chat."),
			localize('chatPet.interactions.listAriaLabel', "Interactions"),
			host,
			instantiationService,
			chatPetService,
			themeService,
			accessibilityService,
		);
	}

	protected override getItems(state: IChatPetPageState): ChatPetListItem<IChatPetInteractionRow>[] {
		return getChatPetInteractionItems(state);
	}

	protected override onDidSelect(): void {
		this.newDraft = undefined;
		this.rowDraft = undefined;
		this.restoring = false;
	}

	/**
	 * Opens the form for a new interaction that plays `play`, its trigger to choose, in place of
	 * the detail: the way the Sprites page assigns a sprite.
	 */
	newInteraction(play: string): void {
		this.openNewForm(createChatPetReactionDraft({ trigger: 'message', play }, play), true);
	}

	private newTextInteraction(): void {
		this.openNewForm(createChatPetReactionDraft({ trigger: 'message' }, getChatPetFirstSpriteChoice(getChatPetSpriteChoices(this.currentState?.moves ?? [])) ?? ''), false);
	}

	private openNewForm(draft: IChatPetReactionDraft, chooseTrigger: boolean): void {
		this.notify(undefined);
		this.rowDraft = undefined;
		this.newDraft = { draft, chooseTrigger };
		this.rerender();
	}

	protected override renderToolbar(store: DisposableStore, state: IChatPetPageState): void {
		this.addToolbarButton(store, localize('chatPet.interactions.newText', "New Text Interaction"), localize('chatPet.interactions.newTextTitle', "Plays a sprite when a message you send contains a phrase"), false, () => this.newTextInteraction());
		this.addToolbarButton(store, localize('chatPet.interactions.editAsText', "Edit as Text"), localize('chatPet.interactions.editAsTextTitle', "Opens pets.md, where taught moves and interactions are written"), true, () => {
			this.notify(undefined);
			void this.commandService.executeCommand(CHAT_PET_OPEN_DOCUMENT_COMMAND_ID);
		});
		// Restoring the built-in events asks for a second click, as forgetting a move does; text interactions are not touched.
		if (this.restoring) {
			this.confirmRestore = this.addToolbarButton(store, localize('chatPet.interactions.restoreConfirm', "Restore Built-in Defaults"), localize('chatPet.interactions.restoreConfirmTitle', "Every built-in event plays the pet's own animation again, and the sprites added to them go; text interactions stay"), false, () => {
				this.restoring = false;
				this.chatPetService.resetBuiltInReactions();
				this.notify(localize('chatPet.interactions.restored', "The built-in events play the pet's own animations again. Text interactions were left as they were."));
			});
			this.addToolbarButton(store, localize('chatPet.interactions.keep', "Keep"), '', true, () => {
				this.restoring = false;
				this.notify(undefined);
				this.rerender();
			});
		} else {
			this.confirmRestore = undefined;
			const restore = this.addToolbarButton(store, localize('chatPet.interactions.restore', "Restore Defaults"), localize('chatPet.interactions.restoreTitle', "Puts the pet's own animation back on every built-in event; text interactions stay"), true, () => {
				this.restoring = true;
				this.notify(localize('chatPet.interactions.restoreAsk', "This puts the pet's own animation back on every built-in event, on, and drops the sprites added to them. Text interactions stay."));
				this.rerender();
				this.confirmRestore?.focus();
			});
			restore.enabled = state.reactions.some(reaction => reaction.trigger !== 'message') || state.disabledBuiltIns.length > 0;
		}
	}

	protected override renderDetailContent(row: IChatPetInteractionRow | undefined, state: IChatPetPageState): void {
		const newDraft = this.newDraft;
		if (newDraft) {
			// A new interaction is written in place of whatever row is selected.
			const showOnStage = this.renderStage(getChatPetSpritePicture(newDraft.draft.play, state.moves), state);
			this.renderForm(this.detailContent, newDraft.draft, state, showOnStage, { slot: 'new', chooseTrigger: newDraft.chooseTrigger });
			return;
		}
		if (!row) {
			return;
		}
		const interaction = row.interaction;
		if (!interaction) {
			this.renderPlaceholderDetail(state);
		} else if (interaction.kind === 'trigger') {
			if (hasChatPetTriggerPool(interaction.trigger)) {
				this.renderPoolDetail(interaction.trigger, state);
			} else {
				this.renderSpriteDetail(interaction.trigger, state);
			}
		} else {
			this.renderReactionDetail(interaction.reaction, state);
		}
	}

	private renderPlaceholderDetail(state: IChatPetPageState): void {
		const content = this.detailContent;
		this.renderStage(undefined, state);
		renderChatPetDetailHeading(content, localize('chatPet.interactions.textIntroTitle', "React to what you say"), undefined);
		DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = localize('chatPet.interactions.textIntroDescription', "A text interaction plays a sprite when a message you send contains one of its phrases. Several interactions on the same phrase take turns at random; one alone always plays.");
		const actions = DOM.append(content, DOM.$('.chat-pet-interaction-actions'));
		this.registerFocusable('new', addChatPetDetailButton(this.detailStore, actions, localize('chatPet.interactions.newText', "New Text Interaction"), '', false, () => this.newTextInteraction()).element);
	}

	/**
	 * The detail of a built-in event that plays one sprite: tiles to pick it from, applied as one
	 * is chosen, with the pet's own animation first and nothing last.
	 */
	private renderSpriteDetail(trigger: ChatPetBuiltInTrigger, state: IChatPetPageState): void {
		const content = this.detailContent;
		const sprite = getChatPetTriggerSprite(trigger, state.reactions, state.disabledBuiltIns);
		const own = ChatPetBuiltInTriggerAnimations[trigger][0];
		const shownSprite = sprite.kind === 'sprite' ? sprite.play : sprite.kind === 'own' ? own : undefined;
		this.renderStage(shownSprite === undefined ? undefined : getChatPetSpritePicture(shownSprite, state.moves), state);
		const { label, description } = describeChatPetTrigger(trigger);
		renderChatPetDetailHeading(content, label, { label: localize('chatPet.interactions.builtInBadge', "Built-in"), custom: false });
		DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = description;
		DOM.append(content, DOM.$('p.chat-pet-interaction-meta')).textContent = localize('chatPet.interactions.singleMeta', "The pet plays one sprite for this, in place of its own.");

		const section = renderChatPetDetailSectionHeading(content, localize('chatPet.interactions.plays', "Plays"));
		section.classList.add('chat-pet-interaction-sprite-field');
		type Choice = { readonly kind: 'own' | 'nothing' } | { readonly kind: 'sprite'; readonly play: string };
		const groups: IChatPetChoiceGroup<Choice>[] = [
			{ label: localize('chatPet.interactions.ownGroup', "Pet's Own"), options: [{ id: 'own', value: { kind: 'own' }, label: describeChatPetBuiltInAnimation(own), detail: localize('chatPet.interactions.ownOption', "The pet's own animation for this, out of the box"), picture: { animation: own } }] },
			...getChatPetSpriteChoices(state.moves, [own]).map((group): IChatPetChoiceGroup<Choice> => ({ label: group.label, options: group.options.map(option => ({ ...option, value: { kind: 'sprite', play: option.value } })) })),
			{ label: localize('chatPet.interactions.offGroup', "Off"), options: [{ id: 'nothing', value: { kind: 'nothing' }, label: localize('chatPet.interactions.nothingOption', "Nothing"), detail: localize('chatPet.interactions.nothingOptionDetail', "The pet shows nothing for this") }] },
		];
		const choice = renderChatPetChoice(this.detailStore, section, {
			ariaLabel: localize('chatPet.interactions.playsAriaLabel', "What plays when {0}", label.toLowerCase()),
			kind: 'tiles',
			variant: state.variant,
			groups,
			selected: sprite.kind === 'sprite' ? getChatPetSpriteChoiceId(sprite.play) : sprite.kind,
			onDidSelect: option => {
				this.chatPetService.setTriggerSprite(trigger, option.value);
				// The tile, the row and the stage show the change; screen readers are told.
				this.announce(option.value.kind === 'nothing'
					? localize('chatPet.interactions.assignedNothing', "The pet shows nothing when {0}.", label.toLowerCase())
					: localize('chatPet.interactions.assigned', "{0} now plays when {1}.", option.label, label.toLowerCase()));
			},
		});
		this.registerFocusable('sprite', choice.root, () => choice.focusSelected());
		const hint = DOM.append(section, DOM.$('p.chat-pet-trigger-field-hint'));
		hint.textContent = localize('chatPet.interactions.form.newSpriteHint', "Sprites are made on the Sprites page.");
		hint.appendChild(DOM.$('span', undefined, ' '));
		this.addDetailLink(hint, localize('chatPet.interactions.makeSprite', "Make a new sprite"), localize('chatPet.interactions.makeSpriteTitle', "Goes to the Sprites page"), () => this.host.showPage('sprites'));

		if (shownSprite !== undefined) {
			const actions = DOM.append(content, DOM.$('.chat-pet-interaction-actions'));
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.interactions.showSprite', "Show Sprite"), localize('chatPet.interactions.openSprite', "Shows it on the Sprites page"), true, () => this.host.showPage('sprites', shownSprite));
		}
	}

	/** The detail of the click, which plays one of a pool at random: each entry with a checkbox, and a form to add a sprite. */
	private renderPoolDetail(trigger: ChatPetBuiltInTrigger, state: IChatPetPageState): void {
		const content = this.detailContent;
		const pool = getChatPetTriggerPool(trigger, state.reactions, state.disabledBuiltIns);
		const shown = pool.find(entry => entry.enabled) ?? pool[0];
		const showOnStage = this.renderStage(shown ? toChatPetPicture(shown.pick, state.moves) : undefined, state);
		const { label, description } = describeChatPetTrigger(trigger);
		renderChatPetDetailHeading(content, label, { label: localize('chatPet.interactions.builtInBadge', "Built-in"), custom: false });
		DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = description;
		DOM.append(content, DOM.$('p.chat-pet-interaction-meta')).textContent = localize('chatPet.interactions.poolMeta', "One of the sprites that are on plays, at random. Turn any off, or add a sprite.");

		const { section, list } = renderChatPetDetailSection(content, localize('chatPet.interactions.plays', "Plays"));
		if (!pool.some(entry => entry.enabled)) {
			renderChatPetDetailEmpty(section, localize('chatPet.interactions.poolAllOff', "Everything is off: the pet does nothing for this."));
		}
		const taken: string[] = [];
		for (const entry of pool) {
			const pick = entry.pick;
			const spriteName = pick.animation ?? pick.move;
			taken.push(spriteName);
			const spriteLabel = describeChatPetPick(pick);
			const { label: labelContainer, checkbox } = renderChatPetUseEntry(this.detailStore, list, {
				picture: toChatPetPicture(pick, state.moves),
				variant: state.variant,
				enabled: entry.enabled,
				toggle: {
					title: localize('chatPet.interactions.togglePoolEntry', "Play {0} when {1}", spriteLabel, label.toLowerCase()),
					onToggle: enabled => {
						if (pick.animation) {
							this.chatPetService.setBuiltInReactionEnabled(trigger, pick.animation, enabled);
						} else {
							this.chatPetService.setReactionEnabled(pick.reactionId, enabled);
						}
					},
				},
				action: pick.animation ? undefined : {
					label: localize('chatPet.interactions.removeFromPool', "Remove"),
					title: localize('chatPet.interactions.removeFromPoolTitle', "The pet stops playing this sprite for it; the sprite stays"),
					onClick: () => {
						const reaction = state.reactions.find(candidate => candidate.id === pick.reactionId);
						if (reaction) {
							this.remove(reaction);
						}
					},
				},
			});
			if (checkbox) {
				this.registerFocusable(`pool:${spriteName}`, checkbox.domNode);
			}
			this.addDetailLink(labelContainer, spriteLabel, localize('chatPet.interactions.openSprite', "Shows it on the Sprites page"), () => this.host.showPage('sprites', spriteName));
			if (pick.animation) {
				DOM.append(labelContainer, DOM.$('span.chat-pet-interaction-pool-detail')).textContent = localize('chatPet.interactions.ownAnimation', "The pet's own");
			}
		}
		const draft = this.rowDraft;
		if (draft) {
			this.renderForm(section, draft, state, showOnStage, { slot: 'row', chooseTrigger: false }, taken);
		} else {
			const available = getChatPetFirstSpriteChoice(getChatPetSpriteChoices(state.moves, taken));
			const add = addChatPetDetailButton(this.detailStore, section, localize('chatPet.interactions.addSprite', "Add Sprite…"), localize('chatPet.interactions.addSpriteTitle', "Adds one of the sprites to what plays for this"), false, () => {
				this.rowDraft = createChatPetReactionDraft({ trigger }, available ?? '');
				this.rerender();
			});
			add.enabled = available !== undefined;
			this.registerFocusable('add', add.element);
		}
	}

	private renderReactionDetail(reaction: IChatPetReaction, state: IChatPetPageState): void {
		const content = this.detailContent;
		const draft = this.rowDraft;
		const showOnStage = this.renderStage(getChatPetSpritePicture(draft?.play ?? reaction.play, state.moves), state);
		if (draft) {
			this.renderForm(content, draft, state, showOnStage, { slot: 'row', chooseTrigger: false });
			return;
		}
		renderChatPetDetailHeading(content, quoteChatPetPhrases(reaction.phrases), { label: localize('chatPet.interactions.textBadge', "Text"), custom: true });
		DOM.append(content, DOM.$('p.chat-pet-interaction-meta')).textContent = localize('chatPet.interactions.playsSprite', "Plays {0} when a message you send contains one of the phrases.", describeChatPetSprite(reaction.play));
		if (reaction.when) {
			DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = localize('chatPet.interactions.when', "Taught for: {0}", reaction.when);
		}

		const toggleRow = DOM.append(content, DOM.$('.chat-pet-interaction-enabled'));
		const checkbox = this.detailStore.add(new Checkbox(localize('chatPet.interactions.enabledTitle', "Whether the pet plays this"), reaction.enabled, defaultCheckboxStyles));
		toggleRow.appendChild(checkbox.domNode);
		this.registerFocusable('enabled', checkbox.domNode);
		this.detailStore.add(checkbox.onChange(() => this.chatPetService.setReactionEnabled(reaction.id, checkbox.checked)));
		DOM.append(toggleRow, DOM.$('span')).textContent = reaction.enabled
			? localize('chatPet.interactions.enabled', "On")
			: localize('chatPet.interactions.disabled', "Off: the pet keeps this, but doesn't play it");

		const actions = DOM.append(content, DOM.$('.chat-pet-interaction-actions'));
		this.registerFocusable('change', addChatPetDetailButton(this.detailStore, actions, localize('chatPet.interactions.change', "Change…"), localize('chatPet.interactions.changeTitle', "Changes the phrases or the sprite"), false, () => {
			this.rowDraft = toChatPetReactionDraft(reaction);
			this.rerender();
		}).element);
		addChatPetDetailButton(this.detailStore, actions, localize('chatPet.interactions.showSprite', "Show Sprite"), localize('chatPet.interactions.openSprite', "Shows it on the Sprites page"), true, () => this.host.showPage('sprites', reaction.play));
		addChatPetDetailButton(this.detailStore, actions, localize('chatPet.interactions.remove', "Remove"), localize('chatPet.interactions.removeTitle', "The pet stops reacting to these phrases; the sprite stays"), true, () => this.remove(reaction));
	}

	/**
	 * Renders `draft`'s form. `slot` says where the draft is kept: written in place of the detail,
	 * or as a change to the selected row, such as a sprite added to the click's pool.
	 */
	private renderForm(container: HTMLElement, draft: IChatPetReactionDraft, state: IChatPetPageState, showOnStage: (picture: ChatPetPicture | undefined) => void, options: { readonly slot: 'new' | 'row'; readonly chooseTrigger: boolean }, excludePlays?: readonly string[]): void {
		const setDraft = (value: IChatPetReactionDraft | undefined) => {
			if (options.slot === 'new') {
				this.newDraft = value === undefined ? undefined : { draft: value, chooseTrigger: options.chooseTrigger };
			} else {
				this.rowDraft = value;
			}
		};
		const { fail } = renderChatPetReactionForm(this.detailStore, container, {
			draft,
			moves: state.moves,
			variant: state.variant,
			chooseTrigger: options.chooseTrigger,
			excludePlays,
			onDidChangePlay: play => showOnStage(getChatPetSpritePicture(play, state.moves)),
			reveal: element => this.revealInDetail(element),
			renderNewSpriteLink: hint => this.addDetailLink(hint, localize('chatPet.interactions.makeSprite', "Make a new sprite"), localize('chatPet.interactions.makeSpriteTitle', "Goes to the Sprites page"), () => this.host.showPage('sprites')),
			onSave: () => {
				// The draft is let go before the store changes, so the render that follows shows the result, not the form.
				setDraft(undefined);
				const result = saveChatPetReactionDraft(draft, this.chatPetService);
				if (result.error !== undefined) {
					setDraft(draft);
					fail(result.error);
					return;
				}
				// The row the interaction landed in shows: a text interaction's own, or its trigger's.
				if (draft.trigger === 'message') {
					this.select(getChatPetReactionRowId(result.id));
				} else {
					this.select(getChatPetTriggerRowId(draft.trigger));
					this.announce(localize('chatPet.interactions.assigned', "{0} now plays when {1}.", describeChatPetSprite(draft.play), describeChatPetTrigger(draft.trigger).label.toLowerCase()));
				}
			},
			onCancel: () => {
				setDraft(undefined);
				this.rerender();
			},
			onRemove: draft.reactionId === undefined ? undefined : () => {
				const reaction = state.reactions.find(candidate => candidate.id === draft.reactionId);
				setDraft(undefined);
				if (reaction) {
					this.remove(reaction);
				}
			},
		});
	}

	private remove(reaction: IChatPetReaction): void {
		if (this.chatPetService.removeReaction(reaction.id)) {
			this.announce(reaction.trigger === 'message'
				? localize('chatPet.interactions.removed', "The pet no longer reacts to {0}.", quoteChatPetPhrases(reaction.phrases))
				: localize('chatPet.interactions.removedFromPool', "{0} no longer plays when {1}.", describeChatPetSprite(reaction.play), describeChatPetTrigger(reaction.trigger).label.toLowerCase()));
		}
	}
}
