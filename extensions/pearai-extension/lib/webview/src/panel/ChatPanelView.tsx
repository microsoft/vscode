import { webviewApi } from "@pearai/common";
import React from "react";
import { CollapsedConversationView } from "../component/CollapsedConversationView";
import { ExpandedConversationView } from "../component/ExpandedConversationView";
import { SendMessage } from "../vscode/SendMessage";

const StartChatButton: React.FC<{
	onClick: () => void;
}> = ({ onClick }) => (
	<div className="start-chat">
		<button onClick={onClick}>Start new chat</button>
	</div>
);

export const ChatPanelView: React.FC<{
	sendMessage: SendMessage;
	panelState: webviewApi.PanelState;
}> = ({ panelState, sendMessage }) => {
	if (panelState == null) {
		return (
			<StartChatButton onClick={() => sendMessage({ type: "startChat" })} />
		);
	}

	if (panelState.type !== "chat") {
		throw new Error(
			`Invalid panel state '${panelState.type}' (expected 'chat'))`
		);
	}

	if (!panelState.hasOpenAIApiKey) {
		return (
			<div className="enter-api-key">
				<button onClick={() => sendMessage({ type: "enterOpenAIApiKey" })}>
					Enter your OpenAI API key
				</button>
				<p>
					PearAI uses the OpenAI API and requires an API key to work. You can
					get an API key from{" "}
					<a href="https://platform.openai.com/account/api-keys">
						platform.openai.com/account/api-keys
					</a>
				</p>
			</div>
		);
	}

	if (panelState.conversations.length === 0) {
		return (
			<StartChatButton onClick={() => sendMessage({ type: "startChat" })} />
		);
	}

	return (
		<div>
			{panelState.conversations.reverse().map((conversation) =>
				panelState.selectedConversationId === conversation.id ? (
					<ExpandedConversationView
						key={conversation.id}
						conversation={conversation}
						onSendMessage={(message: string) =>
							sendMessage({
								type: "sendMessage",
								data: { id: conversation.id, message },
							})
						}
						onClickRetry={() =>
							sendMessage({
								type: "retry",
								data: { id: conversation.id },
							})
						}
						onClickDismissError={() =>
							sendMessage({
								type: "dismissError",
								data: { id: conversation.id },
							})
						}
						onClickDelete={() =>
							sendMessage({
								type: "deleteConversation",
								data: { id: conversation.id },
							})
						}
						onClickExport={() => {
							sendMessage({
								type: "exportConversation",
								data: { id: conversation.id },
							});
						}}
						onClickInsertPrompt={
							panelState.surfacePromptForOpenAIPlus
								? () => {
										sendMessage({
											type: "insertPromptIntoEditor",
											data: { id: conversation.id },
										});
									}
								: undefined
						}
					/>
				) : (
					<CollapsedConversationView
						key={conversation.id}
						conversation={conversation}
						onClick={() =>
							sendMessage({
								type: "clickCollapsedConversation",
								data: { id: conversation.id },
							})
						}
					/>
				)
			)}
		</div>
	);
};
