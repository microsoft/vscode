import { webviewApi } from "@pearai/common";
import React from "react";
import { DiffView } from "../component/DiffView";
import { SendMessage } from "../vscode/SendMessage";

export const DiffPanelView: React.FC<{
	sendMessage: SendMessage;
	panelState: webviewApi.PanelState;
}> = ({ panelState, sendMessage }) => {
	if (panelState == null) {
		return <></>;
	}

	if (panelState.type !== "diff") {
		throw new Error(
			`Invalid panel state '${panelState.type}' (expected 'diff'))`
		);
	}

	return (
		<>
			<DiffView
				oldCode={panelState.oldCode}
				newCode={panelState.newCode}
				languageId={panelState.languageId}
			/>
			<div
				style={{
					padding: "var(--container-padding)",
					background: "var(--vscode-panel-background)",
					borderTop: "1px solid var(--vscode-panel-border)",
				}}
			>
				<button
					onClick={() => {
						sendMessage({
							type: "applyDiff",
						});
					}}
				>
					Apply
				</button>
			</div>
		</>
	);
};
