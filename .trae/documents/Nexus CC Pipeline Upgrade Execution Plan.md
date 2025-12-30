# Nexus CC Pipeline Upgrade Execution Plan

## Current State Analysis

✅ **Model Registry**: Already implemented with all required models (FLASH, DEEP\_THINKING 7 models, APEX 12 models)
✅ **Processing Details Overlay**: Implemented as blurred overlay with smooth animations (HoloPipeline.tsx)
✅ **Conversation Summarization**: Uses FLASH model exclusively via `/api/nexus/summarize`
✅ **Frontend Mode Labels**: Partially correct (FLASH→NEXUS\_FLASH\_PRO, DEEP\_THINKING→NEXUS\_THINKING\_PRO, APEX→NEXUS\_APEX\_OMENI)
❌ **Backend Parallel Execution**: Currently uses only first agent from each mode (not parallel)
❌ **Skip Policies**: Partial implementation but not integrated with parallel execution
❌ **Error Messages**: Generic "AI failed to generate response" still used
❌ **Retry Logic**: Circuit breaker exists but lacks exponential backoff for temporary errors
❌ **Label Consistency**: DEEP\_THINKING should be NEXUS\_DEEP\_THINKING\_PRO (currently NEXUS\_THINKING\_PRO)

## Execution Plan

### Phase 1: Backend Pipeline Enhancement

1. **Parallel Execution Implementation**

   * Modify `route.ts` to run all models in parallel for DEEP\_THINKING and APEX modes

   * Use `Promise.allSettled` with individual timeouts per model

   * Implement immediate skip policy using `shouldSkipModel()` from registry

2. **Enhanced Error Handling & Skip Policies**

   * Replace generic error messages with precise, user-friendly descriptions

   * Integrate circuit breaker with skip policies

   * Add retry logic with exponential backoff for temporary provider errors

3. **Primary → Fallback Aggregation Logic**

   * Implement fallback chain: primary model → secondary model → aggregator models

   * Ensure APEX mode uses best-performing fallback logic from DEEP\_THINKING + extended experts

4. **Warm Token Cache Optimization**

   * Verify warm cache functions are called before parallel execution

   * Add pre-ping for all models in mode to reduce cold start latency

### Phase 2: Frontend & UX Polish

1. **Mode Label Correction**

   * Update `en.json` and `ar.json`: change "NEXUS\_THINKING\_PRO" → "NEXUS\_DEEP\_THINKING\_PRO"

   * Verify all UI components display correct labels

2. **Processing Details Overlay Verification**

   * Test overlay opens without layout shifts

   * Ensure animations are smooth on desktop and mobile

   * Remove any duplicate or broken UI elements (collapse buttons, extra panels)

3. **Model List Display**

   * Ensure all models under each mode are listed in Processing Details

   * Show active/failed/skipped models with clear status indicators

### Phase 3: Conversation Summarization Robustness

1. **FLASH Model Exclusivity**

   * Confirm summarization endpoint only uses `resolveModelId("NEXUS_FLASH_PRO")`

   * Add validation to prevent accidental model switching

2. **Error Handling & Fallbacks**

   * Implement graceful degradation if FLASH model fails

   * Provide clear user feedback for summarization failures

### Phase 4: Stability & Verification

1. **Clean Build Preparation**

   * Delete `.next` folder before rebuild

   * Run `npm run lint`, `npm run typecheck`, `npm run build`

2. **End-to-End Testing**

   * Test all modes (FLASH, DEEP\_THINKING, APEX) with various query types

   * Verify Processing Details overlay functionality

   * Test conversation summarization with multiple message lengths

   * Ensure "AI failed to generate response" only appears when ALL models fail

3. **Performance & Reliability**

   * Verify circuit breaker prevents system overload

   * Test skip policies with simulated slow/failing models

   * Ensure backend model IDs never appear in UI (only frontend names)

## Success Criteria

* All AI modes work correctly with parallel execution where applicable

* Any model failure/timeout triggers immediate skip to next available model

* UX is smooth with no layout shifts or broken elements

* Backend is stable with circuit breaker and retry logic

* Conversation summarization works flawlessly using only FLASH model

* Clean build passes linting, type checking, and build verification

* End-to-end tests pass for desktop and mobile

## Estimated Implementation Time

* Phase 1: 3-4 hours

* Phase 2: 1-2 hours

* Phase 3: 1 hour

* Phase 4: 2 hours

* **Total**: 7-9 hours

## Risks & Mitigations

* **Risk**: Parallel execution may overload API rate limits

  * **Mitigation**: Implement concurrency limits and staggered startup

* **Risk**: Skip policies may cause premature abandonment of viable models

  * **Mitigation**: Fine-tune timeout thresholds and add probabilistic skipping

* **Risk**: Frontend state management may not support multiple concurrent agents

  * **Mitigation**: Verify nexusStore handles parallel agent updates

