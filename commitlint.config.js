// Commit messages are load-bearing: release-please derives version bumps
// and CHANGELOG entries from them. Anything not matching Conventional
// Commits is invisible to the release (no bump, no notes) — the hook and
// CI enforce the format so silence is always deliberate, never accidental.
export default {
  extends: ['@commitlint/config-conventional'],
};
