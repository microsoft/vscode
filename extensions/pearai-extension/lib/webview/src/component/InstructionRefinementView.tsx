import { webviewApi } from "@pearai/common";
import React, { useState } from "react";
import { ChatInput } from "./ChatInput";
import { ErrorMessage } from "./ErrorMessage";

export function InstructionRefinementView({
	content,
	onSendMessage,
	onClickDismissError,
	onClickRetry,
}: {
	content: webviewApi.InstructionRefinementContent;
	onSendMessage: (message: string) => void;
	onClickDismissError: () => void;
	onClickRetry: () => void;
}) {
	const [inputText, setInputText] = useState(content.instruction);
	return (
		<div className="instruction-refinement">
			{(() => {
				const type = content.state.type;
				switch (type) {
					case "waitingForBotAnswer":
						return (
							<>
								<ChatInput text={inputText} disabled />
								<button disabled>
									{content.state.botAction ?? "Generating"}
								</button>
							</>
						);
					case "userCanRefineInstruction":
						return (
							<>
								<ChatInput
									text={inputText}
									placeholder={"Enter instructions…"}
									onChange={setInputText}
									onSubmit={() => onSendMessage(inputText)}
									shouldCreateNewLineOnEnter
								/>
								<button onClick={() => onSendMessage(inputText)}>
									Generate
								</button>
							</>
						);
					default: {
						const exhaustiveCheck: never = type;
						throw new Error(`unsupported type: ${exhaustiveCheck}`);
					}
				}
			})()}

			{content.error && (
				<ErrorMessage
					error={content.error}
					onClickDismiss={onClickDismissError}
					onClickRetry={onClickRetry}
				/>
			)}
		</div>
	);
}
