# Designing for AI

## Introduction

**Working draft:** use this chapter to choose existing guidance for AI-assisted experiences and identify necessary VS Code adaptations. This proposed approach is not approved product-wide guidance.

## Choose the guidance

| When you need to decide... | Use... | Document here... |
| --- | --- | --- |
| How a familiar AI interaction should behave | An applicable, established GitHub Copilot app interaction pattern | Its reference and applicability, rather than a rewritten specification |
| How that interaction should look and fit in VS Code | Existing VS Code [components](./components.md), [design foundations](./README.md#find-the-owning-guidance), and [accessibility guidance](./accessibility.design.md) | Only the local adaptation |
| Which principles help evaluate an experience or unresolved tradeoff | Microsoft's [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) (HAX) | The relevant principle and its application to the decision |
| Whether different behavior is necessary | A concrete VS Code user need or platform constraint | The smallest justified difference and its evidence |

Start with the references below and confirm a pattern's applicability and status with its owner. An inventory, observation, or experiment does not establish approval.

Apply HAX throughout the design, not only when a pattern is missing. M365 Copilot patterns are not the default interaction precedent for this approach.

## Follow the decision tree

Start with the user task and the surface where it happens.

1. **Is there an established GitHub Copilot app pattern that fits?**
   - **Yes:** preserve its interaction contract, including meaningful states, actions, and recovery.
   - **Unclear:** confirm applicability and maturity with the pattern owner before treating it as established.
   - **No:** use HAX and existing VS Code contracts to develop a proposal; keep it marked as draft.
2. **Does the interaction need a VS Code adaptation?**
   - **Appearance or composition only:** reuse VS Code components, tokens, layout, and content guidance while preserving the interaction.
   - **Different behavior:** identify the specific user need or platform constraint and document the smallest necessary change for review.
   - **No local difference:** link to the established guidance instead of creating another specification.
3. **Does the result preserve the shared intent and applicable requirements?**
   - **Yes:** record the reference, adaptation, and evidence.
   - **No or unresolved:** keep the difference open for review rather than presenting it as settled guidance.

Accessibility, permissions, and explicit user choices remain constraints throughout. Visual alignment cannot justify weakening these requirements.

## Find a reference by task

These publicly documented workflows provide starting points for comparison, not approved design-system standards or an exhaustive pattern catalog.

| User task | Public behavior reference | Local design question |
| --- | --- | --- |
| Start work in the right place | [GitHub Copilot app: first code changes](https://docs.github.com/en/copilot/get-started/quickstart-copilot-app#making-your-first-code-changes) | Is the repository, session, and intended task clear before work begins? |
| Explain a task and supply context | [VS Code: send a request and add context](https://code.visualstudio.com/docs/chat/chat-overview#_send-a-chat-request) | Can people understand which files or information are in scope? |
| Redirect work already in progress | [VS Code: queue, steer, or stop](https://code.visualstudio.com/docs/chat/chat-overview#_send-messages-while-a-request-is-running) | Are the available actions and their different consequences understandable? |
| Review and use a code change | [GitHub Copilot app: inspect changes and create a pull request](https://docs.github.com/en/copilot/get-started/quickstart-copilot-app#making-your-first-code-changes) | Can people inspect the result before deciding what to keep? |
| Return to ongoing work | [VS Code: manage agent sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions) | Is it clear which conversation and workspace will resume? |

Use the GitHub Copilot app reference first when it covers the same task. VS Code references describe local behavior, not proof of cross-product alignment.

If no applicable reference exists, use HAX and existing VS Code guidance to develop a proposal. Record the unresolved comparison rather than inventing an upstream contract.

## Document only local adaptations

Keep the shared interaction at its existing owner. For each local adaptation, record:

- The user task and affected VS Code surface.
- The upstream reference and its status.
- The behavior that stays the same.
- The local change and the need or constraint that justifies it.
- An example, supporting evidence, and review status.

When no established pattern fits, separate the proposed behavior from validated findings. Consider sharing reusable findings with the upstream pattern owner.

## Questions to explore

Use these questions to evaluate the selected pattern and collect evidence for any proposed adaptation.

- **Getting started:** How do people discover what AI can help with and understand its limitations?
- **During use:** How do people know what AI is doing and when their input is needed?
- **When things go wrong:** How can people correct, dismiss, stop, or undo AI actions without losing their work?
- **Over time:** How do people understand changes in behavior and control what the system remembers?

Apply the shared [design philosophy](./principles.design.md), [accessibility](./accessibility.design.md), and [content](./content.design.md) guidance rather than redefining them here.

## Contribute an example

Start with one scenario from chat, inline suggestions, or agent-assisted work. Add:

- The user goal and interaction stage.
- A design choice, example, or pattern worth discussing.
- Supporting research or a learning, with a public or publication-approved source.
- An open question or proposed takeaway, clearly distinguished from validated findings.

Keep unresolved ideas marked as draft. Link to existing guidance or [reusable patterns](./patterns.md) instead of creating a second owner.
