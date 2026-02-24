---
description: 'Use when implementing accessibility features, ARIA labels, screen reader support, accessible help dialogs, or keybinding scoping for accessibility. Covers AccessibleContentProvider, CONTEXT_ACCESSIBILITY_MODE_ENABLED, verbosity settings, and announcement patterns.'
---

# Accessibility Guidelines

Accessibility is a high-priority area in VS Code. Follow these patterns to ensure features work correctly with screen readers and assistive technologies.

## Keybinding Scoping

Accessibility-specific keybindings MUST be scoped to prevent conflicts with standard shortcuts:

```typescript
keybinding: {
	primary: KeyCode.F7,
	when: ContextKeyExpr.and(
		EditorContextKeys.focus,
		CONTEXT_ACCESSIBILITY_MODE_ENABLED
	),
	weight: KeybindingWeight.WorkbenchContrib,
},
```

**Why**: Without scoping, accessibility shortcuts steal commonly used keybindings (e.g., F7 for "Go to Next Symbol Highlight"). PR #293163 fixed this exact conflict.

## Accessible Help Dialogs (Alt+F1)

Use `AccessibleContentProvider` directly — do not create custom subclasses:

```typescript
getProvider(): AccessibleContentProvider {
	return new AccessibleContentProvider(
		AccessibleViewProviderId.MyFeature,
		{ type: AccessibleViewType.Help },
		() => this.getHelpContent(),
		() => this.onClose(),
		'accessibility.verbosity.myFeature'
	);
}
```

## Announcement Patterns

When announcing state changes to screen readers:

1. **Only announce when conditions are met**: Check that a search string is present, widget is visible, and screen reader is active
2. **Prevent double-speak**: Track announcement state with a flag and use a timeout (~1 second)
3. **Use verbosity settings**: Check `accessibility.verbosity.[feature]` before verbose announcements

```typescript
if (this.accessibilityService.isScreenReaderOptimized() &&
    this.configService.getValue('accessibility.verbosity.hover') &&
    !this._accessibilityHelpHintAnnounced) {
	this._accessibilityHelpHintAnnounced = true;
	// announce hint
}
```

## Multi-Modal Notifications

For important state changes, provide all three:
1. **Audio signal**: `this.accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired)`
2. **ARIA alert**: `status(message)` for screen readers
3. **OS notification**: Respect `chat.notifyWindowOnConfirmation` setting. OS notifications are **conditional on window focus** — only fire when `targetWindow.document.hasFocus()` is `false` (see `ChatWindowNotifier`)

## Configuration

When adding a new accessible feature, register a verbosity setting:

```typescript
// In accessibility configuration
'accessibility.verbosity.myFeature': {
	type: 'boolean',
	default: true,
	description: localize('accessibility.verbosity.myFeature', "...")
}
```

And extend `AccessibleViewProviderId` and `AccessibilityVerbositySettingId` enums for new help providers.
