/**
 * Menu session agent — API layer.
 *
 * Thin re-export from the shared agent SDK plus session-specific helpers.
 * All agent protocol logic lives in @gac/agent-sdk.
 */

export {
    insideIframe,
    setupAgent,
    reportStatus,
    onContent,
    openDisplayStream,
    getImageUrl,
} from '@gac/agent-sdk';
