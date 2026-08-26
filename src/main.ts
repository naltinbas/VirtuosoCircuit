// Placeholder entry; App.ts replaces this once the runtime is wired up.
import { TRACK_DEFINITIONS } from "./charts/TrackCatalog";

const ui = document.getElementById("ui");
if (ui) ui.textContent = `Virtuoso Circuit: ${TRACK_DEFINITIONS.length} tracks in the catalog`;
