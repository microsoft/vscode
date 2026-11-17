---
name: design-topic
description: 'Create, improve, or review complete VS Code design-system topics: guidance, visual explanations, examples, captions, source bindings, chapter composition, and validation. Use when authoring a topic or improving how it teaches design decisions.'
---

# Design topics

Produce a coherent design-system topic that helps readers choose an approach, understand it through explanations and examples, apply it, and judge the result. The deliverable is the topic experience and its source artifacts, not a particular file format.

## Workflow

### 1. Establish scope

Read the complete existing topic: owning documents, chapter/content definitions, specimens, captions, interactions, and source extraction. Inspect the rendered chapter when improving its presentation. Follow the [authoring conventions](../../design-system/authoring.md) for ownership and composition.

Identify the reader's task and the decisions the topic needs to support. Diagnose missing choices, ambiguous rules, and misplaced detail before rewriting. Inventory useful visual teaching as well as prose; preserve it or replace it with an equally effective explanation. Keep stable links and example identities.

Choose the smallest set of artifacts needed for the requested change. A copy edit need not rebuild examples; a new visual topic is not finished after writing its specification.

For review-only work, return prioritized findings with evidence and remedies rather than editing.

### 2. Establish the design contract

Consult the [design philosophy](../design-philosophy/SKILL.md), relevant component specifications, and owning token registrations. Separate design recommendations from API facts and observed implementation.

Discover the current sources for each task. Examples illustrate authoring techniques; they are not required reference topics or cached assessments of the documentation.

- Prefer existing shared components and semantic roles over new styling recipes.
- Check applicability to existing or new surfaces, window types, density, themes, and user settings.
- Preserve component contracts, accessibility behavior, and explicit user preferences. Distinguish workbench UI from user-configured editor content.
- Link to authoritative values and APIs rather than maintaining another inventory.

Use an established rule with its original strength and scope. Treat an implementation example as evidence of that implementation, not product-wide policy. If a necessary recommendation lacks an authoritative basis, identify the unresolved decision in the task result instead of inventing a requirement.

### 3. Organize around decisions

Build a reading sequence suited to the subject:

| Function | What it should establish |
| --- | --- |
| Orientation | What the concept is, what it helps with, and its essential boundary. |
| Principles | The qualities of a good result, expressed as topic-specific choices. |
| Selection | Which approach fits, when to choose another, and relevant exceptions. |
| Application | Roles, composition, states, behavior, or constraints needed to apply the choice. |
| Accessibility | Specific obligations and alternatives, connected to the decisions they affect. |
| Delivery and review | Essential integration constraints and observable checks. |

These are content functions, not required headings. Combine short sections; split complex decisions; omit separate sections that add no value. Put prerequisites before details.

For example, typography needs hierarchy and role selection rather than a yes/no usage matrix. Buttons need action semantics and variant choice before implementation detail. Spacing needs grouping and density decisions before ramp lookup.

For each important decision, choose what readers need to see as well as what they need to read. A composition can teach hierarchy; a matched comparison can isolate emphasis; an interactive example can teach states and interruption. A token inventory supplies reference facts but does not by itself explain how to choose.

Connect each teaching example to its rule, source facts, caption or text equivalent, and an observable success criterion. Put selection guidance before the example and detailed lookup after it. Use [visual topic authoring](references/visual-topic-authoring.md) for representation choices and worked artifact mappings.

### 4. Author and integrate the artifacts

Follow the existing owners rather than placing all content in one document:

| Artifact | Authoring responsibility |
| --- | --- |
| Design guidance | Write intent, decisions, exceptions, accessibility obligations, and review criteria in the existing owning specification. |
| Example explanations | Author captions, annotations, and meaningful text alternatives beside the owning guidance/examples; bind them rather than hiding rules in renderer strings. |
| Structured content and chapter composition | Select source sections, sample content, examples, order, and stable identities using the reader's supported formats. Register a new topic in the book when needed. |
| Specimens, diagrams, and assets | Create or adapt the visual explanation that teaches the decision; resolve product values from their owners and label illustrative geometry as illustrative. |
| Interactive product examples | Reuse the real component and existing fixtures. Add missing scenarios through the [component-fixtures workflow](../component-fixtures/SKILL.md), preserving authentic state and lifecycle. |
| Reader support and checks | Reuse existing presentation blocks and extraction. Add the smallest missing capability in the actual viewer owner when necessary, with focused tests and supported deployment. |

Implement only needed additions and keep dependent call sites/bindings consistent. Product rules and curation stay in the selected checkout; viewer code owns presentation mechanics, not another copy of the book. Do not patch an installed viewer copy as the source implementation. Coordinate separate owners and installations before shared mutations.

