import { HeroUIProvider } from "@heroui/react";
import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "@/style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  </React.StrictMode>
);
