import { webviewApi } from "@pearai/common";
import { vscodeApi } from "./VsCodeApi";

let state: webviewApi.PanelState = undefined;
let updateListener: ((state: webviewApi.PanelState) => void) | undefined =
	undefined;

// safely load state from VS Code
const loadedState = vscodeApi.getState<unknown>();
try {
	state = webviewApi.panelStateSchema.parse(loadedState);
} catch (error) {
	console.log({
		loadedState,
		error,
	});
}

const updateState = (newState: webviewApi.PanelState) => {
	vscodeApi.setState(newState);
	state = newState;

	if (updateListener != null) {
		updateListener(state);
	}
};

window.addEventListener("message", (rawMessage: unknown) => {
	const event = webviewApi.incomingMessageSchema.parse(rawMessage);

	const message = event.data;
	if (message.type === "updateState") {
		updateState(message.state);
	}
});

// exposed as Singleton that is managed outside of React
// (to prevent schema change errors from breaking the UI)

export const registerUpdateListener = (
	listener: (state: webviewApi.PanelState) => void
) => {
	updateListener = listener;
};

export const getState = () => state;
