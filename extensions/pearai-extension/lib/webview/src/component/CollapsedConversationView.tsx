import { webviewApi } from "@pearai/common";
import React from "react";
import { ConversationHeader } from "./ConversationHeader";

export const CollapsedConversationView: React.FC<{
	conversation: webviewApi.Conversation;
	onClick: () => void;
}> = ({ conversation, onClick }) => (
	<div className={`conversation collapsed`} onClick={onClick}>
		<ConversationHeader conversation={conversation} />
	</div>
);
