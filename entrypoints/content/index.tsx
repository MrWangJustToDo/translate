import { HeroUIProvider, ToastProvider } from "@heroui/react";
import ReactDOM from "react-dom/client";

import App from "./App";

import "@/style.css";

import type { Root } from "react-dom/client";

// https://www.chrismytton.com/plain-text-websites/
export default defineContentScript({
  matches: ["*://*/*"],
  main(ctx) {
    const ui = createIntegratedUi(ctx, {
      position: "inline",
      anchor: "html",
      onMount: (container) => {
        // 确保容器不会影响页面布局
        container.style.position = "fixed";
        container.style.left = "0";
        container.style.top = "0";
        container.style.width = "0";
        container.style.height = "0";
        container.style.overflow = "visible";
        container.style.zIndex = "9999999";

        container.setAttribute("data-translate", "true");

        const root = ReactDOM.createRoot(container);
        root.render(
          <HeroUIProvider>
            <ToastProvider />
            <App />
          </HeroUIProvider>
        );

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        import("../../devtool").then(() => {
          // window?.__MY_REACT_DEVTOOL_FORWARD__?.();
        });

        injectScript("/devtool/index.js");

        return root;
      },
      onRemove: (root?: Root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
