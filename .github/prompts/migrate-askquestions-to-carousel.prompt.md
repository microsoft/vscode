# Migrate AskQuestionsTool to ChatQuestionCarousel

## Context

The `AskQuestionsTool` in the vscode-copilot-chat extension currently uses `vscode.window.createQuickPick()` to present questions to users. This approach has UX issues:
- Users leave the chat context when interacting with QuickPick
- Modal overlay disrupts the flow
- Complex event handling for multi-step questions
- Manual progress tracking (step/totalSteps)

The new `ChatQuestionCarousel` API provides a Chat-native experience where questions are presented inline in the chat view with carousel navigation.

## New API (from vscode.proposed.chatParticipantAdditions.d.ts)

### ChatQuestionOption Interface
```typescript
interface ChatQuestionOption {
    /** The display label for the option. */
    label: string;
    /** The value returned when this option is selected. */
    value: unknown;
    /** Whether this option is selected by default. */
    default?: boolean;
}
```

### ChatQuestion Class
```typescript
class ChatQuestion {
    /** Unique identifier for the question. */
    id: string;
    /** The type: 'text' for free-form input, 'singleSelect' for radio buttons, 'multiSelect' for checkboxes. */
    type: 'text' | 'singleSelect' | 'multiSelect';
    /** The title/header of the question. */
    title: string;
    /** Optional detailed message or description. */
    message?: string | MarkdownString;
    /** Options for singleSelect or multiSelect questions. */
    options?: ChatQuestionOption[];
    /** Whether the question requires an answer before submission. */
    required?: boolean;
    /** Default value for the question. */
    defaultValue?: unknown;

    constructor(
        id: string,
        type: 'text' | 'singleSelect' | 'multiSelect',
        title: string,
        options?: {
            message?: string | MarkdownString;
            options?: ChatQuestionOption[];
            required?: boolean;
            defaultValue?: unknown;
        }
    );
}
```

### ChatResponseQuestionCarouselPart Class
```typescript
class ChatResponseQuestionCarouselPart {
    /** The questions to display in the carousel. */
    questions: ChatQuestion[];
    /** Whether users can skip answering the questions. */
    allowSkip: boolean;

    constructor(questions: ChatQuestion[], allowSkip?: boolean);
}
```

### Using in Response Stream
```typescript
interface ChatResponseStream {
    push(part: ChatResponseQuestionCarouselPart): void;
}
```

## Migration Steps

### 1. Enable the Proposed API

Add `chatParticipantAdditions` to your extension's `enabledApiProposals` in `package.json`:

```json
{
    "enabledApiProposals": ["chatParticipantAdditions"]
}
```

### 2. Replace QuickPick Question Building

**Before (QuickPick):**
```typescript
// Building questions for QuickPick
const questions = askQuestionsInput.questions.map(q => ({
    header: q.header,
    question: q.question,
    options: q.options.map(o => ({ label: o.label, value: o.value, recommended: o.recommended })),
    multiSelect: q.multiSelect
}));

// Presenting via QuickPick (one at a time)
for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const quickPick = vscode.window.createQuickPick<IQuickPickOptionItem>();
    quickPick.title = question.header;
    quickPick.placeholder = question.question;
    quickPick.step = i + 1;
    quickPick.totalSteps = questions.length;
    quickPick.canSelectMany = question.multiSelect ?? false;
    quickPick.items = question.options.map(o => ({
        label: o.label,
        picked: o.recommended,
        description: o.recommended ? '(recommended)' : undefined
    }));
    quickPick.show();

    // Complex event handling...
    const result = await new Promise<...>((resolve, reject) => {
        quickPick.onDidAccept(() => { ... });
        quickPick.onDidHide(() => { ... });
    });
    answers.set(question.id, result);
}
```

