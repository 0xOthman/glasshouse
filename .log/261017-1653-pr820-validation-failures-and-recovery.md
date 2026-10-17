# 261017-1653 - Failed PR 820 validation runs and recovery

## Existing upload cleanup failure

The first complete validation attempt passed 80 of 81 suites on Node 22.15.1
and Node 16.20.2. test/test-routes.js:1191 failed: an upload aborted before its
file opened left an upload-*.ipk in staging. The last proved-good actions were
the live Home restore/enable/arrange/hold-Home checks and the new Home/browser
regressions. The failure was reproduced in isolation and in an untouched
`git archive` of original head 33aea43. Routes and their tests had not been
changed at this point, so the Home fixes were not the cause.

The route registered disconnect listeners only inside prepareUpload's
asynchronous callback. The existing test can emit aborted while the disk-space
probe still runs. A separate real HTTP request, disconnected before a delayed
reservation returned, left aborted.ipk on the original route. This establishes
the mechanism beyond the synthetic request fixture. Registering the listener
before reservation, then releasing a completed reservation when disconnected,
left no file in the same real-HTTP reproduction. The existing routes test and
both final 81-suite runs passed afterwards. Three real interrupted uploads on
the Office TV also left its staging inventory unchanged. No package install
was initiated by these probes.

## Live runner start and arranging failures

A probe started immediately after the second server restart failed with
ECONNREFUSED before its initial status read. Last good action: all four files
had been moved into place and tvwebctl restart returned success. No scenario
settings were written. The runner was changed to wait for the port before
starting its scenario; the deployed files were subsequently hash-verified.

The next run restored settings successfully, but its injected arrange sequence
did not save an Apps order. The precise rejected key or page timing was not
established. A server-driven page reload during the short post-launch wait is
a candidate, not a proved cause. Its cleanup could relaunch an arranging view
after posting the saved layout, allowing an in-memory arrange save to follow
the restore. A later status read showed a changed Apps order. The physical
panel was captured to establish that long OK entered arranging; the sequence
then passed with a 6.5-second post-launch wait and 250 ms between keys.

Recovery first ended arranging and allowed its save to finish, then restored
the layout from the original pre-review archive, relaunched normally and
verified exact layout equality. The final live scenario passed settings and
key restoration, arranging, hold/short Home and interrupted uploads. The server
config remained byte-identical to the archive; all four deployed source
hashes match the final checkout. Final state: Home enabled/active/guarded,
original layout and snapshot, four channels, G1 hidden, Apps order unpinned.
No ambiguous write remains in the final checked state.

## Tooling setup failures

The first strict documentation build lacked markdown-callouts and stopped at
configuration loading. Re-running with the exact three dependency ranges in
.github/workflows/docs.yml passed. Two preliminary filesystem probes ran from
the parent instead of the checkout and exited with missing paths/modules;
they made no writes. Two documentation patches failed context verification
before any file was changed; a corrected patch applied cleanly. A read-only
SSH status command returned exit 1 from tvwebctl's trailing optional-file check
while its output showed the server and watchdog running. Subsequent health
and API checks passed. None of these failures required a production workaround.
