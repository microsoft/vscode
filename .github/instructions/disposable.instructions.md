---
description: Guidelines for writing code using IDisposable pattern for resource management and lifecycle control
---

# IDisposable Pattern Overview

## Purpose

The IDisposable pattern in VS Code provides a standardized way to manage the lifecycle of resources that need explicit cleanup. This includes event listeners, file system watchers, providers, and other resources that could cause memory leaks if not properly disposed. The pattern ensures deterministic cleanup and prevents resource leaks by providing a consistent interface for releasing resources.

## Scope

- **Included**: Resource lifecycle management, event listener cleanup, provider registration/unregistration, memory leak prevention, automatic cleanup through disposal hierarchies
- **Out of scope**: Garbage collection, automatic memory management for regular objects, browser-specific disposal patterns
- **Integration points**: Used throughout VS Code's architecture - base layer, platform services, editor components, workbench contributions, and extensions

## Architecture

### High-Level Design

The disposable pattern follows a hierarchical cleanup model where parent disposables automatically clean up their children. The design uses composition over inheritance, with `DisposableStore` managing collections of disposables and `Disposable` base class providing automatic registration.

```
IDisposable (interface)
├── Disposable (abstract base class)
│   └── _store: DisposableStore
├── DisposableStore (collection manager)
├── MutableDisposable<T> (single mutable value)
├── DisposableMap<K,V> (key-value store)
└── Helper functions (dispose, toDisposable, combinedDisposable)
```

### Key Classes & Interfaces

- **IDisposable**: Core interface with single `dispose(): void` method for resource cleanup
- **Disposable**: Abstract base class that provides `_store` and `_register()` for automatic child management
- **DisposableStore**: Collection manager for multiple disposables with safe add/remove operations
- **MutableDisposable<T>**: Manages a single disposable value that can be replaced, automatically disposing the previous value
- **DisposableMap<K,V>**: Map that manages disposable values and automatically disposes them on replacement or removal

### Key Files

List of all key files and their purposes:

- **`src/vs/base/common/lifecycle.ts`**: Core disposable infrastructure with IDisposable interface, DisposableStore, Disposable base class, MutableDisposable, DisposableMap, and helper functions
- **`src/vs/base/test/common/lifecycle.test.ts`**: Comprehensive tests for disposable pattern including edge cases and error handling
- **`.eslint-plugin-local/code-no-potentially-unsafe-disposables.ts`**: ESLint rule to detect potentially unsafe usage of DisposableStore and MutableDisposable
- **`extensions/*/src/util/dispose.ts`**: Extension-specific disposable utilities that mirror the core pattern for extension development

## Development Guidelines

### Core Principles
- **Always dispose**: Every created disposable must be disposed either explicitly or by registering with a parent
- **Register immediately**: Use `this._register(new SomeDisposable())` pattern to ensure automatic cleanup
- **Hierarchical cleanup**: Parent disposables should clean up their children automatically
- **Error resilience**: Disposal should handle errors gracefully and continue disposing other resources

### Common Patterns
- **Base class usage**: Extend `Disposable` and use `this._register()` for automatic child management
- **Store collections**: Use `DisposableStore` for managing multiple disposables safely
- **Mutable resources**: Use `MutableDisposable<T>` for resources that may change over time
- **Helper creation**: Use `toDisposable(() => { /* cleanup */ })` for simple cleanup functions

### Anti-patterns to Avoid
- **Manual arrays**: Don't use `IDisposable[]` - use `DisposableStore` instead for better error handling
- **Self-registration**: Never register a disposable on itself
- **Double disposal**: DisposableStore handles multiple disposal attempts safely
- **Disposal after disposed**: Adding to a disposed store will leak resources

## Learnings

