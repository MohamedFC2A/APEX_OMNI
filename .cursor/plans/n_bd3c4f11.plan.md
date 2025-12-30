---
name: "N"
overview: Comprehensive rebuild of the Nexus CC AI Pipeline with strict UX polish, backend reliability, and new Processing Details overlay. This plan addresses all requirements including mode structure, model registry, circuit breaker, warm token cache, parallel execution, and UI enhancements.
todos: []
---

# Nexus CC AI Pipeline Upgrade Plan

## Overview

Complete rebuild of the Nexus CC AI Pipeline with strict UX polish, backend reliability, and new Processing Details overlay. This addresses all requirements including mode structure, model registry, circuit breaker, warm token cache, parallel execution, and UI enhancements.

## Current State Analysis

The codebase has a solid foundation with:

1. **Frontend**: `NexusChat.tsx`, `ModePopover.tsx`, `ChatSummary.tsx` components
2. **Backend**: `/api/nexus/route.ts` with SSE streaming and mode routing
3. **Model Registry**: `modelRegistry.ts` with 3 modes (FLASH, DEEP_THINKING, APEX_OMENI)
4. **State Management**: `nexusStore.ts` with Zustand
5. **Chat Summary**: Functional but needs UI improvements

## Key Issues to Address

1. **Mode naming inconsistencies**: Current uses "standard", "thinking", "super_thinking" but needs "FLASH", "DEEP_THINKING", "APEX"
2. **Model display**: Backend IDs exposed in UI, need custom frontend names
3. **Processing Details overlay**: Missing semi-transparent curtain with collapsible lanes
4. **Circuit Breaker & Warm Cache**: Basic implementation exists but needs enhancement
5. **Parallel execution**: Needs immediate skip policy (<5% delay tolerance)
6. **Aggregation flow**: Needs primary → fallback logic per mode
7. **ChatSummary safety**: Handle `null`/`undefined` safely

## Implementation Plan

### Phase 1: Model Registry & Configuration Updates

1. **Update Model Registry** (`web/src/lib/modelRegistry.ts`):

   - Rename `APEX_OMENI` to `APEX` for consistency
   - Ensure 7 models for DEEP_THINKING, 12 models for APEX (7 + 5 experts)
   - Add proper frontend display names vs backend IDs mapping
   - Add validation for OpenRouter model existence

2. **Update ModePopover** (`web/src/components/ModePopover.tsx`):

   - Change mode values to "FLASH", "DEEP_THINKING", "APEX"
   - Update model lists to show proper frontend names
   - Remove duplicate UI buttons and clutter

3. **Update NexusChat** (`web/src/components/NexusChat.tsx`):

   - Update mode mapping from frontend to backend
   - Ensure backend IDs are never exposed in UI

### Phase 2: Backend Pipeline Logic

1. **Enhance Circuit Breaker** (`web/src/app/api/nexus/route.ts`):

   - Improve failure tracking with exponential backoff
   - Add warm token cache for all models (not just FLASH)
   - Implement immediate skip policy (<5% delay tolerance)

2. **Implement Aggregation Flow**:

   - **FLASH**: Use xiaomi/mimo-v2-flash exclusively
   - **DEEP_THINKING**: Use fastest coherent model among 7
   - **APEX**: Dynamic choice between FLASH and DeepSeek V3.1 with XHigh reasoning

3. **Update Error Handling**:

   - Return `"AI failed to generate response. Please try again."` for all failures
   - Never expose raw OpenRouter IDs in error messages
   - Log active/failing models internally without user exposure

4. **Fix Summarize Conversation**:

   - Ensure uses FLASH model exclusively
   - Handle `null`/`undefined` safely in ChatSummary

### Phase 3: Frontend UI & Animation

