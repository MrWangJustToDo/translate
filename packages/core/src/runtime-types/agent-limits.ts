/**
 * Shared agent runtime limit constants.
 *
 * Lives in runtime-types (not managers/) so domain modules (agent/, models/)
 * can import them without violating the `agent→managers` / `models→managers`
 * boundary gates.
 */

/** Default maximum agentic-loop iterations for the main agent run loop. */
export const DEFAULT_AGENT_MAX_ITERATIONS = 10;
