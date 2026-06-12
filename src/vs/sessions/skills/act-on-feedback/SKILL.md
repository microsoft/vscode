---
name: act-on-feedback
description: Act on user feedback attached to the current session. Use when the user submits feedback on the session's changes via the Submit Feedback button.
---
<!-- Customize this skill and select save to override its behavior. Delete that copy to restore the built-in behavior. -->

# Act on Feedback

The user has provided feedback on the current session's changes.

1. Use the `listComments` tool to retrieve all of the user's feedback comments for this session
2. If any feedback comments were also attached to this message, review those as well
3. Understand the intent behind each piece of feedback
4. Make the requested changes to address the feedback
5. When feedback has been tackled, use the `resolveComments` tool to mark those comments as resolved, or the `deleteComments` tool to delete them
6. Verify your changes are consistent with the rest of the codebase
