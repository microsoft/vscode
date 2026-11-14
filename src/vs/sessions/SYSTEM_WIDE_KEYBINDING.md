# System-wide keybindings in the Agents Window

## Scope

The Agents Window is a narrow renderer owner of direct system-wide keybindings for `workbench.action.openAgentsWindow`, `workbench.action.agentsLauncher` and `workbench.action.chat.attachAppWindowScreenshot`: the user's, and the default keybinding of Attach Screenshot of App Window, which is system-wide while `chat.appWindowScreenshots.enabled` is on. This keeps those shortcuts active when the Agents Window remains after all standard editor windows close.

The shared selection, renderer synchronization, native-host IPC, and Electron main-process
registration mechanisms are specified in
[`systemWideKeybindings.specification.md`](../workbench/contrib/keybindings/electron-browser/systemWideKeybindings.specification.md).

## Ownership

The Agents Window runs the shared global first-binding-wins selection before retaining direct candidates for Open Agents Window, Show Agents Launcher and Attach Screenshot of App Window. It does not own `runCommands` wrappers or system-wide bindings for other commands.

When an editor window and the Agents Window both own an accelerator, a trigger goes to the focused owner, then to the owner that was active last, then to the lowest window id (see the shared specification). While another app is in front, Attach Screenshot of App Window therefore attaches the screenshot to a chat in the window that the user just left.

On macOS, the Agents Window chat tip provider promotes `ctrl+cmd+a` when no effective selected user
system-wide Open Agents Window binding exists and the tip has not been dismissed on that machine.
Its **Enable** action appends the binding to the user's `keybindings.json`, including the system-wide
flag and the keyboard-shortcut open source. If another effective system-wide binding already owns
that accelerator, the action reports the conflict and leaves the tip visible. The action is
serialized while in flight, reports editing failures in the Agents Window, and confirms the enabled
shortcut for the remainder of the current chat session after a successful write.

The command handler is registered during the Sessions desktop entry point. The keybinding owner is
started after workbench restoration, synchronizes immediately when instantiated, and debounces
later keybinding changes.

Open Agents Window force-reveals the window through the native host, because a system-wide trigger
usually fires while VS Code is inactive or hidden and does not focus any window itself.

Rejected bindings for these commands are logged in the Agents Window. OS registration failures are
reported by each renderer owner so an Agents-only process retains a visible failure surface. When
an editor and the Agents Window both own the same failing accelerator, both windows may display the
same warning.

## Profile boundary

The Agents Window profile reads the default profile's keybindings:

- A binding configured only in a non-default editor profile is not retained by the Agents Window
  after that editor closes.
- A binding configured in the default profile remains owned by the Agents Window even while an
  editor uses a custom profile without that binding.
- If those profiles assign the same accelerator to different system-wide commands, the shared routing rules (focused owner, then the owner that was active last, then the lowest window id) decide which owner receives the trigger.

These profile effects are intentional consequences of the Agents Window's default-profile
resource contract; the Agents owner does not inspect or merge keybindings from editor profiles.
