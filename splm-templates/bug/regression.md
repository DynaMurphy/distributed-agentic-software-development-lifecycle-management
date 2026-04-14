---
name: regression
displayName: Regression Bug Template
category: bug
version: 1.0.0
description: Template for regression bugs — features that previously worked but are now broken.
variables:
  - name: title
    label: Bug Title
    type: string
    required: true
  - name: severity
    label: Severity
    type: enum
    values: [blocker, critical, major, minor, trivial]
    default: critical
  - name: last_working_version
    label: Last Working Version
    type: string
    required: false
---

# [REGRESSION] {{title}}

## Description
_Describe the regression — what previously worked and is now broken._

## Severity: {{severity:critical}}

## Regression Details
- **Last Working Version/Commit**: {{last_working_version:Unknown}}
- **First Broken Version/Commit**: _If known_
- **Related PR/Change**: _If identified_

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior (Previously Working)
_What used to happen correctly._

## Actual Behavior (Now Broken)
_What happens now._

## Impact Assessment
- **Users Affected**: _All / Subset / Edge case_
- **Data Impact**: _None / Read-only / Data loss risk_
- **Workaround Available**: _Yes / No_

## Root Cause Analysis
_If identified, describe the likely root cause._

## Suggested Fix
_If known, describe the fix approach._

## Regression Test
_Describe the test case that should be added to prevent recurrence._
