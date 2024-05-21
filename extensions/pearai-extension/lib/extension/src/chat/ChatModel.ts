import { Conversation } from "../conversation/Conversation";

export class ChatModel {
	conversations: Array<Conversation> = [];
	selectedConversationId: string | undefined;

	addAndSelectConversation(conversation: Conversation) {
		this.conversations.push(conversation);
		this.selectedConversationId = conversation.id;
	}

	getConversationById(id: string): Conversation | undefined {
		return this.conversations.find((conversation) => conversation.id === id);
	}

	deleteConversation(id: string) {
		this.conversations = this.conversations.filter(
			(conversation) => conversation.id !== id
		);
	}
}
