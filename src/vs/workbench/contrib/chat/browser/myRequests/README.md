# Search My Requests (prototype)

In the editor or Agents window, run **Chat: Configure My Request Recording…** and choose **Start Recording**. Recording is off initially. This prototype supports chats with stable Agent Host identities; it does not index general-purpose editor history or import old conversations.

1. Send `review this` with a file attached. In a side chat, send `check cache invalidation after restart`.
2. Switch workspaces or disconnect the side chat’s host. Run **Chat: Search My Requests**, enter `cache invalidation`, and select the result. The preview reads your saved text locally; it does not fetch the conversation. Searching for the contents of the attached file should not match `review this`.
3. Reconnect the original host and choose **Open Request**. The target includes the host, backend session, chat and request. If the original target is unavailable, the opener reports that rather than substituting another host's turn.
4. To get a link without recording, open an Agent Host request's transcript context menu and choose **Copy Link to Request**. Use the link inside VS Code, for example in the chat input with **Open Link**.

The index keeps up to 200 submissions, newest first. It uses client-side IndexedDB keyed by profile, outside Settings Sync. Each entry contains only `{ text, link }`; attachment contents, processed prompts, responses and tools are not part of the index. Use **Forget Request** in the preview to remove one entry or **Chat: Clear My Recorded Requests…** to remove all entries. Neither action deletes the chat. Stopping recording does not erase existing entries.

## Extension or agent integration

An extension (including an agent's client-side tool) can ask the user to share a relevant request:

```ts
const matches = await vscode.commands.executeCommand<{ text: string; link: string }[]>(
	'workbench.action.chat.requestMyRequestMatches', 'cache invalidation'
);
```

The caller supplies search words, not entry IDs or selection arguments. The user picks a match and confirms its full text and link. The command returns that one entry, or `[]` if nothing is shared. It does not expose a history-listing command or register an Agent Host server tool. The index is local storage, not a security boundary against software with direct access to the user's files.

## Link lifetime

Search is independent of host availability. Opening needs a window connected to the recorded host that can load the chat. A removed chat, a discarded queued message, or a provider that does not retain a distinct turn can leave a readable entry with no navigable target. Bundled host queue promotion preserves the pending ID; if a different host remaps it, the index follows the observed remap, but an already-copied link cannot be rewritten.
