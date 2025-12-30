I will proceed with the strict execution plan to finalize the Nexus CC Pipeline upgrade.

## 1. Frontend Updates - Mode & Model Display
I will update `ModePopover.tsx` and `AboutModal.tsx` to clearly list the specific models powering each mode, ensuring transparency and "no duplication" as requested.

### `ModePopover.tsx` & `AboutModal.tsx`
*   **FLASH**: 
    *   Label: `NEXUS_FLASH_PRO`
    *   Models: `Mimo V2 Flash`
*   **DEEP_THINKING**:
    *   Label: `NEXUS_THINKING_PRO`
    *   Models: `Olmo Think`, `Nemotron`, `Llama 3.3`, `Devstral`, `DeepSeek R1-Distill`, `DeepSeek V3.1`, `GPT-OSS 20B`
*   **APEX**:
    *   Label: `NEXUS_APEX_OMENI`
    *   Models: All Thinking models + `GPT-OSS 120B`, `Kat Coder`, `DeepSeek R1`, `Qwen Coder`, `Hermes 405B`

## 2. Backend Verification & Cleanup
*   **Summary Route**: Confirmed usage of `NEXUS_FLASH_PRO` (`mimo-v2-flash`) for summaries.
*   **Pipeline Route**: Confirmed parallel execution, circuit breaker, and failover logic.
*   **Build Cleanup**: I will explicitly delete the `.next` folder before building to ensure a clean slate.

## 3. Execution Steps
1.  **Modify `ModePopover.tsx`**: Add the list of models to each mode's display.
2.  **Modify `AboutModal.tsx`**: Update the mode descriptions to include the model lists.
3.  **Clean Build**:
    *   Delete `web/.next`
    *   Run `npm run build`
4.  **Final Verification**: Confirm successful build.

This plan addresses all remaining constraints ("list all associated models clearly", "Summarize... works correctly", "Remove .next folder").