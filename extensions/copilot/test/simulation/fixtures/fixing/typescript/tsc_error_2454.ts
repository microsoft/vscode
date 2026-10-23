enum FeedbackKind {
	Helpful,
	Unhelpful,
	Undone,
	Accepted
}

class SomeClass {
	handleInteractiveEditorResponseFeedback(kind: FeedbackKind): void {
		let telemetryEventName: string;
		switch (kind) {
			case FeedbackKind.Helpful:
				telemetryEventName = 'inlineConversation.messageRating';
				break;
			case FeedbackKind.Unhelpful:
				telemetryEventName = 'inlineConversation.messageRating';
				break;
			case FeedbackKind.Undone:
				telemetryEventName = 'inlineConversation.undo';
				break;
		}
		if (telemetryEventName) {
			this.takeAction();
		}
	}

	takeAction(): void { }
}
