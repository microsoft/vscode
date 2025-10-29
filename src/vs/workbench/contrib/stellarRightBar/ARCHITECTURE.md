# Stellar Chat Panel - Architecture Overview

## 🏗️ System Architecture (Current State - STEP 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Window                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Auxiliary Bar (Right)                   │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         Stellar View Container                        │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌─────────────────────────────────────────────────┐ │ │ │
│  │  │  │     StellarRightView (ViewPane)                 │ │ │ │
│  │  │  │                                                  │ │ │ │
│  │  │  │  [Currently renders basic DOM elements]         │ │ │ │
│  │  │  │                                                  │ │ │ │
│  │  │  │  🔜 STEP 2: Will host Webview Panel             │ │ │ │
│  │  │  │                                                  │ │ │ │
│  │  │  └─────────────────────────────────────────────────┘ │ │ │
│  │  │                                                       │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Webview Application Structure (STEP 1 - Implemented)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Webview (React App)                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   ChatPanel Component                      │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         Messages Container (Scrollable)              │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌────────────────────────────────────────────────┐  │ │ │
│  │  │  │  MessageBubble (User)                          │  │ │ │
│  │  │  │  👤 You                      12:34 PM          │  │ │ │
│  │  │  │  "Hello Stellar"                               │  │ │ │
│  │  │  └────────────────────────────────────────────────┘  │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌────────────────────────────────────────────────┐  │ │ │
│  │  │  │  MessageBubble (Assistant)                     │  │ │ │
│  │  │  │  ⭐ Stellar                  12:34 PM          │  │ │ │
│  │  │  │  "You said: Hello Stellar..."                  │  │ │ │
│  │  │  └────────────────────────────────────────────────┘  │ │ │
│  │  │                                                       │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         Input Area (Fixed at Bottom)                 │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌────────────────────────────────────────────────┐  │ │ │
│  │  │  │  [Ask Stellar...                            ]  │  │ │ │
│  │  │  └────────────────────────────────────────────────┘  │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌──────────┐  ┌──────────┐                         │ │ │
│  │  │  │   Send   │  │  Clear   │                         │ │ │
│  │  │  └──────────┘  └──────────┘                         │ │ │
│  │  │                                                       │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow (STEP 1 - Local State Only)

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interaction                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ 1. User types & clicks "Send"
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChatPanel Component                          │
│                                                                 │
│  handleSend() {                                                 │
│    addUserMessage(content)           ──────┐                   │
│    placeholderId = addAssistantReply(...)  │                   │
│    await delay(2000)                       │                   │
│    replaceAssistantPlaceholder(...)        │                   │
│  }                                          │                   │
└─────────────────────────────────────────────┼───────────────────┘
                                              │
                                              │ 2. State updates
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Conversation Store (Zustand)                       │
│                                                                 │
│  State: {                                                       │
│    conversations: [                                             │
│      {                                                          │
│        id: "conv-1",                                            │
│        messages: [                                              │
│          { role: "user", content: "..." },                      │
│          { role: "assistant", content: "..." }                  │
│        ]                                                        │
│      }                                                          │
│    ],                                                           │
│    activeConversationId: "conv-1"                               │
│  }                                                              │
│                                                                 │
│  Actions:                                                       │
│    - addUserMessage()                                           │
│    - addAssistantReply()                                        │
│    - replaceAssistantPlaceholder()                              │
│    - clearConversation()                                        │
└─────────────────────────────────────────────┬───────────────────┘
                                              │
                                              │ 3. Re-render
                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ChatPanel Component                          │
│                                                                 │
│  const messages = getActiveConversation()?.messages || []       │
│                                                                 │
│  return (                                                       │
│    <div>                                                        │
│      {messages.map(msg => <MessageBubble />)}                   │
│    </div>                                                       │
│  )                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## 📂 File Organization

```
stellarRightBar/
├── browser/
│   ├── stellarRightBar.contribution.ts  ← Registers view container
│   ├── stellarRightView.ts              ← ViewPane (will host webview)
│   └── webview/                         ← React application
│       ├── types.ts                     ← Data models
│       ├── conversationStore.ts         ← State management
│       ├── components/
│       │   ├── ChatPanel.tsx            ← Main UI
│       │   └── ChatPanel.css            ← Styling
│       ├── index.tsx                    ← Entry point
│       ├── index.html                   ← HTML template
│       ├── package.json                 ← Dependencies
│       ├── webpack.config.js            ← Bundler
│       ├── tsconfig.json                ← TypeScript config
│       ├── dist/
│       │   └── index.js                 ← Built bundle
│       ├── README.md                    ← Documentation
│       └── QUICKSTART.md                ← Setup guide
└── ARCHITECTURE.md                      ← This file
```

## 🔮 Future Architecture (STEP 2+)

```
┌─────────────────────────────────────────────────────────────────┐
│                      VS Code Extension Host                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              StellarRightView (ViewPane)                   │ │
│  │                                                            │ │
│  │  - Creates webview panel                                  │ │
│  │  - Handles extension ↔ webview messaging                  │ │
│  │  - Manages API calls to LM Studio                         │ │
│  │  - Handles context collection                             │ │
│  │                                                            │ │
│  └───────────────────────────┬───────────────────────────────┘ │
│                              │                                 │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                               │ postMessage / onDidReceiveMessage
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│                    Webview (React App)                          │
│                                                                 │
│  - Renders UI                                                   │
│  - Manages local state                                          │
│  - Sends user messages to extension                             │
│  - Receives streaming responses                                 │
│  - Displays markdown, code blocks, etc.                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🎯 Key Design Decisions

### 1. **Zustand for State Management**
- ✅ Lightweight (3KB)
- ✅ No boilerplate (vs Redux)
- ✅ TypeScript friendly
- ✅ React hooks based
- ✅ Easy to test

### 2. **Separate Webview Directory**
- ✅ Independent build process
- ✅ Can use React ecosystem tools
- ✅ Clear separation from extension code
- ✅ Easy to develop/test in isolation

### 3. **Future-Proof Data Model**
- ✅ `parentId` field for threading
- ✅ `metadata` for extensibility
- ✅ Multiple conversation support
- ✅ Timestamp tracking

### 4. **Mock Flow in STEP 1**
- ✅ Tests entire UI flow
- ✅ No external dependencies
- ✅ Easy to verify
- ✅ Clear placeholder for real API

## 📊 Component Hierarchy

```
index.tsx
  └── ChatPanel
       ├── messages-container
       │    ├── empty-state (conditional)
       │    └── messages-list
       │         └── MessageBubble (multiple)
       │              ├── message-header
       │              │    ├── message-role
       │              │    └── message-timestamp
       │              └── message-content
       └── input-area
            └── input-container
                 ├── message-input
                 └── button-group
                      ├── btn-primary (Send)
                      └── btn-secondary (Clear)
```

## 🔐 Security Considerations (Future)

When implementing STEP 2+:
- ✅ Use Content Security Policy in webview
- ✅ Sanitize all user input
- ✅ Validate messages from extension
- ✅ Use nonces for script loading
- ✅ Avoid `eval()` and inline scripts

## 🚀 Performance Optimizations (Future)

- Virtual scrolling for long conversations
- Message pagination
- Lazy loading of old messages
- Debounced input handling
- Memoized components

---

**Current Status:** STEP 1 Complete ✅
**Next Step:** Integrate webview into `stellarRightView.ts`

