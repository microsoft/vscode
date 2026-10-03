/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isStringArray } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolData, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultDataPart, ToolDataSource, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../chat.js';
import { getChatPetBuiltInMoveNames, getChatPetBuiltInMoves } from '../chatPetBuiltInMoves.js';
import { ChatPetMoveEyes, ChatPetMoveRamps } from '../chatPetMoveLayers.js';
import { ChatPetMovePoses, getChatPetMoveDuration, getChatPetMoveStillIndex, IChatPetMove, toChatPetMoveName } from '../chatPetMoves.js';
import { ChatPetContextKeys, ChatPetVariant, IChatPetService } from '../chatPetService.js';
import { describeChatPetMove, describeChatPetReaction, getChatPetMoveGuide, getChatPetMovesGuide, IChatPetLesson, validateChatPetLesson } from '../chatPetTeaching.js';
import { renderChatPetMovePreview } from '../widget/chatPetMoveSprites.js';
import { IChatPetWidgetService } from '../widget/chatPetWidgetService.js';

const ChatPetGuideToolId = 'vscode_petGuide';
const ChatPetTeachToolId = 'vscode_teachPet';

/** Agents can teach the pet only while it is shown, so the tools cost nothing for everyone else. */
const chatPetToolsWhen = ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled);

export const ChatPetGuideToolData: IToolData = {
	id: ChatPetGuideToolId,
	toolReferenceName: 'petGuide',
	canBeReferencedInPrompt: false,
	icon: ThemeIcon.fromId(Codicon.book.id),
	displayName: localize('tool.petGuide.displayName', "VS Code Pet Guide"),
	userDescription: localize('tool.petGuide.userDescription', "Read how to draw moves for the VS Code pet, and what it already knows."),
	modelDescription: 'Get the guide for teaching the VS Code pet, the pixel-art robot that sits on the chat input: how to draw moves in layers on its real poses, the craft of its own art, the examples it can study with a picture of them, how reactions match, and the moves and reactions it knows now. Call this before teachPet whenever the user types /pet or asks to create or change a pet move or reaction, for example "teach the pet a YES SIR salute" or "make it slower"; to play or forget a move, call teachPet directly instead. Not for animations, pets or characters in the user\'s own project or web pages. Call it first without arguments; then, before drawing, call it with "examples" naming the one or two built-in moves closest to the request to study them, or with "moves" naming a move to change it.',
	source: ToolDataSource.Internal,
	when: chatPetToolsWhen,
	inputSchema: {
		type: 'object',
		properties: {
			examples: {
				type: 'array',
				items: { type: 'string', enum: getChatPetBuiltInMoveNames() },
				description: 'One or two built-in moves to study whole instead of the guide, with a picture of every frame. The guide says what each one shows.',
			},
			moves: {
				type: 'array',
				items: { type: 'string' },
				description: 'Moves to get whole instead of the guide, to change them, with a picture of every frame.',
			},
		},
	},
};

const chatPetPositionSchema = {
	x: { type: 'integer', description: 'The left pixel: the body spans x 0 to 11.' },
	y: { type: 'integer', description: 'The top pixel: the body spans y 0 to 11, and negative y is above it.' },
} satisfies Record<string, IJSONSchema>;

