# IDE Navigation

The vocabulary for moving between independent project workspaces and the shared Agents view within one IDE window.

## Language

**Project tab**:
A top-level tab representing one independent workspace, which may contain a single folder or multiple folders. Its working state and running work are preserved when another view is selected.
_Avoid_: Repository tab, file tab

**Home workspace**:
The single project workspace explicitly associated with a chat. It determines which Project Chats list contains that chat and which workspace its project navigation targets.

**Agents view**:
The shared view for working with agent sessions across projects, reached through a permanent button to the left of the project tabs.
_Avoid_: Agents window when describing the intended single-window experience

**Project Chats**:
The project sidebar view containing the LLM conversations whose home workspace is that project, available alongside Files and Source Control. Selecting a conversation opens it in the central editor area, where it can be continued within the project tab.

**Chat editor**:
A conversation open in the central editor area, alongside file editors. It represents the same conversation accessible from the Agents view.
