# Tasks Generator Feature

This feature allows VS Code users to automatically generate a structured `tasks.md` file from `requirements.md` and `design.md` files in their workspace.

## How to Use

1. **Open a workspace** in VS Code
2. **Create requirements.md** in your workspace root with your project requirements
3. **Optionally create design.md** with design specifications
4. **Run the command**: Open Command Palette (Ctrl+Shift+P) and search for "Generate Tasks from Requirements"
5. **Review the generated tasks.md** file

## Requirements.md Format

Structure your requirements file like this:

```markdown
# Project Requirements

## Feature Name
**Priority:** high|medium|low

Feature description goes here.

**Acceptance Criteria:**
- Criterion 1
- Criterion 2
- Criterion 3

## Another Feature
**Priority:** medium

Another feature description.

**Acceptance Criteria:**
- More criteria
```

## Design.md Format

Structure your design file like this:

```markdown
# Design Specification

## Architecture

Description of the overall architecture.

## Components

- Component1: Description
- Component2: Description

## UI Requirements

- Responsive design
- Accessibility features

## Tech Stack

- Technology 1
- Technology 2
```

## Generated Tasks.md

The generated file includes:
- **Summary**: Total tasks, requirements, and estimated hours
- **Requirements section**: All parsed requirements with priorities and acceptance criteria
- **Tasks section**: Ordered list of implementation tasks with:
  - Unique task IDs
  - Dependencies between tasks
  - Time estimates
  - Links back to requirements
  - Implementation details (tests, accessibility, etc.)
  - Progress tracking checkboxes

## Features

- **Dependency ordering**: Tasks are automatically ordered based on dependencies
- **Time estimation**: Automatic estimation based on complexity and priority
- **Implementation planning**: Each task includes details about testing, accessibility, and responsive design needs
- **Progress tracking**: Each task has a checkbox for tracking completion
- **Requirement linking**: Clear links between tasks and their originating requirements

## Example Output

```markdown
# Implementation Tasks

## Summary
- **Total Tasks**: 4
- **Total Requirements**: 3
- **Estimated Hours**: 25

## Tasks

### 1. Foundation Setup
**ID**: `foundation-setup`
**Estimated Hours**: 4

Set up project foundation, dependencies, and basic structure

**Implementation Details:**
- Unit Tests: ✓
- Integration Tests: ✗
- Loading States: ✗
- Accessibility: ✗
- Responsiveness: ✗

**Status**: [ ] Not Started

### 2. Implement User Authentication
**ID**: `task-user-authentication`
**Estimated Hours**: 8

[... rest of task details ...]
```

This feature helps teams create structured, trackable implementation plans from their requirements and design documents.