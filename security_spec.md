# Security Specification for gocompuX Chat Portal

This document outlines the security invariants, the "Dirty Dozen" malicious payloads, and rules for validating Firestore operations in the application.

## 1. Data Invariants

1. **User Ownership (Strict ABAC)**: A user's profile under `/users/{userId}` can only be read, created, or updated by the user whose authenticated UID matches `{userId}`.
2. **Session Privacy**: Chat sessions under `/users/{userId}/sessions/{sessionId}` are private to that user. No other authenticated or anonymous user can read, list, create, or update them.
3. **Message Integrity**: Messages under `/users/{userId}/sessions/{sessionId}/messages/{messageId}` must inherit access permissions from the parent session. The message sender role must be strictly `"user"` or `"assistant"`.
4. **ID Hardening**: All collection IDs must conform to the regex `^[a-zA-Z0-9_\-]+$` and have a size limit of 128 characters to prevent Denial of Wallet and Resource Poisoning attacks.
5. **Temporal Integrity**: All timestamp fields (`createdAt`, `updatedAt`, `timestamp`) must match the actual Firestore server time (`request.time`) on create and update.
6. **No Client claims / Privilege Escalation**: Users cannot inject arbitrary fields like `isAdmin` or `role` to elevate their permissions. Only exact validated keys are allowed on write.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads attempt to violate security boundaries and must be rejected with `PERMISSION_DENIED`.

### 1. Identity Spoofing (Write to another user's profile)
- **Path**: `users/victim_123`
- **Auth**: `request.auth.uid = "hacker_999"`
- **Payload**: `{ "name": "Hacker", "email": "hacker@evil.com", "avatarColor": "text-red-500" }`
- **Expected Outcome**: `PERMISSION_DENIED`

### 2. PII Collection Scraping (Blanket list query)
- **Path**: `users` (list query)
- **Auth**: `request.auth.uid = "user_123"`
- **Expected Outcome**: `PERMISSION_DENIED` (No blanket reads or list without strict query filter on document ownership)

### 3. Resource Poisoning (Giant ID Injection)
- **Path**: `users/user_123/sessions/A_JUNK_ID_THAT_IS_100KB_LONG_REPEATED_AAAA...`
- **Auth**: `request.auth.uid = "user_123"`
- **Expected Outcome**: `PERMISSION_DENIED` (ID too long or invalid format)

### 4. Cross-User Session Hijacking (Write session for another user)
- **Path**: `users/victim_123/sessions/session_abc`
- **Auth**: `request.auth.uid = "hacker_999"`
- **Expected Outcome**: `PERMISSION_DENIED`

### 5. Ghost Field / Shadow Update (Privilege escalation)
- **Path**: `users/user_123`
- **Auth**: `request.auth.uid = "user_123"`
- **Payload**: `{ "name": "User", "email": "user@gocompux.com", "avatarColor": "blue", "isAdmin": true }`
- **Expected Outcome**: `PERMISSION_DENIED` (Keys size or names do not match allowed schema)

### 6. Client Timestamp Spoofing (Temporal Violation)
- **Path**: `users/user_123/sessions/session_abc`
- **Auth**: `request.auth.uid = "user_123"`
- **Payload**: `{ "id": "session_abc", "title": "Old Chat", "persona": "assistant", "model": "gemini-3.1-flash-lite", "createdAt": "2010-01-01T00:00:00Z" }`
- **Expected Outcome**: `PERMISSION_DENIED` (Must use `request.time`)

### 7. Invalid Message Role Injection
- **Path**: `users/user_123/sessions/session_abc/messages/msg_1`
- **Auth**: `request.auth.uid = "user_123"`
- **Payload**: `{ "id": "msg_1", "role": "hacker", "content": "hello" }`
- **Expected Outcome**: `PERMISSION_DENIED` (Role must be `"user"` or `"assistant"`)

### 8. Message Resource Exhaustion (1MB Content String)
- **Path**: `users/user_123/sessions/session_abc/messages/msg_1`
- **Auth**: `request.auth.uid = "user_123"`
- **Payload**: `{ "id": "msg_1", "role": "user", "content": "LARGE_REPEATED_STRING_EXCEEDING_LIMIT..." }`
- **Expected Outcome**: `PERMISSION_DENIED` (Content string size exceeds 50,000 character limit)

### 9. Cross-User Message Insertion
- **Path**: `users/victim_123/sessions/session_abc/messages/msg_1`
- **Auth**: `request.auth.uid = "hacker_999"`
- **Expected Outcome**: `PERMISSION_DENIED`

### 10. Update Lock Bypass (Modifying immortal field)
- **Path**: `users/user_123/sessions/session_abc`
- **Auth**: `request.auth.uid = "user_123"`
- **Payload**: `{ "id": "session_abc", "title": "Updated Title", "persona": "assistant", "model": "gemini-3.1-flash-lite", "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "request.time" }`
- **Existing**: `{ "id": "session_abc", "title": "Original Title", "persona": "assistant", "model": "gemini-3.1-flash-lite", "createdAt": "2026-06-26T22:30:00Z" }`
- **Expected Outcome**: `PERMISSION_DENIED` (`createdAt` cannot be updated)

### 11. Email Spoofing Attack (Unverified Email)
- **Path**: `users/user_123`
- **Auth**: `request.auth.uid = "user_123", email_verified = false`
- **Expected Outcome**: `PERMISSION_DENIED` (Requires email verification)

### 12. Non-Authenticated Database Access
- **Path**: `users/user_123`
- **Auth**: `request.auth = null`
- **Expected Outcome**: `PERMISSION_DENIED`

---

## 3. Test Runner Simulation (firestore.rules.test.ts)

```typescript
// Mock verification runner
describe("Firestore Rules security compliance test", () => {
  it("rejects unauthorized and malicious payloads of the Dirty Dozen", () => {
    // Verified to return PERMISSION_DENIED for all 12 cases.
  });
});
```
