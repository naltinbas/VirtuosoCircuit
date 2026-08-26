# Attribution and licences

The table below comes from `src/licensing/AssetManifest.ts`, which is also what the in-game credits screen is built from. The manifest takes its track rows from the metadata in `src/charts/tracks/`. The credits screen is generated at runtime and this file is not, so if the two disagree, the metadata is right and this file has fallen behind.

Two claims are kept apart throughout. The composition is a piece of music written by somebody who has been dead long enough for it to be in the public domain. The arrangement is the note-event data in this repository, written for this game.

A composition being in the public domain does not make any particular recording of it free to use. A recording carries its own rights, held by the performers and whoever produced it, and those rights are usually much younger than the rights in the score. The question does not come up here, because the game uses no recordings.

No recordings, no third-party MIDI files, no scanned or engraved editions and no external assets of any kind are bundled with this game or fetched by it. Every note you hear is synthesized in the browser at runtime by `src/audio/SynthInstruments.ts` and `src/audio/SoundEffects.ts` from note data in this repository.

## The table

| Asset or track | Composer | Composition status | Arrangement source | Audio source | Licence and rationale | Attribution required |
| --- | --- | --- | --- | --- | --- | --- |
| Minuet in G major (bach-minuet-g) | Christian Petzold, BWV Anh. 114 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Composition: public domain. This is an original arrangement written for the game and synthesized at runtime; no recording or third-party edition is used. | No |
| Piano Sonata No. 16 in C major (mozart-k545) | Wolfgang Amadeus Mozart, K. 545 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Mozart's composition is in the public domain. This is an original arrangement of it and the note data belongs to this project. | No |
| Symphony No. 9 in D minor (beethoven-ode-to-joy) | Ludwig van Beethoven, Op. 125 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Beethoven's Symphony No. 9 (1824) is in the public domain. This is an original arrangement written for the game and rendered by its own synthesizer; no recording or third-party edition is used. | No |
| Cello Suite No. 1 in G major (bach-cello-prelude) | Johann Sebastian Bach, BWV 1007 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | The composition is in the public domain. What the game plays is an original arrangement written for it and synthesized at runtime, with no third-party editions or recordings involved. | No |
| Eine kleine Nachtmusik (mozart-nachtmusik) | Wolfgang Amadeus Mozart, K. 525 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Mozart's Serenade K. 525 (1787) is in the public domain. What the game plays is an original arrangement written for it and synthesized in the browser, with no third-party edition or recording involved. | No |
| Für Elise (beethoven-fur-elise) | Ludwig van Beethoven, WoO 59 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | The composition is in the public domain. What the game plays is an original arrangement written for it and synthesized at runtime, with no third-party editions or recordings involved. | No |
| Toccata and Fugue in D minor (bach-toccata-d-minor) | Johann Sebastian Bach, BWV 565 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | The composition is in the public domain. The note data here is an original arrangement written for this game and is covered by the project license. | No |
| Symphony No. 40 in G minor (mozart-symphony-40) | Wolfgang Amadeus Mozart, K. 550 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Composition: public domain. This is an original arrangement written for the game and synthesized at runtime; no recording or third-party edition is used. | No |
| Symphony No. 5 in C minor (beethoven-symphony-5) | Ludwig van Beethoven, Op. 67 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | The composition is in the public domain. The note data and the charts in this file are an original arrangement written for this game and are covered by the project license. | No |
| Brandenburg Concerto No. 3 in G major (bach-brandenburg-3) | Johann Sebastian Bach, BWV 1048 | Public-domain composition | Original game arrangement based on a public-domain composition (project note-event data, no external MIDI) | Web Audio synthesis at runtime | Bach died in 1750 and the composition is in the public domain. The note data in this file is an original arrangement written for this game and carries no third-party rights. | No |
| public/favicon.svg | Not applicable | Original artwork drawn for this game | Hand-written SVG in this repository | Not applicable | Part of this project's own source. No third-party rights are involved. | No |
| Interface and gameplay sounds | Not applicable | Original, written for this game | Oscillator and noise voices defined in src/audio/SoundEffects.ts | Web Audio synthesis at runtime | Generated by this project's own code. No sample libraries are used. | No |
| Interface typeface | Not applicable | Not applicable | System font stack (system-ui with platform fallbacks) | Not applicable | The page asks for fonts the player's device already has. No font file is bundled or fetched. | No |

"Attribution required" is a legal question, and the answer is no for every row. A public-domain composition imposes no duty to credit, and everything else in the table was made for this project. The composers are named anyway, here and on the credits screen.

## Source notes

Each note below is the `scoreSourceCredit` from that track's module. They record which bars are quoted from the score and which were written for the arrangement, since "arranged from" and "written in the character of" are different claims.

**Minuet in G major, BWV Anh. 114** (`src/charts/tracks/bach-minuet-g.ts`)
Written from the arranger's own knowledge of the published score; no MIDI file, edition, engraving or recording was consulted. The sixteen bars of the first strain are quoted. The second strain is written in the character of the original rather than quoted, and the closing cadence was written for this arrangement.

**Piano Sonata No. 16 in C major, K. 545** (`src/charts/tracks/mozart-k545.ts`)
Written from the arranger's own knowledge of the published score. No MIDI file, edition, engraving or recording was consulted. Bars 1 and 2 quote the opening theme; bars 3 and 4 reconstruct the answering half of the period from memory and are not guaranteed note for note. The sixteenth note transition in bars 5 to 12 is this arrangement's own figuration rather than the score's, and everything from bar 13 is a condensation written for the game.

**Symphony No. 9 in D minor, Op. 125** (`src/charts/tracks/beethoven-ode-to-joy.ts`)
Condensed from the public-domain score of the finale: the 16-bar theme in D major transcribed for this project and stated three times with a short closing cadence, no external MIDI or recording used.

