import React from "react";
import { createRoot } from "react-dom/client";
import PublicSite from "./PublicSite.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(
  <PublicSite hostedPreview>
    <div className="site-return">
      <h3>Explore the idea. Keep your private work local.</h3>
      <p>
        This is a read-only hosting pilot, not the customer workspace. Sign-up,
        uploads, AI requests and payments are disabled. Please do not send
        private ideas through public GitHub issues.
      </p>
      <a
        className="site-cta"
        href="https://github.com/M2201/whoayo"
        target="_blank"
        rel="noopener noreferrer"
      >
        Explore the open-source project
      </a>
    </div>
  </PublicSite>,
);