1. **Create Processing Details Overlay** (`web/src/components/ProcessingOverlay.tsx`):

   - Semi-transparent curtain above chat (doesn't affect height/scroll)
   - Smooth fade/slide animation with Framer Motion
   - Show active model execution per lane
   - Collapsible Deep Thinking lanes independently
   - Real-time progress indicators

2. **Enhance ChatSummary** (`web/src/components/ChatSummary.tsx`):

   - Add null/undefined safety checks
   - Improve visual hierarchy and typography
   - Add more export options (copy, PDF, markdown)
   - Better responsive design

3. **Update AboutModal** (`web/src/components/AboutModal.tsx`):

   - Show mode structure clearly (FLASH, DEEP_THINKING, APEX)
   - Display associated models for each mode
   - Remove technical backend details

### Phase 4: Stability & Verification

1. **Clean Build**:

   - Remove `.next` folder
   - Run `npm run lint`, `npm run typecheck`, `npm run build`

2. **Manual Testing**:

   - Verify FLASH mode uses FLASH model
   - Verify DEEP_THINKING executes all 7 models with failover
   - Verify APEX aggregation dynamically selects fastest coherent model
   - Verify summarization works perfectly with FLASH model
   - Verify no backend IDs exposed in frontend
   - Verify overlay renders correctly without layout shifts

3. **Performance Testing**:

   - Test circuit breaker under failure conditions
   - Verify warm token cache reduces latency
   - Test parallel execution with skip policy
   - Verify error messages are user-friendly

## Technical Implementation Details

### Model Registry Structure

```typescript
// Updated structure
const MODEL_REGISTRY = {
  // FLASH mode (1 model)
  "NEXUS_FLASH_PRO": {
    id: "mimo_v2",
    name: "FLASH", // Frontend name
    model: "xiaomi/mimo-v2-flash:free", // Backend ID
    provider: "openrouter",
    timeoutMs: 2500,
  },
  // DEEP_THINKING mode (7 models)
  "olmo_think": {
    id: "olmo_think",
    name: "Olmo Think", // Frontend name
    model: "allenai/olmo-3.1-32b-think:free", // Backend ID
    provider: "openrouter",
    reasoningEffort: "High",
    timeoutMs: 10000,
    skipThreshold: 0.05,
  },
  // ... 6 more models
  // APEX mode (5 additional expert models)
  "gpt_oss_120b": {
    id: "gpt_oss_120b",
    name: "GPT-OSS 120B", // Frontend name
    model: "openai/gpt-oss-120b:free", // Backend ID
    provider: "openrouter",
    reasoningEffort: "XHigh",
    timeoutMs: 15000,
    skipThreshold: 0.05,
  },
  // ... 4 more expert models
};
```

### Processing Overlay Design

- **Position**: Fixed overlay above chat area
- **Animation**: Slide down with fade-in (300ms)
- **Content**: 
  - Mode indicator (FLASH/DEEP_THINKING/APEX)
  - Active models with progress bars
  - Collapsible sections for DEEP_THINKING lanes
  - Real-time execution status
  - Error indicators with retry options

### Circuit Breaker Enhancement

- **Failure Tracking**: Track failures per model with timestamps
- **Threshold**: 3 failures in 30 seconds triggers circuit open
- **Recovery**: Exponential backoff with 5s, 10s, 20s intervals
- **Warm Cache**: Pre-ping models on app startup and mode switch

### Parallel Execution with Skip Policy

- **Timeout**: Model-specific timeouts from registry
- **Skip Threshold**: 5% delay tolerance (skip if >105% of expected time)
- **Fallback**: Immediate switch to next fastest model
- **Aggregation**: Collect successful responses, skip failed ones

## Files to Modify

1. `web/src/lib/modelRegistry.ts` - Model definitions and mappings
2. `web/src/components/ModePopover.tsx` - Mode selection UI
3. `web/src/components/NexusChat.tsx` - Main chat component
4. `web/src/app/api/nexus/route.ts` - Backend pipeline logic
5. `web/src/components/ChatSummary.tsx` - Summary UI enhancements
6. `web/src/components/AboutModal.tsx` - About modal updates
7. **New**: `web/src/components/ProcessingOverlay.tsx` - Processing details overlay

## Success Criteria

1. ✅ Three modes displayed: FLASH, DEEP_THINKING, APEX
2. ✅ Each mode shows associated models clearly
3. ✅ Processing Details overlay works with animations
4. ✅ Circuit Breaker and Warm Token Cache functional
5. ✅ Parallel execution with immediate skip policy
6. ✅ Primary → fallback aggregation flow per mode
7. ✅ Summarize Conversation uses FLASH model reliably
8. ✅ Error messages user-friendly, no backend IDs exposed
9. ✅ ChatSummary handles null/undefined safely
10. ✅ All UI elements scale correctly on desktop/mobile
11. ✅ Clean build passes lint, typecheck, and build