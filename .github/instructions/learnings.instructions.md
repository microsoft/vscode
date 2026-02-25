---
description: This document describes how to deal with learnings that you make. (meta instruction)
---

This document describes how to deal with learnings that you make.
It is a meta-instruction file.

Structure of learnings:
* Each instruction file has a "Learnings" section.
* Each learning has a 1-4 sentences description of the learning.

Example:
```markdown
## Learnings
* Prefer `const` over `let` whenever possible
* Avoid `any` type
```

When the user tells you "learn!", you should:
* extract a learning from the recent conversation
	* identify the problem that you created
	* identify why it was a problem
	* identify how you were told to fix it/how the user fixed it
	* reflect over it, maybe it can be generalized? Avoid too specific learnings.
* create a learning (1-4 sentences) from that
	* Write this out to the user and reflect over these sentences
	* then, add the reflected learning to the "Learnings" section of the most appropriate instruction file
