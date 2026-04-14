---
name: default
displayName: Default Bug Report Template
category: bug
version: 1.0.0
description: Standard bug report template with reproduction steps.
variables:
  - name: title
    label: Bug Title
    type: string
    required: true
  - name: severity
    label: Severity
    type: enum
    values: [blocker, critical, major, minor, trivial]
    default: major
  - name: environment
    label: Environment
    type: string
    required: false
---

# {{title}}

## Description
_Describe the bug clearly and concisely._

## Severity: {{severity:major}}

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
_What should happen._

## Actual Behavior
_What actually happens._

## Environment
{{environment:Not specified}}
- **Browser**: 
- **OS**: 
- **Version**: 

## Screenshots / Logs
_Attach screenshots, console errors, or log snippets._

## Possible Cause
_If you have any ideas about what might be causing this._

## Workaround
_Is there a temporary workaround available?_
