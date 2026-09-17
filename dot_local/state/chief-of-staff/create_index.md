<!--
Chief of staff bundle — an Open Knowledge Format (OKF) directory.
Live state, maintained by the chief-of-staff persona. Seeded once by chezmoi
(create_) and never overwritten again; hand-seed the sections below from
what's currently open, or let them accrue in use.

Layout (one concept per file; the file path is the concept's identity):
  commitments/<slug>.md        type: owed-by-me | waiting-on
  in-flight/<slug>.md          type: in-flight
  decisions/<date>-<slug>.md   type: decision
  people/<handle>.md           type: person
  archive/                     closed commitments and in-flight, moved here

Each file carries YAML frontmatter (type required; add title, and the dates and
pointers that apply — due, since, resource, tags, timestamp) and a markdown
body. Link concepts with ordinary markdown links — an owed item links to the
person it's owed to and to its source — so the bundle forms a graph. The
subdirectories are created as items arise; only this index is seeded.

This index is the roll-up read at session start: one line per open item,
each linking to its file. Keep it current; it is the only file read on open.
-->

# Chief of staff

## Owed by me

## Waiting on

## In flight

## Decisions

## People
