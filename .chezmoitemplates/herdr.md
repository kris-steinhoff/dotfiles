## Herdr

When `$HC_TERMINAL_ID` is set you are running inside Herdr, and `hc` is available. Use it to start, watch, and talk to other agents, and to run slow work the user may want to watch, such as a build or a test suite, so they can see and steer it in Herdr. A wait that only exists to wake you, such as `watch-pr` or a timer, runs as the harness's own background command, never through `hc run`, which would give it a terminal of its own in Herdr's sidebar. Read its manual with `hc --skill` before your first use in a session.
