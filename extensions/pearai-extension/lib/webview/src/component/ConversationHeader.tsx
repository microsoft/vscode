import { webviewApi } from "@pearai/common";
import React from "react";

export const ConversationHeader: React.FC<{
	conversation: webviewApi.Conversation;
	onIconClick?: () => void;
}> = ({ conversation, onIconClick }) => {
	return (
		<div className="header">
			<i className={`codicon codicon-${conversation.header.codicon} inline`} />
			{conversation.header.isTitleMessage ? (
				<span className="message user">{conversation.header.title}</span>
			) : (
				conversation.header.title
			)}
			{onIconClick && (
				<span>
					&nbsp;
					<i className="codicon codicon-eye inline" onClick={onIconClick} />
				</span>
			)}
		</div>
	);
};
