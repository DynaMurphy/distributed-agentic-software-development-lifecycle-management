---
name: api-endpoint
displayName: API Endpoint Feature Template
category: feature
version: 1.0.0
description: Template for API endpoint features with request/response schemas.
variables:
  - name: title
    label: Feature Title
    type: string
    required: true
  - name: method
    label: HTTP Method
    type: enum
    values: [GET, POST, PUT, PATCH, DELETE]
    required: true
  - name: path
    label: Endpoint Path
    type: string
    required: true
  - name: description
    label: Description
    type: string
    required: false
---

# {{title}}

## Summary
{{description:Describe the API endpoint and its purpose.}}

## Endpoint Definition
- **Method**: `{{method:GET}}`
- **Path**: `{{path:/api/v1/resource}}`
- **Authentication**: Required
- **Rate Limit**: Standard

## Request Schema
```json
{
  "param1": "string",
  "param2": 0
}
```

## Response Schema
### Success (200)
```json
{
  "data": {},
  "message": "Success"
}
```

### Error Responses
| Status | Description |
|--------|-------------|
| 400 | Bad Request — Invalid parameters |
| 401 | Unauthorized — Missing or invalid token |
| 404 | Not Found — Resource does not exist |
| 500 | Internal Server Error |

## Acceptance Criteria
- [ ] Endpoint responds with correct schema
- [ ] Authentication is enforced
- [ ] Input validation returns 400 with descriptive errors
- [ ] Rate limiting is applied
- [ ] Response times are under 200ms (p95)

## Technical Notes
_Database queries, caching strategy, external service dependencies._
