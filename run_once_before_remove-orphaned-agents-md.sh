#!/bin/bash

# One-time cleanup for a chezmoi orphan.
#
# AGENTS.md, CLAUDE.md, and README.md are project docs that live at the source
# root but must not be deployed to $HOME, so they're listed in .chezmoiignore.
# But an ignored path is invisible to chezmoi: it won't deploy it AND won't
# remove it, so a .chezmoiremove entry for the same path never fires. Machines
# that applied before those files were ignored are left with orphaned copies in
# $HOME that chezmoi will never clean up on its own.
#
# A run_once script is the only mechanism that reaches those other machines:
# .chezmoiremove can't touch an ignored path (or one that still has a source
# file), so this is what propagates the cleanup. Keyed by content, it runs a
# single time per machine. Safe to delete from the repo once every machine has
# applied it.

set -e

for f in AGENTS.md CLAUDE.md README.md; do
	if [ -f "$HOME/$f" ]; then
		rm -f "$HOME/$f"
		echo "Removed orphaned ~/$f (chezmoi source doc, never meant for \$HOME)"
	fi
done