If existing presentation cannot teach the required idea, complete the scoped reader/example work rather than silently dropping the idea or substituting a prose placeholder. If that work is outside available authority or access, report the exact missing artifact and keep the affected topic outcome incomplete.

#### Write actionable copy

State the choice and its context. Add the reason and exception when they help readers decide. Keep qualifications beside the rules they change.

| Vague | Actionable |
| --- | --- |
| "Use consistent typography." | "Choose heading, body, or label by the content's role before selecting its size." |
| "Make important text bigger." | "For stronger emphasis within a role, keep its size and use the registered semibold weight." |
| "Keep it simple." | "Keep one action primary; use secondary buttons for supporting choices." |

Use the relevant topic owners to establish product rules; these examples demonstrate the writing pattern.

- Lead with the decision. Give each paragraph or bullet one main job.
- Use plain language, short paragraphs, and descriptive sentence-case headings.
- Preserve distinctions between requirements, defaults, recommendations, and optional cases.
- Name semantic roles before tokens or measurements. Retain rationale that helps with unfamiliar cases.
- Use prose for explanations, tables for comparable choices, bullets for independent rules, and numbered steps for actual sequences.
- Use stable row labels and occasional bold lead-ins for scanning. Avoid wide tables and multi-part bullets.
- Remove repeated rules and generic preambles. Keep detailed technical procedures with their existing owners.
- Keep captions about the design relationship an example demonstrates, independent of sample labels and playback controls.

### 5. Make the topic accessible and reviewable

Consult the [accessibility skill](../accessibility/SKILL.md). Select the concerns that affect this subject: semantics, input and focus, contrast and non-color cues, localization, zoom and reflow, reduced motion, or time-dependent behavior. Place details beside the affected choices and keep obligations easy to find.

Apply those concerns to the documentation itself: meaningful text equivalents for visual relationships, readable annotations, semantic structure, keyboard-operable controls, visible focus, and appropriate motion alternatives. Preserve the specimen's product styling while keeping explanatory chrome in the shared book design. Headless readers need the decision and the meaning of its examples, not just a list of source paths.

Include delivery constraints that can invalidate the design, such as component reuse, token resolution, supported states, or asset format. Link to detailed implementation workflows.

Write a short review checklist from the topic's important rules. Cover approach selection, core intent, applicable accessibility, and delivery risks. Each item should describe an observable outcome; split conditions that would need different fixes. The checklist should not introduce new requirements or repeat every rule.

Distinguish source checks from rendered or interaction checks and design judgment. A token reference can be verified in source; readability, focus visibility, and hierarchy require inspecting the experience. Report unperformed checks explicitly.

### 6. Validate the delivered topic

Walk through a representative case and a boundary or conditional case. Locate the selection rule and the check that evaluates each result. Resolve contradictions and surface unsupported decisions.

Review the composed topic:

- Can readers understand its purpose and choose an approach without implementation knowledge?
- Are defaults, important exceptions, and alternatives clear?
- Are recommendations concise, scoped, and supported by their sources?
- Are accessibility and user preferences reflected in the decisions?
- Does evaluation check the intended outcome rather than implementation details alone?
- Do the examples visibly teach their stated decisions, with understandable context and meaningful text alternatives?
- Have useful existing demonstrations been preserved without stale captions, duplicated galleries, or unrelated sample controls?

For a book chapter, trace important additions into the selected content. Valid links and bindings do not guarantee coverage: paragraph selections or selected headings can omit new guidance. Update supported bindings or explain why material is intentionally source-document-only.

Check changed links, anchors, paragraph selections, fixture references, and stable IDs. Use the actual reader/headless projection and focused content/reader tests for changed bindings or extraction. Verify that specimen properties and behavior resolve from their declared owners; one source-backed property does not establish the others. Confirm that important guidance and examples are displayed, not merely resolved in data, and that decisions precede their references.

For changed visual explanations, inspect the rendered chapter at relevant widths and themes; exercise changed controls, keyboard paths, and motion alternatives. Check the relationship the example claims to demonstrate, not merely whether it renders. Follow the relevant domain workflow, such as [motion design](../motion-design/SKILL.md), when changing that behavior. A successful source projection is not a visual check.

Keep decision guidance usable when an optional preview is unavailable. Test the meaningful nonvisual/headless path separately; it complements rather than replaces visual teaching. Documentary checks establish guidance quality, not product compliance. A prose-only edit needs no product build.

Return the changed artifact set or review findings, checks performed, and material unresolved decisions or delivery gaps. Distinguish authored sources, rendered verification, and any pending installation.

## Reference

- [Visual topic authoring](references/visual-topic-authoring.md): choose and connect visual teaching, examples, source data, and chapter composition.
