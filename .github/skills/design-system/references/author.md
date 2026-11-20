# Author a topic

Create or improve a design-system topic so readers can choose, apply, and evaluate an approach. Covers copy edits, new or restructured topics, and presentation changes.

- **Copy edit:** improve the owning guidance; change bindings only if selected content changes.
- **New or restructured topic:** plan the reader's decisions, then deliver the needed guidance, examples, and discovery.
- **Presentation change:** inspect the rendered chapter and follow the relevant visual or interaction workflow.


## 1. Define the reader's goal

Start with the ultimate user job, then identify the decisions the designer, developer, or agent must make to support it. Avoid treating documentation completeness as the goal.

For example, button guidance helps people recognize and complete the intended action. Variant selection supports that job; cataloging every button property does not.

Read the complete existing topic: owning guidance, chapter composition, examples, captions, interactions, and source extraction. Compare relevant siblings for terminology and hierarchy, not a mandatory template.

Keep a compact plan in task context:

- Audience, user job, and observable successful outcome.
- Topic boundary, authoritative owner, category, and neighboring topics.
- Primary decisions, teaching examples, reference needs, and discovery paths.

Choose topic scope, source location, and navigation separately. Foundations teach shared choices; components teach reusable contracts, not every variant or feature composition. [Patterns](pattern-authoring.md) teach reusable task compositions, navigation, and behavior across scenarios.

Use [component qualification](component-qualification.md) when creating or consolidating a component topic. Recommend placement improvements with their compatibility implications; do not turn an editorial task into an unrequested reorganization.

## 2. Inherit the design contract

Consult the [design philosophy](../foundations/principles.design.md), relevant specifications, and owning token registrations. Discover current sources rather than relying on cached topic assessments.

The philosophy owns shared values and principles. Topics apply them to specific decisions; they do not need a separate principles section.

- Link to a shared principle instead of restating it.
- If a topic needs an extension, name the inherited principle, local decision, and applicability boundary.
- Keep independent domain obligations, such as accessibility contracts, with their authoritative owners.
- Resolve conflicting wording at its owner; do not invent precedence or silently weaken a rule.

For example, typography can link to "One thing leads" and explain how text roles establish hierarchy. It need not redefine the Focused value.

Separate recommendations, API facts, and observed implementation. Preserve each rule's original strength and scope; an implementation example is not product-wide policy.

Prefer shared components and semantic roles. Check applicability across surfaces, window types, density, themes, and user preferences, including workbench versus user-configured editor content.

Link to authoritative values and APIs rather than copying inventories. Report unsupported recommendations as unresolved decisions.

## 3. Put decisions before detail

Open with the job, when this guidance applies, and its essential boundary. Readers should recognize whether the topic fits before encountering specifications.

Organize around the shortest useful path: choose an approach, apply it, then judge the outcome. Use these functions, not a fixed heading template.

Add dos and don'ts, clarifications, callouts, or emphasis only when the primary instructions leave a consequential ambiguity. Attach each to the decision it changes.

Required prerequisites, accessibility obligations, and safety constraints must remain visible before the affected action. Progressive detail must not hide them.

Use a small set of substantial outline destinations, with subordinate detail below them. Prefer familiar sentence-case labels where they fit; retain useful topic-specific differences.

Derive the outline from rendered section order, including conditional sections. Preserve required extraction headings and stable anchors through supported labels and aliases.

Pair important visual decisions with useful teaching examples, not just token inventories. Connect each example to its decision, source facts, text equivalent, and observable success criterion.

Put selection guidance before examples and detailed lookup after them. Use [visual topic authoring](visual-topic-authoring.md) for representation choices and artifact mapping.

## 4. Write concise, actionable guidance

Apply these limits to authored topic prose and this skill's instructions:

- **Introduction or overview:** one paragraph, at most two sentences and 50 words. State purpose, applicability, and boundary; move background later.
- **Sentences:** at most 25 words, with one main decision or explanation.
- **Paragraphs:** at most three sentences and 75 words, covering one idea.
- **Bullets and table cells:** one decision each; move extended reasoning into nearby prose.

These limits exclude code, API signatures, URLs, and exact quotations. Preserve precise meaning; split or relocate prose rather than dropping necessary qualifications.

| Instead of | Write |
| --- | --- |
| "Use consistent typography." | "Choose a text role before selecting its size." |
| "Keep it simple." | "Keep one action primary; use secondary buttons for supporting choices." |

These illustrate writing patterns, not new product rules.

Lead with the choice and context; add rationale only when it helps readers decide. Use plain language, action verbs, and established terminology.

Use prose for reasoning, bullets for independent rules, numbered steps for sequences, and tables for comparable alternatives. Keep emphasis occasional and subordinate to the main instructions.

Keep each rule at one owner. Use a short contextual link for adjacent topics rather than importing their guidance or procedures.

Repair reading order and hierarchy before polishing sentences. Consolidate repetition without losing exceptions, useful examples, or accessibility obligations.

## 5. Deliver the needed artifacts

Follow the existing owners in [authoring conventions](authoring-conventions.md). Keep guidance and captions in source documents, facts in product code, selection in curation, and presentation mechanics in the viewer.

Preserve useful demonstrations or replace them with equally effective explanations. Captions describe the design relationship, independently of sample labels or preview controls.

Reuse real components through the [component-fixtures workflow](../../component-fixtures/SKILL.md). Resolve specimen values from declared owners; label illustrative geometry as illustrative.

Consult the [accessibility skill](../../accessibility/SKILL.md) for the subject's relevant obligations and the documentation itself. Include meaningful text equivalents, semantic structure, and applicable keyboard, focus, contrast, reflow, and motion alternatives.

Keep product styling in specimens and shared book styling in explanatory material. Headless readers need the decisions and example meanings, not just source paths.

Use [topic integration](topic-integration.md) for registration, bindings, reader changes, discovery, and installation. Change actual viewer sources, never an installed copy; coordinate shared mutations through their owner.

Deliver missing reader support when needed to teach the scoped idea. If authority or access prevents delivery, identify the exact gap and keep that outcome incomplete.

## 6. Verify the reader can succeed

Walk through a representative job and a boundary case. Locate the selection rule and observable outcome for each.

Check the complete topic:

- The opening establishes fit within the length limits.
- Primary instructions support the job before references and supplementary detail.
- Local extensions identify inherited principles without repeating or conflicting with other owners.
- Defaults, exceptions, accessibility obligations, and user preferences remain clear.
- Examples teach their stated decisions, with meaningful nonvisual equivalents.
- A short review checklist tests outcomes without introducing new requirements or repeating every rule.

For changed bindings, use the actual reader projection and focused tests. Check links, anchors, selections, fixture references, and stable IDs.

Verify important guidance is included in selected chapter content, not merely resolvable. Check human navigation and agent search through [topic integration](topic-integration.md).

For visual changes, inspect relevant widths and themes; exercise changed controls and keyboard paths. Use the [motion workflow](../../motion-design/SKILL.md) when behavior changes.

Check specimen source backing per property and behavior. A passing projection does not prove visual teaching; a screenshot does not prove interaction.

Test meaningful headless guidance and optional-preview failure separately when affected. A prose-only edit needs editorial and link checks, not a product build.

Return changed artifacts or review findings, checks performed, and unresolved decisions. Distinguish source edits, rendered verification, pending installation, and unperformed checks.
