# AI Use Log — A2b: SSDs and Operation Contracts

**Project:** Visual Studio Code repository  
**Assignment:** Contracts  
**AI assistance used:** Codex

## What I asked the AI to do

I provided the A2b assignment. Codex used my three existing fully dressed use cases to draft the noun phrase analysis, refine the domain model, create three Mermaid SSDs, and write one operation contract per SSD.

## What the AI produced

Codex produced the wiki-ready page `SSDs-and-Operation-Contracts.md`, updated `vscode-domain-model.mmd`, created separate Mermaid source files for the three SSDs, and drafted this log. It chose `searchWorkspace`, `grantWorkspaceTrust`, and `commitChanges` as the changing operations for the contracts.

## Checks performed by Codex

Codex compared the SSDs against the main success steps in `requirements-and-use-cases.md`. In particular, the debug SSD keeps the workspace-trust request before session creation, the search SSD shows repeated match returns, and the commit SSD repeats staging before committing. Codex checked that each class and attribute named in a postcondition appears in the updated domain model and that every contract operation is spelled exactly as in its SSD. The final page and diagrams should be reviewed again in the GitHub wiki renderer before submission.

## My work

Before submission, I will review the noun classifications, confirm that these abstract operations accurately represent my use cases, present one SSD and contract in class, and submit the wiki link on OAKS.
