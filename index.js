/**
 * Host half of dsh-session-terminal.
 *
 * The launcher runs entirely in the browser over the terminal and sidebar
 * services (`ctx.webTerminals`, `ctx.sidebarRight`), so this half registers
 * nothing and owns no Host state. It exists so the bundle has a Loader row and
 * appears in the plugin inventory.
 */
export function apply() {}