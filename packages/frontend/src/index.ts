import HexViewMode from "./views/HexViewMode.vue";
import type { FrontendSDK } from "./types";

import "./styles/index.css";

// Parse HTTP raw data to check for body
const parseHttpRaw = (raw: string) => {
  if (!raw) return null;

  const parts = raw.split("\r\n\r\n");
  if (parts.length < 2) return null;

  const body = parts.slice(1).join("\r\n\r\n");

  return { body };
};

export const init = (sdk: FrontendSDK) => {
  const condition = (data: any): boolean => {
    return true; // Show Hex ViewMode for all requests/responses
  };

  sdk.httpHistory?.addRequestViewMode({
    label: "Hex",
    view: {
      component: HexViewMode,
    },
    condition,
  });

  sdk.replay?.addRequestViewMode({
    label: "Hex",
    view: {
      component: HexViewMode,
    },
    condition,
  });

  sdk.search?.addRequestViewMode({
    label: "Hex",
    view: {
      component: HexViewMode,
    },
    condition,
  });

  sdk.sitemap?.addRequestViewMode({
    label: "Hex",
    view: {
      component: HexViewMode,
    },
    condition,
  });
};
