import { App } from "./app/App";
import { DEBUG_ENABLED } from "./app/Config";
import "./ui/styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("The page has no #app element");

const app = new App(root);
app.start();

if (DEBUG_ENABLED) window.vc = app.debugApi();