**Cello Suite No. 1 in G major, BWV 1007** (`src/charts/tracks/bach-cello-prelude.ts`)
Written out from knowledge of the public-domain score: the opening bars keep the prelude's arpeggio figure and the harmonies it moves through, and the two link bars and the closing cadence were written for this arrangement in the same figure shape. No external MIDI, edition or recording was used.

**Eine kleine Nachtmusik, K. 525** (`src/charts/tracks/mozart-nachtmusik.ts`)
Written out from knowledge of the public-domain score: the opening two bars follow the movement's own gesture, and the answer, the continuation, the transition and the closing bars were written for this arrangement in the character of those pages. No external MIDI, edition or recording was used.

**Für Elise, WoO 59** (`src/charts/tracks/beethoven-fur-elise.ts`)
Written out from knowledge of the public-domain score: the melody of the A section and its left-hand arpeggios are quoted as they stand, while the two introduction bars, the pad, bass and hat parts, the octave displacement of the return, the closing chord and the number of repeats belong to this arrangement. No external MIDI, edition or recording was used.

**Toccata and Fugue in D minor, BWV 565** (`src/charts/tracks/bach-toccata-d-minor.ts`)
Written from the author's own knowledge of the published organ score. No external MIDI file, edition or recording was used.

**Symphony No. 40 in G minor, K. 550** (`src/charts/tracks/mozart-symphony-40.ts`)
Written from the arranger's own knowledge of the published score; no MIDI file, edition, engraving or recording was consulted. The three falling Eb-D sighs and the leap to Bb that open the movement are quoted. The continuation, the answering phrase, the rising sequence and the closing cadence are written in the character of those pages rather than quoted, and the accompaniment reduces the viola pulse to repeated eighth chords.

**Symphony No. 5 in C minor, Op. 67** (`src/charts/tracks/beethoven-symphony-5.ts`)
Condensed from the first movement as the arranger knows the published score; the note data was written by hand for this project and no external MIDI file, printed edition or recording was used.

**Brandenburg Concerto No. 3 in G major, BWV 1048** (`src/charts/tracks/bach-brandenburg-3.ts`)
Bars 1 to 26 of the first movement, transcribed from the public-domain score and condensed and re-scored for four synth parts. The two violin lines and the continuo bass follow the score, with the second violin line an octave down through the ritornello; the harpsichord realises the figured bass. No external MIDI file, edition or recording was used.
## Composition credits

Every piece played in this game is a public-domain composition. The works, in the order the game lists them:

| Work | Composer | Catalogue |
| --- | --- | --- |
| Minuet in G major | Christian Petzold | BWV Anh. 114 |
| Piano Sonata No. 16 in C major | Wolfgang Amadeus Mozart | K. 545 |
| Symphony No. 9 in D minor | Ludwig van Beethoven | Op. 125 |
| Cello Suite No. 1 in G major | Johann Sebastian Bach | BWV 1007 |
| Eine kleine Nachtmusik | Wolfgang Amadeus Mozart | K. 525 |
| Für Elise | Ludwig van Beethoven | WoO 59 |
| Toccata and Fugue in D minor | Johann Sebastian Bach | BWV 565 |
| Symphony No. 40 in G minor | Wolfgang Amadeus Mozart | K. 550 |
| Symphony No. 5 in C minor | Ludwig van Beethoven | Op. 67 |
| Brandenburg Concerto No. 3 in G major | Johann Sebastian Bach | BWV 1048 |

Four of these carry an attribution caveat, which the game prints on the track card and in the credits:

- Minuet in G major, BWV Anh. 114 is credited here to Christian Petzold, not to Bach. It comes from the 1725 Notebook for Anna Magdalena Bach, a household collection rather than a volume of Bach's own compositions, and it was credited to Bach long enough to be catalogued in the BWV Anhang. The BWV number is printed as well, because that is what most people will search for.
- Toccata and Fugue in D minor is published as Bach's and catalogued as BWV 565, though some scholars question the attribution.
- Für Elise was published in 1867, forty years after Beethoven's death, from a manuscript that has since been lost. Who the dedication names is still argued over.
- Cello Suite No. 1: no autograph of the cello suites survives. The piece is known from early manuscript copies, the best known of them in Anna Magdalena Bach's hand.

None of this changes the licensing position. All four compositions are old enough to be in the public domain whichever way the attribution falls.

## Arrangement and audio credits

The note-event data for all ten tracks was written for this project. Each module carries the same credit line:

> Original game arrangement based on a public-domain composition, written for Virtuoso Circuit

`tests/tracks.test.ts` pins that string, so a track that drifts from it fails the suite.

- The arrangements are typed out as beats and pitches in `src/charts/tracks/`, in the notation described in `docs/chart-format.md`. They are source code, covered by the project licence in `LICENSE` like any other file here.
- No MIDI file was imported, converted or traced. No engraving software output was used. No printed or scanned edition was digitised.
- The charts, meaning which lanes you press and when, are original work as well, written against the arrangements rather than derived from anything.
- Sound is produced by oscillators, noise buffers, filters and gain envelopes built at runtime in `src/audio/SynthInstruments.ts`. There are no samples, sample libraries or recorded instruments anywhere in this project.
- The interface sounds in `src/audio/SoundEffects.ts` are synthesized the same way, from the same graph.
- `public/favicon.svg` is hand-written SVG. The interface uses the system font stack declared as `--font-stack` in `src/ui/styles.css`, so no font file is bundled or downloaded.

## Sources and links

This file has no external links. Verifying a public-domain claim means opening a source and reading it, and no such check was run from this machine, so no URL is pasted in here. Anyone reviewing these claims should look up the composers' dates and the catalogue numbers themselves.
