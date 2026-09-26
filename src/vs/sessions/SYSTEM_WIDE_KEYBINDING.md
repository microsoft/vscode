# System-wide Open Agents Window keybinding

## Scope

The Agents Window is a narrow renderer owner of direct user system-wide keybindings for
`workbench.action.openAgentsWindow`. This keeps the shortcut active when the Agents Window remains
after all standard editor windows close.

The shared selection, renderer synchronization, native-host IPC, and Electron main-process
registration mechanisms are specified in
[`systemWideKeybindings.specification.md`](../workbench/contrib/keybindings/electron-browser/systemWideKeybindings.specification.md).

## Ownership

The Agents Window runs the shared global first-binding-wins selection before retaining direct Open
Agents Window candidates. It does not own `runCommands` wrappers or system-wide bindings for other
commands.

The command handler is registered during the Sessions desktop entry point. The keybinding owner is
started after workbench restoration, synchronizes immediately when instantiated, and debounces
later keybinding changes.

Rejected Open Agents Window bindings are logged in the Agents Window. OS registration failures are
reported by each renderer owner so an Agents-only process retains a visible failure surface. When
an editor and the Agents Window both own the same failing accelerator, both windows may display the
same warning.

## Profile boundary

The Agents Window profile reads the default profile's keybindings:

- A binding configured only in a non-default editor profile is not retained by the Agents Window
  after that editor closes.
- A binding configured in the default profile remains owned by the Agents Window even while an
  editor uses a custom profile without that binding.
- If those profiles assign the same accelerator to different system-wide commands, the existing
  focused-owner and deterministic fallback routing rules decide which owner receives the trigger.

These profile effects are intentional consequences of the Agents Window's default-profile
resource contract; the Agents owner does not inspect or merge keybindings from editor profiles.