const chatPetMoveSchema: IJSONSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', description: 'Lowercase letters, digits and dashes, from what the user calls the move: "YES SIR" becomes "yes-sir".' },
		about: { type: 'string', description: 'What the move shows, in one sentence.' },
		loop: { type: 'boolean', description: 'Whether the move repeats for a few seconds. Defaults to true; reactions usually play once.' },
		still: { type: 'number', description: 'The 1-based frame shown to users who prefer reduced motion.' },
		colors: { type: 'object', additionalProperties: { type: 'string' }, description: 'Prop letter or digit to "#rrggbb" color.' },
		fixed: { type: 'string', description: 'Letters in rows that keep their orientation when the pet faces left, such as hand-drawn text. Text layers keep theirs anyway.' },
		props: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } }, description: 'Pictures drawn once, by name: rows with one character per pixel, "." for transparent.' },
		frames: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					ms: { type: 'number', description: 'How long the frame shows.' },
					pose: { type: 'string', enum: Object.keys(ChatPetMovePoses), description: 'The pose of the pet\'s body.' },
					eyes: { type: 'string', enum: Object.keys(ChatPetMoveEyes), description: 'The expression. Defaults to open.' },
					antennae: { type: 'boolean', description: 'false takes the antennae off, for headwear.' },
					recolor: { type: 'object', additionalProperties: { type: 'string' }, description: 'Body letters (C, A, B, E) drawn as other letters in this frame.' },
					place: {
						type: 'array',
						items: { type: 'object', properties: { prop: { type: 'string' }, ...chatPetPositionSchema }, required: ['prop', 'x', 'y'] },
						description: 'Props on this frame, by their top-left pixel; each covers the ones before it.',
					},
					text: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								text: { type: 'string' },
								...chatPetPositionSchema,
								color: { type: 'string', enum: Object.keys(ChatPetMoveRamps), description: 'Defaults to gold.' },
								size: { type: 'string', enum: ['big', 'small'], description: 'Defaults to big.' },
							},
							required: ['text', 'x', 'y'],
						},
						description: 'Words on this frame, in a shaded pixel font, by their top-left pixel.',
					},
					rows: { type: 'array', items: { type: 'string' }, description: 'The body of the frame drawn yourself, instead of a pose.' },
				},
				required: ['ms'],
			},
		},
	},
	required: ['name', 'frames'],
};

export const ChatPetTeachToolData: IToolData = {
	id: ChatPetTeachToolId,
	toolReferenceName: 'teachPet',
	canBeReferencedInPrompt: false,
	icon: ThemeIcon.fromId(Codicon.sparkle.id),
	displayName: localize('tool.teachPet.displayName', "Teach the VS Code Pet"),
	userDescription: localize('tool.teachPet.userDescription', "Teach the VS Code pet new moves and reactions to your messages."),
	modelDescription: 'Teach the VS Code pet, the pixel-art robot on the chat input, new or changed moves, or reactions that play a move when a message the user sends contains a phrase; or make it forget or play one. Use it when the user types /pet or asks to create, change, play or forget a pet move, or to make the pet react to their messages, for example "whenever I say do it, play YES SIR". Not for animations, pets or characters in the user\'s own project or web pages. To play or forget a move the pet knows, call it right away with "play" or "forgetMoves" and the user\'s words, without petGuide: an unknown name comes back with the moves the pet knows. To create or change moves or reactions, call petGuide first. Check new and changed moves with "preview": true, which returns a picture of every frame and saves nothing, then call teachPet again without it to save them: the newest move plays right away. Moves and reactions are saved for the user across windows. If the lesson has mistakes, nothing is saved and the result lists them: fix them and call teachPet again with the whole corrected lesson.',
	source: ToolDataSource.Internal,
	when: chatPetToolsWhen,
	inputSchema: {
		type: 'object',
		properties: {
			moves: { type: 'array', items: chatPetMoveSchema, description: 'Moves to teach. A move with the name of a taught move replaces it.' },
			pastedMoves: { type: 'array', items: { type: 'string' }, description: 'Moves the user pasted in the text format, taught as they are.' },
			reactions: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						when: { type: 'string', description: 'The situation, in the user\'s words.' },
						phrases: { type: 'array', items: { type: 'string' }, description: 'Short phrases the user would type in that situation.' },
						play: { type: 'string', description: 'A move name or a built-in reaction.' },
						chance: { type: 'number', description: 'From 0.01 to 1. Defaults to 1.' },
					},
					required: ['phrases', 'play'],
				},
			},
			forgetMoves: { type: 'array', items: { type: 'string' }, description: 'Names of taught moves to forget, with the reactions that play them.' },
			forgetReactions: { type: 'array', items: { type: 'string' }, description: 'Ids of reactions to forget, from petGuide.' },
			play: { type: 'string', description: 'A move or built-in reaction to play now.' },
			preview: { type: 'boolean', description: 'Only check the lesson and return a picture of every frame of its moves on a dark and a light theme. Nothing is saved or played.' },
		},
	},
};

