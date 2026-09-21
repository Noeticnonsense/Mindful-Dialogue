import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL(
      `${import.meta.env.BASE_URL}service-worker.js`,
      window.location.origin,
    );

    navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: import.meta.env.BASE_URL })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });
  });
}