**After (ChatQuestionCarousel):**
```typescript
import * as vscode from 'vscode';

// Building questions for Carousel
const chatQuestions = askQuestionsInput.questions.map(q => new vscode.ChatQuestion(
    q.id ?? q.header, // Use id or header as identifier
    q.multiSelect ? 'multiSelect' : 'singleSelect',
    q.header,
    {
        message: q.question,
        options: q.options.map(o => ({
            label: o.label,
            value: o.value,
            default: o.recommended
        }))
    }
));

// Presenting via Carousel (all at once, inline in chat)
const carouselPart = new vscode.ChatResponseQuestionCarouselPart(chatQuestions, true);
response.push(carouselPart);
```

### 3. Handle Question Types

The carousel supports three question types:

```typescript
// Text input (free-form)
new vscode.ChatQuestion('name', 'text', 'What is your name?', {
    message: 'Enter your full name',
    defaultValue: 'John Doe'
});

// Single select (radio buttons)
new vscode.ChatQuestion('color', 'singleSelect', 'Favorite Color', {
    message: 'Choose one color',
    options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue', default: true },
        { label: 'Green', value: 'green' }
    ]
});

// Multi select (checkboxes)
new vscode.ChatQuestion('features', 'multiSelect', 'Select Features', {
    message: 'Choose all that apply',
    options: [
        { label: 'TypeScript', value: 'ts', default: true },
        { label: 'ESLint', value: 'eslint', default: true },
        { label: 'Prettier', value: 'prettier' }
    ]
});
```

### 4. Handling Responses

The carousel is rendered inline in the chat. For the initial implementation, the carousel works as a one-way display component. To handle user responses, you have two options:

**Option A: Use a callback/event pattern (recommended for complex flows)**
```typescript
// The carousel displays inline and user submits answers
// The answers are collected and can be sent back via tool result or follow-up message
```

**Option B: Use tool invocation pattern**

If you're using the carousel within a tool, the user's answers can be communicated back through the existing tool result mechanism.

## Key Differences Summary

| QuickPick | ChatQuestionCarousel |
|-----------|---------------------|
| Modal overlay | Inline in chat view |
| One question at a time (separate picks) | All questions in carousel with navigation |
| Complex event handling per question | Single push to response stream |
| User leaves chat context | User stays in chat context |
| Manual step/totalSteps tracking | Automatic progress UI ("1 of 5") |
| `vscode.window.createQuickPick()` | `new vscode.ChatResponseQuestionCarouselPart()` |

## UI Features

The ChatQuestionCarousel provides:
- **Progress indicator**: Shows "1 of 5" style navigation
- **Navigation buttons**: Previous/Next to move between questions
- **Skip button**: When `allowSkip: true`, users can skip without answering
- **Submit button**: Submits all collected answers
- **Default selection**: Options with `default: true` are pre-selected
- **Compact layout**: Reduces vertical height compared to listing all questions

## Example: Full Migration

```typescript
// AskQuestionsTool migration example
export class AskQuestionsTool implements vscode.LanguageModelTool<IAskQuestionsInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<IAskQuestionsInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { questions } = options.input;

        // Convert to ChatQuestion array
        const chatQuestions = questions.map(q => new vscode.ChatQuestion(
            q.id,
            q.multiSelect ? 'multiSelect' : (q.options?.length ? 'singleSelect' : 'text'),
            q.header,
            {
                message: q.question,
                options: q.options?.map(o => ({
                    label: o.label,
                    value: o.value,
                    default: o.recommended
                })),
                required: q.required
            }
        ));

        // Create and push the carousel
        const carousel = new vscode.ChatResponseQuestionCarouselPart(chatQuestions, true);

        // Push to response stream (available in chat participant handler)
        // The response stream would need to be passed to or accessible from the tool
        options.responseStream?.push(carousel);

        // Return acknowledgment
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart('Questions presented to user in carousel format.')
        ]);
    }
}
```

## Notes

- The carousel requires the `chatParticipantAdditions` proposed API
- Questions can be required or optional based on the `required` property
- Default values/selections are supported via `defaultValue` and `default` on options
- The carousel renders inline in the chat response, maintaining context
