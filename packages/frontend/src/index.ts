import type { FrontendSDK } from "./types";
import HexViewMode from "./views/HexViewMode.vue";
import "./styles/index.css";

export const init = (sdk: FrontendSDK) => {
  const condition = (data: any): boolean => {
    return !!data?.raw; // Show Hex ViewMode only when raw data exists
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
