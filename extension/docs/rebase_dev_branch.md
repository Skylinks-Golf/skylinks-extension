# Rebasing a dev branch onto the module refactor

**For:** the Claude agent working with a module builder (first use: LC's `dev-lc`). **Written:** 2026-11-18 by Ian's agent. Read `AGENTS.md` and `PROTOCOLS.md` first; their rules win over this file. Once every dev branch has been rebased, Ian deletes this file.

## What changed on `main`

The extension is now built from modules (`extension/modules/<id>/module.js`, listed in `modules/index.js`), and the repo check enforces two new rules:

1. Every `host_permissions` entry in `manifest.json` must belong to a module (its `hosts` or `extraHosts`).
2. Every new host or permission must be listed under `pending` in `scripts/approved-permissions.json`, with the module and a reason. A branch push passes with a notice; the pull request to `main` fails until Ian clears `pending`. That is Ian's approval, so don't try to avoid it, and never move entries into the approved lists yourself.

Builders no longer need Ian's OK to add a host or permission for their module. Ian approves them at the merge.

## When to do this

Only after Ian says the module-registry PR (#27) is merged. Check that `extension/modules/registry.js` exists on `origin/main` after `git fetch`. If it doesn't, stop and wait.

## Steps

1. **Tell the person in plain words** what you are about to do: move their branch so it sits on top of the latest `main`, which rewrites the branch's history on GitHub. Get a yes.
2. **Save the work.** Commit or stash anything uncommitted. Then make a backup branch of the current state: `git branch backup/<branch>-<date>` (for example `backup/dev-lc-2026-11-18`). This is the undo path.
3. **Rebase:** `git fetch origin`, then `git rebase origin/main`.
4. **Resolve conflicts.** Git replays the branch's commits one at a time, so the same two files can conflict again on each commit. Resolve each stop, `git add` the files, then `git rebase --continue`. For `dev-lc` (two commits) expect `manifest.json` on the first commit, then `manifest.json` and `CHANGELOG.md` on the second:
   - `extension/manifest.json`: start from `main`'s version and re-apply only what your branch added. Keep every host `main` already has (including `https://www.sipmarket.com/*`, already approved). Add the hosts your branch needs (`sfnaturals.pepr.app`, `shop.sgproof.com` for `dev-lc`). Set `version` to one higher than the number now at the top of `CHANGELOG.md` on `main` (1.13 right after #27). On the commit that only bumps the version, keep the new number and drop your old one.
   - `extension/CHANGELOG.md`: keep `main`'s entries and put your entry on top under the new version number, with the same text. Don't leave your entry under a version number `main` already used.
   - Any other conflict: read both sides, keep both intents, and tell the person what you decided. If you aren't sure, stop and ask Ian.
5. **Declare the hosts.** In the module that uses them (for `dev-lc`, `extension/modules/orders/module.js`) add each new host to `extraHosts`, for example `extraHosts: ['www.sipmarket.com', 'sfnaturals.pepr.app', 'shop.sgproof.com']`. Only hosts that show tool buttons go in `hosts`.
6. **List new permissions as pending.** In `scripts/approved-permissions.json` add one entry per new host under `pending`:
   ```json
   { "type": "host_permissions", "value": "https://shop.sgproof.com/*", "module": "orders", "reason": "Southern Wine portal cart fill" }
   ```
   This is the only change to `scripts/` you may make. Don't edit anything else in that folder, and don't edit or skip a check.
7. **Run the check:** `node scripts/check-repo.js`. Before steps 5 and 6 it fails on each new host (not declared by a module, not listed). After them it passes, with a note that permissions will need Ian's approval at the merge. (Ian dry-ran this on a copy of `dev-lc`.) If it fails for a reason not covered here, stop and ask Ian.
8. **Finish the rebase** (`git rebase --continue` after each conflict) and check `git log --oneline origin/main..HEAD` shows only the branch's own commits.
9. **Push.** Say exactly what will be replaced: the branch on GitHub will be rewritten to the rebased version, and the old version is kept only in the local backup branch. Ask the person to type "approve". Then `git push --force-with-lease origin <branch>` (the dev branch only, never `main`).
10. **Give the person test steps** (testing is a person's job): reload the extension at `chrome://extensions`, open the popup on any page and check the Pro Shop Orders buttons are there, open *This Week's Order*, and confirm the feature behaves as before. Report what they actually saw.

## Undo

- Before the push: `git rebase --abort`, or `git reset --hard backup/<branch>-<date>` (that needs "approve" because it discards work).
- After the push: `git push --force-with-lease origin backup/<branch>-<date>:<branch>` restores the old version (also needs "approve").

## Other branches

`lc/order-run-sync` only changes `artifacts/order-run/` and rebases onto `main` with no conflicts. It follows the normal rules: Ian reviews its PR.
