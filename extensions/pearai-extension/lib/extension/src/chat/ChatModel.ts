import { Conversation } from "../conversation/Conversation";

export class ChatModel {
	conversations: Array<Conversation> = [];
	selectedConversationId: string | undefined;

	selectConversation(conversation: Conversation) {
		this.selectedConversationId = conversation.id;
	}

	addAndSelectConversation(conversation: Conversation) {
		this.conversations.push(conversation);
		this.selectConversation(conversation);
	}

	getConversationById(id: string): Conversation | undefined {
		return this.conversations.find((conversation) => conversation.id === id);
	}

	/**
	 * @returns The last selected conversation, if it exists.
	 */
	getLastSelectedConversation(): Conversation | undefined {
		if (!this.selectedConversationId) {
			return;
		}
		return this.getConversationById(this.selectedConversationId);
	}

	deleteConversation(id: string) {
		this.conversations = this.conversations.filter(
			(conversation) => conversation.id !== id
		);
	}
}
