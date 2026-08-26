// Credits and licenses.
//
// The composition and the arrangement are two different things and are
// credited separately: the pieces are public domain, the note data and the
// sound are this project's own. The table at the bottom is the manifest, the
// same rows ATTRIBUTION_AND_LICENSES.md carries.

import type { AppApi } from "../app/App";
import { TRACK_DEFINITIONS } from "../charts/TrackCatalog";
import {
  ARRANGEMENT_SOURCE,
  AUDIO_SOURCE,
  COMPOSITION_STATUS,
  MANIFEST_COLUMNS,
  buildManifest,
} from "../licensing/AssetManifest";
import { PREMISE } from "./MainMenu";
import { button, el, type Screen } from "./UIManager";

const SUMMARY =
  "Nothing is downloaded while the game runs. Every sound is synthesized in the browser from note data written for this project.";

export class CreditsPanel implements Screen {
  readonly element: HTMLElement;

  private readonly app: AppApi;

  constructor(app: AppApi) {
    this.app = app;
    this.element = el("section", { className: "screen screen--panel screen--credits" });
    this.element.setAttribute("aria-label", "Credits and licenses");

    const header = el("header", { className: "screen__header" });
    header.append(
      el("h2", { className: "screen__title", text: "Credits and licenses" }),
      el("p", { className: "screen__note", text: PREMISE }),
      el("p", { className: "screen__note", text: SUMMARY }),
    );

    const actions = el("div", { className: "screen__actions" });
    actions.append(button("Back", () => this.app.router.back(), { autofocus: true }));

    this.element.append(
      header,
      this.compositionSection(),
      this.arrangementSection(),
      this.manifestSection(),
      actions,
    );
  }

  private compositionSection(): HTMLElement {
    const section = el("section", { className: "panel-group" });
    section.append(
      el("h3", { className: "panel-group__title", text: "Composition credits" }),
      el("p", { className: "screen__note", text: `Every piece played here is a ${COMPOSITION_STATUS.toLowerCase()}.` }),
    );
    if (TRACK_DEFINITIONS.length === 0) {
      section.append(el("p", { className: "screen__note", text: "No performances are in the catalog yet." }));
      return section;
    }
    const list = el("dl", { className: "reference" });
    for (const def of TRACK_DEFINITIONS) {
      const m = def.metadata;
      const title = m.catalogNumber ? `${m.title}, ${m.catalogNumber}` : m.title;
      const lines = [`${m.composer}. ${m.movementOrExcerpt}. ${m.scoreSourceCredit}`];
      if (m.attributionNote !== undefined) lines.push(m.attributionNote);
      list.append(el("dt", { text: title }), el("dd", { text: lines.join(" ") }));
    }
    section.append(list);
    return section;
  }

  private arrangementSection(): HTMLElement {
    const section = el("section", { className: "panel-group" });
    section.append(
      el("h3", { className: "panel-group__title", text: "Arrangement and audio credits" }),
      el("p", { className: "screen__note", text: `${ARRANGEMENT_SOURCE}. ${AUDIO_SOURCE}.` }),
    );
    const list = el("dl", { className: "reference" });
    for (const def of TRACK_DEFINITIONS) {
      const m = def.metadata;
      list.append(el("dt", { text: m.title }), el("dd", { text: `${m.arrangementStyle}. ${m.arrangementCredit}` }));
    }
    list.append(
      el("dt", { text: "Interface and gameplay sounds" }),
      el("dd", { text: "Original oscillator and noise voices written for this game." }),
      el("dt", { text: "Art and type" }),
      el("dd", { text: "Hand-drawn SVG icon, canvas drawing, and the fonts your system already has." }),
    );
    section.append(list);
    return section;
  }

  private manifestSection(): HTMLElement {
    const section = el("section", { className: "panel-group" });
    section.append(
      el("h3", { className: "panel-group__title", text: "Asset manifest" }),
      el("p", {
        className: "screen__note",
        text: "No asset here requires attribution. The composers are named because it is worth knowing.",
      }),
    );

    const table = el("table", { className: "manifest" });
    const head = el("thead");
    const headRow = el("tr");
    for (const column of MANIFEST_COLUMNS) headRow.append(el("th", { text: column.label }));
    head.append(headRow);
    const body = el("tbody");
    for (const entry of buildManifest(TRACK_DEFINITIONS)) {
      const row = el("tr");
      for (const column of MANIFEST_COLUMNS) {
        const cell = el("td", { text: `${entry[column.key]}` });
        if (column.key === "asset" && entry.attributionNote !== undefined) {
          cell.append(el("span", { className: "manifest__note", text: entry.attributionNote }));
        }
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);

    const scroller = el("div", { className: "manifest__scroll" });
    scroller.append(table);
    section.append(scroller);
    return section;
  }
}