export class ChatPetGuideTool implements IToolImpl {

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		return getChatPetGuideRequest(context.parameters).length ? {
			invocationMessage: localize('tool.petGuide.movesInvocation', "Studying the pet's moves"),
			pastTenseMessage: localize('tool.petGuide.movesPast', "Studied the pet's moves"),
		} : {
			invocationMessage: localize('tool.petGuide.invocation', "Reading the pet's move guide"),
			pastTenseMessage: localize('tool.petGuide.past', "Read the pet's move guide"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		const variant = this.chatPetService.variant.get();
		const names = getChatPetGuideRequest(invocation.parameters);
		if (names.length) {
			const guide = getChatPetMovesGuide(this.chatPetService.moves.get(), names);
			return { content: [{ kind: 'text', value: guide.text }, ...guide.moves.flatMap(move => toChatPetPictureParts(renderChatPetMoveFrames(move, variant)))] };
		}
		const stills = getChatPetBuiltInMoves().map(move => ({ label: move.name, move, frameIndex: getChatPetMoveStillIndex(move) }));
		return {
			content: [
				{ kind: 'text', value: getChatPetMoveGuide(this.chatPetService.moves.get(), this.chatPetService.reactions.get()) },
				...toChatPetPictureParts(renderChatPetMovePreview(stills, variant)),
			],
		};
	}
}

/** The moves an agent asked petGuide for, to study or change, which it gets whole instead of the guide. */
function getChatPetGuideRequest(parameters: Record<string, unknown> | undefined): string[] {
	return [parameters?.examples, parameters?.moves].flatMap(names => isStringArray(names) ? names : []);
}

/** The move a teachPet call only plays, if it teaches nothing, so the chat says what plays. */
function getChatPetPlayOnly(parameters: Record<string, unknown>): string | undefined {
	const teaches = ['moves', 'pastedMoves', 'reactions', 'forgetMoves', 'forgetReactions'].some(field => {
		const value = parameters[field];
		return Array.isArray(value) && value.length > 0;
	});
	return typeof parameters.play === 'string' && !teaches ? toChatPetMoveName(parameters.play) : undefined;
}

/** Every frame of a move, labeled with its number and duration, and the frame for reduced motion marked "still". */
function renderChatPetMoveFrames(move: IChatPetMove, variant: ChatPetVariant): VSBuffer | undefined {
	const still = getChatPetMoveStillIndex(move);
	return renderChatPetMovePreview(move.frames.map((frame, index) => ({ label: `${index + 1} · ${frame.durationMs} ms${index === still ? ' · still' : ''}`, move, frameIndex: index })), variant);
}

function toChatPetPictureParts(picture: VSBuffer | undefined): IToolResultDataPart[] {
	return picture ? [{ kind: 'data', value: { mimeType: 'image/png', data: picture } }] : [];
}

export class ChatPetTeachTool implements IToolImpl {

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IChatPetWidgetService private readonly chatPetWidgetService: IChatPetWidgetService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) { }

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation> {
		const parameters: Record<string, unknown> = context.parameters ?? {};
		if (parameters.preview === true) {
			return {
				invocationMessage: localize('tool.teachPet.previewInvocation', "Previewing the pet's moves"),
				pastTenseMessage: localize('tool.teachPet.previewPast', "Previewed the pet's moves"),
			};
		}
		const play = getChatPetPlayOnly(parameters);
		if (play) {
			return {
				invocationMessage: localize('tool.teachPet.playInvocation', "Playing {0}", play),
				pastTenseMessage: localize('tool.teachPet.playPast', "Played {0}", play),
			};
		}
		return {
			invocationMessage: localize('tool.teachPet.invocation', "Teaching the pet"),
			pastTenseMessage: localize('tool.teachPet.past', "Taught the pet"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, _token: CancellationToken): Promise<IToolResult> {
		if (!this.chatPetService.enabled.get()) {
			return {
				...createToolSimpleTextResult('The VS Code pet is hidden, so nothing was saved. Ask the user to show it with /vscode-pet, then try again.'),
				toolResultMessage: localize('tool.teachPet.hidden', "The pet is hidden"),
			};
		}
		const result = validateChatPetLesson(invocation.parameters, this.chatPetService.moves.get().map(move => move.name), this.chatPetService.reactions.get());
		if (!result.valid) {
			return {
				...createToolSimpleTextResult(['Nothing was saved. Fix these mistakes and call teachPet again with the whole corrected lesson:', ...result.errors.map(error => `- ${error}`)].join('\n')),
				toolResultMessage: getChatPetPlayOnly(invocation.parameters)
					? localize('tool.teachPet.unknownPlay', "The pet doesn't know that move")
					: localize('tool.teachPet.invalid', "The pet couldn't learn that yet"),
			};
		}
		if (invocation.parameters.preview === true) {
			return this._preview(result.lesson);
		}
		const changes = this._apply(result.lesson);
		const lines = changes.length ? ['The pet learned:', ...changes.map(change => `- ${change}`)] : [];
		const play = result.lesson.play ?? result.lesson.moves.at(-1)?.name;
		if (play) {
			const owner = invocation.context ? this.chatWidgetService.getWidgetBySessionResource(invocation.context.sessionResource) : undefined;
			lines.push(this.chatPetWidgetService.playReaction(play, owner)
				? `It is playing ${play} now.`
				: `It couldn't play ${play} right now, for example because it is being dragged. The user can play it from the pet's context menu, with Taught Moves.`);
		}
		return createToolSimpleTextResult(lines.join('\n'));
	}

	/** Shows the agent what it drew, frame by frame, before anything is saved. */
	private _preview(lesson: IChatPetLesson): IToolResult {
		const variant = this.chatPetService.variant.get();
		const pictures = lesson.moves.map(move => renderChatPetMoveFrames(move, variant));
		const lines = ['Only a preview: the lesson is valid, but nothing was saved or played.'];
		if (lesson.moves.length) {
			const moves = lesson.moves.map(move => `${move.name} (${move.frames.length} frames, ${(getChatPetMoveDuration(move) / 1000).toFixed(1)} s, ${move.loop ? 'looping' : 'once'})`);
			lines.push(
				`The pictures show every frame of ${moves.join(', then ')}, with its number and duration, on a dark and a light theme, standing on the chat input. "still" marks the frame shown for reduced motion.`,
				'Check them as a designer would: every prop recognizable, shaded and where it belongs, nothing floating by accident or covering the eyes, everything visible on both themes, and the motion flowing from frame to frame. Then call teachPet with the same lesson without "preview" to save it, or fix it and preview again.',
			);
		}
		return { content: [{ kind: 'text', value: lines.join('\n') }, ...pictures.flatMap(toChatPetPictureParts)] };
	}

	private _apply(lesson: IChatPetLesson): string[] {
		const changes: string[] = [];
		for (const name of lesson.forgottenMoves) {
			this.chatPetService.forgetMove(name);
			changes.push(localize('chatPet.teach.changeForgot', "Forgot {0}", name));
		}
		for (const id of lesson.removedReactionIds) {
			const reaction = this.chatPetService.reactions.get().find(candidate => candidate.id === id);
			if (reaction && this.chatPetService.removeReaction(id)) {
				changes.push(localize('chatPet.teach.changeForgotReaction', "Forgot the reaction that {0}", describeChatPetReaction(reaction)));
			}
		}
		for (const move of lesson.moves) {
			this.chatPetService.learnMove(move);
			changes.push(localize('chatPet.teach.changeLearned', "Learned {0}", describeChatPetMove(move)));
		}
		for (const reaction of lesson.reactions) {
			const added = this.chatPetService.addReaction(reaction);
			changes.push(localize('chatPet.teach.changeReaction', "New reaction {0}: {1}", added.id, describeChatPetReaction(added)));
		}
		return changes;
	}
}

/**
 * Lets agents teach the pet. Local chats receive the tools through the VS Code tool set, as for
 * `askQuestions`, and agent host sessions through the VS Code Pet client tool set (see
 * `ClientToolSetsContribution`).
 */
export class ChatPetToolsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.petTools';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		for (const [data, tool] of [
			[ChatPetGuideToolData, instantiationService.createInstance(ChatPetGuideTool)],
			[ChatPetTeachToolData, instantiationService.createInstance(ChatPetTeachTool)],
		] as const) {
			this._register(toolsService.registerTool(data, tool));
			this._register(toolsService.vscodeToolSet.addTool(data));
		}
	}
}
