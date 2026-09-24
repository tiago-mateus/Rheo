import { createRoot } from "react-dom/client";
import App from "./App";
import Studio from "./Studio";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";
import "./studio.css";
const operator =
  location.pathname.startsWith("/studio/") ||
  (location.pathname === "/" &&
    !new URLSearchParams(location.search).has("camera"));
createRoot(document.getElementById("root")!).render(
  operator ? <Studio /> : <App />,
);
